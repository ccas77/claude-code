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
//
// Higgsfield's import-fetch is flaky and sometimes returns
// "Something went wrong. Please try again. Request ID: …". Storyboard
// regen kicks off N imports in parallel via Promise.all, so a single
// transient import failure aborts the whole regen. We retry the import
// up to 3 times total with linear backoff before surfacing the error.
// media_import_url is idempotent (it just registers a fetchable URL on
// their side), so retrying is safe.
async function importMediaOnce(blobUrl: string): Promise<string> {
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

export async function importMedia(blobUrl: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await importMediaOnce(blobUrl);
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }
  throw lastErr;
}

// ---- generate_image / generate_video ----
// Returns the submitted job's id. Polling for completion is in pollUntilDone.
// declinedPresetId is set when Higgsfield's MCP returns a notice asking us
// to use a built-in preset instead of running the literal prompt. The
// caller (generateVideo) re-submits with declined_preset_id to force
// literal interpretation of the curated prompt.
type GenerateResult = {
  jobId: string;
  imageUrl?: string;
  declinedPresetId?: string;
};

function extractDeclinedPreset(
  merged: Record<string, unknown>,
): string | undefined {
  const notice = merged.notice;
  if (!notice || typeof notice !== "object") return undefined;
  const data = (notice as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const retry = (data as { retry_literal_with?: unknown }).retry_literal_with;
  if (!retry || typeof retry !== "object") return undefined;
  const id = (retry as { declined_preset_id?: unknown }).declined_preset_id;
  return typeof id === "string" && id ? id : undefined;
}

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
    const declinedPresetId = extractDeclinedPreset(merged);
    if (!jobId && !imageUrl && !declinedPresetId) {
      throw new HiggsfieldError(
        `${toolName} returned neither jobId nor URL: ${JSON.stringify(merged).slice(0, 400)}`,
      );
    }
    return { jobId: jobId ?? "", imageUrl, declinedPresetId, raw: res };
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

// Public helper: ask Higgsfield for the current status of a previously
// submitted job and (if completed) the result URL. Used by the recovery
// endpoint to pull existing clip outputs after a workflow crash, without
// re-submitting a new Seedance call.
export async function getJobStatus(jobId: string): Promise<JobStatusResult> {
  return callJobStatus(jobId);
}

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

// Inflight context: who is calling, so we can record + clear the row
// on job state. EVERY image/video call through this module takes one,
// and the inflight row is cleared in a try/finally regardless of how
// the call ends (success, NSFW reject, timeout, exception). No more
// ghost "in flight" entries piling up on the status page.
export type InflightContext = {
  jobId: string;
  stage: "stage1" | "stage2" | "stage4" | "stage5";
  label: string;
};

export async function generateImage(args: {
  prompt: string;
  imageRefs: string[];
  inflight: InflightContext;
  // Per-call model override (used by retry-with-different-model). Falls back
  // to the configured default (MODELS.image.higgsfield) when not provided.
  modelOverride?: string;
}): Promise<{ url: string; hfJobId?: string }> {
  const model = args.modelOverride ?? MODELS.image.higgsfield;
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
  const hfJobId = submitted.jobId;
  const storage = await import("../storage");
  await storage
    .trackInflightHiggsfieldJob(args.inflight.jobId, {
      hfJobId,
      stage: args.inflight.stage,
      label: args.inflight.label,
      submittedAt: new Date().toISOString(),
    })
    .catch(() => {});
  try {
    const final = await pollUntilDone(hfJobId, {
      timeoutMs: 4 * 60 * 1000,
      kind: "image",
    });
    if (!final.imageUrl) {
      throw new HiggsfieldError(
        `Higgsfield image job ${hfJobId} completed without a URL: ${JSON.stringify(final.raw).slice(0, 400)}`,
      );
    }
    return { url: final.imageUrl, hfJobId };
  } finally {
    await storage
      .clearInflightHiggsfieldJob(args.inflight.jobId, hfJobId)
      .catch(() => {});
  }
}

// ---- show_generations (history browse) ----
// Returns a page of generations of the given type. The MCP tool paginates
// via a numeric next_cursor; pass it back as `cursor` for the next page.
export type GenerationItem = {
  id: string;
  type: "video" | "image" | "audio" | "3d";
  status: string;
  model: string;
  createdAt: number;
  params: {
    prompt?: string;
    duration?: number;
    aspect_ratio?: string;
    resolution?: string;
    [k: string]: unknown;
  };
  results?: {
    rawUrl?: string;
    thumbnailUrl?: string;
    [k: string]: unknown;
  };
};

export async function listGenerationsPage(args: {
  type: "video" | "image" | "audio" | "3d";
  size?: number;
  cursor?: number;
}): Promise<{ items: GenerationItem[]; nextCursor: number | null }> {
  return withClient(async (client) => {
    const res = await client.callTool({
      name: "show_generations",
      arguments: {
        type: args.type,
        size: args.size ?? 50,
        ...(args.cursor != null ? { cursor: args.cursor } : {}),
      },
    });
    const r = res as {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    if (r.isError) {
      const msg =
        r.content?.find((c) => c.type === "text")?.text ?? "show_generations failed";
      throw new HiggsfieldError(msg);
    }
    const merged: Record<string, unknown> = {
      ...parseTextContent(r.content),
      ...(r.structuredContent ?? {}),
    };
    const items = Array.isArray(merged.items)
      ? (merged.items as GenerationItem[])
      : [];
    const nextCursor =
      typeof merged.next_cursor === "number"
        ? (merged.next_cursor as number)
        : null;
    return { items, nextCursor };
  });
}

export async function generateVideo(args: {
  prompt: string;
  imageRefs: string[];
  resolution: "480p" | "720p" | "1080p";
  mode: "std" | "fast";
  duration: number;
  startImageUrl?: string;
  inflight: InflightContext;
}): Promise<{ url: string; hfJobId?: string }> {
  if (!GENERATE_AUDIO) {
    throw new Error("generate_audio guard tripped: AI Movie Bot requires audio ON");
  }
  const model = MODELS.video.higgsfield;
  const mediaIds = await Promise.all(args.imageRefs.map((u) => importMedia(u)));
  const startMedia = args.startImageUrl
    ? await importMedia(args.startImageUrl)
    : undefined;
  const buildParams = (declinedPresetId?: string): Record<string, unknown> => {
    const p: Record<string, unknown> = {
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
    };
    if (declinedPresetId) p.declined_preset_id = declinedPresetId;
    return p;
  };

  // First submission. Higgsfield may respond with a preset_recommendation
  // notice instead of running the literal prompt. If it does, re-submit
  // once with declined_preset_id so our curated prompt actually runs.
  let submitted = await callGenerate("generate_video", buildParams());
  if (!submitted.jobId && submitted.declinedPresetId) {
    submitted = await callGenerate(
      "generate_video",
      buildParams(submitted.declinedPresetId),
    );
  }
  if (!submitted.jobId) {
    throw new HiggsfieldError(
      `generate_video returned no jobId after preset decline: ${JSON.stringify(submitted.raw).slice(0, 400)}`,
    );
  }
  const hfJobId = submitted.jobId;
  const storage = await import("../storage");
  await storage
    .trackInflightHiggsfieldJob(args.inflight.jobId, {
      hfJobId,
      stage: args.inflight.stage,
      label: args.inflight.label,
      submittedAt: new Date().toISOString(),
    })
    .catch(() => {});
  try {
    const final = await pollUntilDone(hfJobId, {
      timeoutMs: 12 * 60 * 1000,
      kind: "video",
    });
    if (!final.videoUrl && !final.imageUrl) {
      throw new HiggsfieldError(
        `Higgsfield video job ${hfJobId} completed without a URL: ${JSON.stringify(final.raw).slice(0, 400)}`,
      );
    }
    return { url: final.videoUrl ?? final.imageUrl!, hfJobId };
  } finally {
    await storage
      .clearInflightHiggsfieldJob(args.inflight.jobId, hfJobId)
      .catch(() => {});
  }
}
