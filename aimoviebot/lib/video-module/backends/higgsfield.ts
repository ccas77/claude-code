import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ASPECT_RATIO, GENERATE_AUDIO, MODELS } from "../config";
import { getValidAccessToken, HiggsfieldNotConnected, MCP_URL } from "./higgsfield-oauth";

// Higgsfield client based on the proven my-toolkit/tslides pattern. Uses
// the official @modelcontextprotocol/sdk to talk to mcp.higgsfield.ai/mcp.
// Each call opens a short-lived MCP session (connect -> tool -> close), so
// we never hold an open connection across serverless invocations.

export class HiggsfieldError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "HiggsfieldError";
  }
}

export class HiggsfieldUnavailable extends HiggsfieldError {
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldUnavailable";
  }
}

async function authToken(): Promise<string> {
  try {
    return await getValidAccessToken();
  } catch (err) {
    if (err instanceof HiggsfieldNotConnected) {
      throw new HiggsfieldUnavailable(err.message);
    }
    throw err;
  }
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const token = await authToken();
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  const client = new Client({ name: "aimoviebot", version: "0.1.0" });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

// ---- Response shape helpers ----
// Higgsfield's MCP returns a wrapped response with structuredContent and/or
// a text content block containing JSON. The shape varies across tools and
// versions; these helpers walk both safely.

function parseTextContent(
  content: Array<{ type?: string; text?: string }> | undefined,
): Record<string, unknown> {
  if (!content) return {};
  for (const c of content) {
    if (c.type !== "text" || !c.text) continue;
    try {
      const parsed = JSON.parse(c.text);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not JSON; ignore
    }
  }
  return {};
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function firstResultRecord(
  obj: Record<string, unknown>,
): Record<string, unknown> | undefined {
  for (const key of ["results", "result", "images", "data"]) {
    const v = obj[key];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      return v[0] as Record<string, unknown>;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }
  return undefined;
}

// ---- media_import_url ----
// Higgsfield doesn't accept raw external URLs as media inputs; everything
// must be imported first and referenced by media_id. We give it Blob URLs
// and get back a Higgsfield-internal id.
export async function importMedia(blobUrl: string): Promise<string> {
  return withClient(async (client) => {
    const res = await client.callTool({
      name: "media_import_url",
      arguments: { url: blobUrl, type: "auto" },
    });
    const r = res as {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    if (r.isError) {
      const msg =
        r.content?.find((c) => c.type === "text")?.text ?? "media_import_url failed";
      throw new HiggsfieldError(msg);
    }
    const merged: Record<string, unknown> = {
      ...parseTextContent(r.content),
      ...(r.structuredContent ?? {}),
    };
    const mediaId =
      pickString(merged, ["media_id", "id", "mediaId"]) ??
      (firstResultRecord(merged)
        ? pickString(firstResultRecord(merged)!, ["media_id", "id"])
        : undefined);
    if (!mediaId) {
      throw new HiggsfieldError(
        `media_import_url returned no media_id: ${JSON.stringify(merged).slice(0, 300)}`,
      );
    }
    return mediaId;
  });
}

// ---- generate_image ----
// Returns the submitted job's id. Polling for completion is in pollJob.
type GenerateResult = { jobId: string; imageUrl?: string };

async function callGenerate(
  toolName: "generate_image" | "generate_video",
  params: Record<string, unknown>,
): Promise<GenerateResult & { raw: unknown }> {
  return withClient(async (client) => {
    const res = await client.callTool({
      name: toolName,
      arguments: { params },
    });
    const r = res as {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    if (r.isError) {
      const msg =
        r.content?.find((c) => c.type === "text")?.text ?? `${toolName} failed`;
      throw new HiggsfieldError(msg);
    }
    const merged: Record<string, unknown> = {
      ...parseTextContent(r.content),
      ...(r.structuredContent ?? {}),
    };
    const firstResult = firstResultRecord(merged);
    const jobId =
      pickString(merged, ["job_id", "jobId"]) ??
      (firstResult ? pickString(firstResult, ["id", "job_id"]) : undefined);
    const imageUrl =
      pickString(merged, ["image_url", "imageUrl", "url"]) ??
      (firstResult
        ? pickString(firstResult, ["url", "image_url", "imageUrl"])
        : undefined);
    if (!jobId && !imageUrl) {
      throw new HiggsfieldError(
        `${toolName} returned neither jobId nor URL: ${JSON.stringify(merged).slice(0, 400)}`,
      );
    }
    return { jobId: jobId ?? "", imageUrl, raw: res };
  });
}

// ---- job_status with sync polling ----
// `sync: true` tells the server to hold the call open for ~25s and return
// on the first terminal status. Cheaper and lower latency than polling.
type JobStatusResult = {
  status: string;
  imageUrl?: string;
  videoUrl?: string;
  raw: unknown;
};

async function callJobStatus(jobId: string): Promise<JobStatusResult> {
  return withClient(async (client) => {
    const res = await client.callTool({
      name: "job_status",
      arguments: { jobId, sync: true },
    });
    const r = res as {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ type?: string; text?: string }>;
    };
    const merged: Record<string, unknown> = {
      ...parseTextContent(r.content),
      ...(r.structuredContent ?? {}),
    };
    const gen =
      (merged.generation && typeof merged.generation === "object"
        ? (merged.generation as Record<string, unknown>)
        : undefined) ?? firstResultRecord(merged);

    const status =
      pickString(merged, ["status", "state"]) ??
      (gen ? pickString(gen, ["status", "state"]) : undefined) ??
      "unknown";

    // Image URL hides under generation.results.rawUrl most of the time.
    // Walk every fallback shape because different tools / versions vary.
    let imageUrl = pickString(merged, ["image_url", "imageUrl", "url"]);
    let videoUrl = pickString(merged, ["video_url", "videoUrl"]);
    if (gen) {
      const r2 = gen.results;
      if (r2 && typeof r2 === "object" && !Array.isArray(r2)) {
        const rr = r2 as Record<string, unknown>;
        imageUrl =
          imageUrl ??
          pickString(rr, ["rawUrl", "url", "minUrl", "image_url", "imageUrl"]);
        videoUrl = videoUrl ?? pickString(rr, ["videoUrl", "video_url"]);
      } else if (Array.isArray(r2) && r2.length > 0) {
        const first = r2[0] as Record<string, unknown>;
        imageUrl =
          imageUrl ??
          pickString(first, ["rawUrl", "url", "minUrl", "image_url", "imageUrl"]);
        videoUrl = videoUrl ?? pickString(first, ["videoUrl", "video_url"]);
      }
      imageUrl = imageUrl ?? pickString(gen, ["url", "image_url", "imageUrl"]);
      videoUrl = videoUrl ?? pickString(gen, ["videoUrl", "video_url"]);
    }
    return { status, imageUrl, videoUrl, raw: res };
  });
}

async function pollUntilDone(
  jobId: string,
  opts: { timeoutMs: number; kind: "image" | "video" },
): Promise<JobStatusResult> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const s = await callJobStatus(jobId);
    const lower = s.status.toLowerCase();
    if (lower === "completed" || lower === "succeeded") return s;
    if (lower === "failed" || lower === "cancelled" || lower === "nsfw") {
      throw new HiggsfieldError(
        `Higgsfield ${opts.kind} job ${jobId} ended in status ${s.status}`,
      );
    }
    if (lower === "ip_detected") {
      // Bytes exist, hold is metadata only. Video can reveal programmatically.
      if (opts.kind === "video") {
        try {
          await withClient(async (client) => {
            await client.callTool({
              name: "reveal_generation",
              arguments: { jobId },
            });
          });
          continue;
        } catch (revealErr) {
          throw new HiggsfieldError(
            `Video flagged ip_detected and reveal failed: ${revealErr instanceof Error ? revealErr.message : String(revealErr)}. Approve in your Higgsfield dashboard and retry.`,
          );
        }
      }
      // Image path: reveal_generation is seedance-only. Take the URL
      // optimistically. If the URL turns out to be unreadable, the
      // downstream persistArtifact will throw a clear download error.
      if (s.imageUrl) return s;
      throw new HiggsfieldError(
        `Image flagged ip_detected and no URL was returned. Approve in your Higgsfield dashboard and retry.`,
      );
    }
    // status is queued / in_progress / processing / pending — keep polling.
    // sync:true already held for ~25s so no extra sleep is needed; loop
    // immediately for the next 25s window.
  }
  throw new HiggsfieldError(
    `Higgsfield ${opts.kind} job ${jobId} timed out after ${opts.timeoutMs}ms`,
  );
}

// ---- Public surface ----

export async function generateImage(args: {
  prompt: string;
  imageRefs: string[];
  // Called as soon as Higgsfield returns a jobId, BEFORE polling. Lets the
  // caller persist the in-flight jobId so the UI can show "Higgsfield is
  // working on this" with a link, instead of "pending" with no detail.
  onSubmit?: (hfJobId: string) => Promise<void>;
}): Promise<{ url: string; hfJobId?: string }> {
  const model = MODELS.image.higgsfield;
  const mediaIds = await Promise.all(args.imageRefs.map((u) => importMedia(u)));
  const submitted = await callGenerate("generate_image", {
    model,
    prompt: args.prompt,
    aspect_ratio: ASPECT_RATIO,
    resolution: "1k",
    quality: "low",
    count: 1,
    medias: mediaIds.map((value) => ({ value, role: "image" })),
  });
  if (submitted.imageUrl) {
    return { url: submitted.imageUrl, hfJobId: submitted.jobId || undefined };
  }
  if (!submitted.jobId) {
    throw new HiggsfieldError("generate_image returned no jobId and no imageUrl");
  }
  if (args.onSubmit) {
    try {
      await args.onSubmit(submitted.jobId);
    } catch {
      // Tracking failure is not a blocker for the actual gen.
    }
  }
  const final = await pollUntilDone(submitted.jobId, {
    timeoutMs: 4 * 60 * 1000,
    kind: "image",
  });
  if (!final.imageUrl) {
    throw new HiggsfieldError(
      `Higgsfield image job ${submitted.jobId} completed without a URL: ${JSON.stringify(final.raw).slice(0, 400)}`,
    );
  }
  return { url: final.imageUrl, hfJobId: submitted.jobId };
}

export async function generateVideo(args: {
  prompt: string;
  imageRefs: string[];
  resolution: "480p" | "720p" | "1080p";
  mode: "std" | "fast";
  duration: number;
  startImageUrl?: string;
  onSubmit?: (hfJobId: string) => Promise<void>;
}): Promise<{ url: string; hfJobId?: string }> {
  if (!GENERATE_AUDIO) {
    throw new Error("generate_audio guard tripped: AI Movie Bot requires audio ON");
  }
  const model = MODELS.video.higgsfield;
  const mediaIds = await Promise.all(args.imageRefs.map((u) => importMedia(u)));
  const startMedia = args.startImageUrl
    ? await importMedia(args.startImageUrl)
    : undefined;
  const submitted = await callGenerate("generate_video", {
    model,
    prompt: args.prompt,
    aspect_ratio: ASPECT_RATIO,
    resolution: args.resolution,
    mode: args.mode,
    duration: args.duration,
    generate_audio: true,
    count: 1,
    medias: [
      ...mediaIds.map((value) => ({ value, role: "image" })),
      ...(startMedia ? [{ value: startMedia, role: "start_image" }] : []),
    ],
  });
  if (!submitted.jobId) {
    throw new HiggsfieldError("generate_video returned no jobId");
  }
  if (args.onSubmit) {
    try {
      await args.onSubmit(submitted.jobId);
    } catch {
      // ignore
    }
  }
  const final = await pollUntilDone(submitted.jobId, {
    timeoutMs: 12 * 60 * 1000,
    kind: "video",
  });
  if (!final.videoUrl && !final.imageUrl) {
    throw new HiggsfieldError(
      `Higgsfield video job ${submitted.jobId} completed without a URL: ${JSON.stringify(final.raw).slice(0, 400)}`,
    );
  }
  return { url: final.videoUrl ?? final.imageUrl!, hfJobId: submitted.jobId };
}
