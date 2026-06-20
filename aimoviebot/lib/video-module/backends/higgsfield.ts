import { ASPECT_RATIO, GENERATE_AUDIO, MODELS } from "../config";
import {
  MCP_URL,
  getValidAccessToken,
  HiggsfieldNotConnected,
} from "./higgsfield-oauth";

// Higgsfield via MCP-over-HTTP (Streamable HTTP / JSON-RPC). Auth is the
// OAuth access token from the Connect flow; calls are JSON-RPC tools/call.

export class HiggsfieldError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "HiggsfieldError";
  }
}

// Signals to withFallback that the primary is unavailable (not connected,
// missing tokens). Treated the same as a transient failure: fall to Gateway.
export class HiggsfieldUnavailable extends HiggsfieldError {
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldUnavailable";
  }
}

// MCP server may return SSE OR application/json even for a single result.
// Pull the JSON payload out of either envelope.
function parseSseEnvelope(body: string): unknown {
  let payload: unknown = null;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        payload = JSON.parse(raw);
      } catch {
        // multi-line data: not used here
      }
    }
  }
  return payload;
}

let _id = 0;
async function jsonRpc<T>(
  token: string,
  method: string,
  params?: unknown,
): Promise<T> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++_id, method, params }),
  });
  if (!res.ok) {
    throw new HiggsfieldError(
      `MCP ${method} ${res.status}: ${await res.text()}`,
      res.status,
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let body: { result?: T; error?: unknown };
  if (ct.includes("text/event-stream") || text.startsWith("event:") || text.startsWith("data:")) {
    const parsed = parseSseEnvelope(text);
    if (!parsed) {
      throw new HiggsfieldError(`MCP ${method}: empty SSE payload`);
    }
    body = parsed as { result?: T; error?: unknown };
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      throw new HiggsfieldError(
        `MCP ${method}: response not JSON or SSE (ct=${ct}): ${text.slice(0, 200)}`,
      );
    }
  }
  if (body.error) {
    throw new HiggsfieldError(`MCP ${method} error: ${JSON.stringify(body.error)}`);
  }
  return body.result as T;
}

// Wrap MCP tools/call and unwrap the standard {content, structuredContent}
// envelope so callers see the tool's actual payload.
async function toolCall<T>(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const wrapped = await jsonRpc<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: T;
    isError?: boolean;
  }>(token, "tools/call", { name, arguments: args });

  if (wrapped.isError) {
    const txt = wrapped.content?.find((c) => c.type === "text")?.text ?? "(no detail)";
    throw new HiggsfieldError(`MCP tool ${name} reported error: ${txt}`);
  }
  if (wrapped.structuredContent !== undefined) return wrapped.structuredContent;
  const textBlock = wrapped.content?.find((c) => c.type === "text");
  if (textBlock?.text) {
    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      return textBlock.text as unknown as T;
    }
  }
  return wrapped as unknown as T;
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

// ---- Public surface ----

export async function importMedia(blobUrl: string): Promise<string> {
  const token = await authToken();
  const res = await toolCall<{ media_id?: string; id?: string }>(
    token,
    "media_import_url",
    { url: blobUrl, type: "auto" },
  );
  const mediaId = res.media_id ?? res.id;
  if (!mediaId) {
    throw new HiggsfieldError(
      `media_import_url returned no media_id: ${JSON.stringify(res)}`,
    );
  }
  return mediaId;
}

type JobSubmitResponse = {
  results?: Array<{ id?: string; status?: string; url?: string }>;
  notice?: {
    data?: {
      retry_literal_with?: { declined_preset_id?: string };
    };
  };
};

type JobStatusResponse = {
  status?: string;
  poll_after_seconds?: number;
  results?: Array<{ url?: string; type?: string }>;
  urls?: string[];
  error?: string;
};

async function pollJob(
  token: string,
  jobId: string,
  opts: { timeoutMs: number },
): Promise<JobStatusResponse> {
  const start = Date.now();
  let interval = 5_000;
  while (true) {
    const status = await toolCall<JobStatusResponse>(token, "job_status", {
      jobId,
    });
    const s = (status.status ?? "").toLowerCase();
    if (s === "completed") return status;
    if (s === "failed" || s === "cancelled" || s === "nsfw" || s === "ip_detected") {
      throw new HiggsfieldError(
        `Higgsfield job ${jobId} ended in status ${status.status}: ${status.error ?? "(no detail)"}`,
      );
    }
    if (Date.now() - start > opts.timeoutMs) {
      throw new HiggsfieldError(
        `Higgsfield job ${jobId} timed out after ${opts.timeoutMs}ms`,
      );
    }
    if (typeof status.poll_after_seconds === "number") {
      interval = Math.max(2_000, status.poll_after_seconds * 1000);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

function extractUrl(status: JobStatusResponse): string {
  const url = status.results?.[0]?.url ?? status.urls?.[0];
  if (!url) {
    throw new HiggsfieldError(
      `Higgsfield completed without a URL: ${JSON.stringify(status).slice(0, 400)}`,
    );
  }
  return url;
}

export async function generateImage(args: {
  prompt: string;
  imageRefs: string[]; // public HTTPS URLs (Blob); converted to media_ids
}): Promise<{ url: string }> {
  const token = await authToken();
  const mediaIds = await Promise.all(args.imageRefs.map((u) => importMedia(u)));
  const submitted = await toolCall<JobSubmitResponse>(token, "generate_image", {
    params: {
      model: MODELS.image.higgsfield,
      prompt: args.prompt,
      aspect_ratio: ASPECT_RATIO,
      count: 1,
      medias: mediaIds.map((value) => ({ value, role: "image" })),
    },
  });
  const jobId = submitted.results?.[0]?.id;
  if (!jobId) {
    throw new HiggsfieldError(
      `generate_image returned no job id: ${JSON.stringify(submitted).slice(0, 300)}`,
    );
  }
  // Higgsfield image gen can sit in queue 2-3 min. Be generous before
  // bailing to the Gateway fallback so we don't pay for compute twice.
  const final = await pollJob(token, jobId, { timeoutMs: 5 * 60 * 1000 });
  return { url: extractUrl(final) };
}

export async function generateVideo(args: {
  prompt: string;
  imageRefs: string[]; // storyboard + character + location
  resolution: "480p" | "720p" | "1080p";
  mode: "std" | "fast";
  duration: number;
  startImageUrl?: string;
}): Promise<{ url: string }> {
  if (!GENERATE_AUDIO) {
    throw new Error("generate_audio guard tripped: AI Movie Bot requires audio ON");
  }
  const token = await authToken();
  const mediaIds = await Promise.all(args.imageRefs.map((u) => importMedia(u)));
  const startMedia = args.startImageUrl
    ? await importMedia(args.startImageUrl)
    : undefined;

  const buildParams = (declined?: string) => {
    const p: Record<string, unknown> = {
      model: MODELS.video.higgsfield,
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
    if (declined) p.declined_preset_id = declined;
    return p;
  };

  // Higgsfield's MCP may suggest a preset instead of running the literal
  // prompt. Decline that recommendation and retry literally so our scene
  // prompt actually runs.
  let submitted = await toolCall<JobSubmitResponse>(token, "generate_video", {
    params: buildParams(),
  });
  const decline = submitted.notice?.data?.retry_literal_with?.declined_preset_id;
  if (
    !submitted.results?.[0]?.id &&
    typeof decline === "string"
  ) {
    submitted = await toolCall<JobSubmitResponse>(token, "generate_video", {
      params: buildParams(decline),
    });
  }

  const jobId = submitted.results?.[0]?.id;
  if (!jobId) {
    throw new HiggsfieldError(
      `generate_video returned no job id: ${JSON.stringify(submitted).slice(0, 300)}`,
    );
  }
  const final = await pollJob(token, jobId, { timeoutMs: 12 * 60 * 1000 });
  return { url: extractUrl(final) };
}
