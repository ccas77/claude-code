import {
  ASPECT_RATIO,
  HIGGSFIELD,
  MODELS,
  GENERATE_AUDIO,
} from "../config";

// Higgsfield REST API client. Documented at
// https://docs.higgsfield.ai/docs/how-to/introduction.
//
// Auth header is the composite "Key {API_KEY}:{API_SECRET}" form, NOT Bearer.
// Requests are async: POST returns {request_id, status_url}, then you poll
// GET /requests/{request_id}/status until status == "completed" or "failed".

const authHeader = () => {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) {
    throw new HiggsfieldUnavailable(
      "HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET not set",
    );
  }
  return `Key ${key}:${secret}`;
};

export class HiggsfieldError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "HiggsfieldError";
  }
}

// Signals to withFallback that the primary path is genuinely unavailable
// (missing creds, wrong base URL). Treated the same as a transient failure:
// fall straight to Gateway.
export class HiggsfieldUnavailable extends HiggsfieldError {
  constructor(message: string) {
    super(message);
    this.name = "HiggsfieldUnavailable";
  }
}

type QueuedResponse = {
  status: "queued" | "in_progress";
  request_id: string;
  status_url?: string;
};

type CompletedResponse = {
  status: "completed";
  request_id: string;
  images?: { url: string }[];
  video?: { url: string };
};

type FailedResponse = {
  status: "failed" | "cancelled" | "nsfw" | "ip_detected";
  request_id: string;
  error?: string;
};

type StatusResponse = QueuedResponse | CompletedResponse | FailedResponse;

const isTerminal = (r: StatusResponse) =>
  r.status === "completed" ||
  r.status === "failed" ||
  r.status === "cancelled" ||
  r.status === "nsfw" ||
  r.status === "ip_detected";

async function pollJob(
  requestId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<CompletedResponse> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const start = Date.now();
  while (true) {
    const res = await fetch(
      `${HIGGSFIELD.baseUrl}/requests/${requestId}/status`,
      { headers: { Authorization: authHeader() } },
    );
    if (!res.ok) {
      throw new HiggsfieldError(
        `status poll ${res.status} ${await res.text()}`,
        res.status,
      );
    }
    const body = (await res.json()) as StatusResponse;
    if (isTerminal(body)) {
      if (body.status !== "completed") {
        throw new HiggsfieldError(
          `Higgsfield job ${requestId} ended in status ${body.status}`,
        );
      }
      return body;
    }
    if (Date.now() - start > timeoutMs) {
      throw new HiggsfieldError(
        `Higgsfield job ${requestId} timed out after ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function submit(modelId: string, body: Record<string, unknown>) {
  const res = await fetch(`${HIGGSFIELD.baseUrl}/${modelId}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new HiggsfieldError(
      `submit ${modelId} -> ${res.status} ${await res.text()}`,
      res.status,
    );
  }
  return (await res.json()) as QueuedResponse | CompletedResponse;
}

// importMedia: the spec describes a media_id flow (media_import_url ->
// media_confirm -> media_id). The public REST docs don't document this
// endpoint with a stable shape; the MCP-side equivalent expects an HTTPS URL
// and returns a media_id. Vercel Blob URLs are public HTTPS, so for the REST
// path we pass them straight through as image_urls. If a future Higgsfield
// REST endpoint requires media_id, only this helper changes.
export async function importMedia(blobUrl: string): Promise<string> {
  return blobUrl;
}

// Image gen. References (character/location sheets, etc.) are passed as
// medias[] with role "image". If the Higgsfield REST API rejects this shape,
// HiggsfieldError surfaces and withFallback routes to Gateway.
export async function generateImage(args: {
  prompt: string;
  imageRefs: string[]; // public HTTPS URLs (Blob)
}): Promise<{ url: string }> {
  const modelId = MODELS.image.higgsfield;
  const medias = await Promise.all(args.imageRefs.map(importMedia));
  const submitted = await submit(modelId, {
    prompt: args.prompt,
    aspect_ratio: ASPECT_RATIO,
    medias: medias.map((value) => ({ value, role: "image" })),
  });
  const final =
    submitted.status === "completed"
      ? submitted
      : await pollJob(submitted.request_id, { timeoutMs: 3 * 60 * 1000 });
  const url = final.images?.[0]?.url;
  if (!url) {
    throw new HiggsfieldError(
      `Higgsfield image completed without a URL: ${JSON.stringify(final)}`,
    );
  }
  return { url };
}

// Video gen. The hard product constants (9:16, generate_audio: true) are
// asserted here so they can't drift even if a caller forgets them.
export async function generateVideo(args: {
  prompt: string;
  imageRefs: string[]; // storyboard + character + location URLs
  resolution: "480p" | "720p" | "1080p";
  mode: "std" | "fast";
  duration: number;
  genre?: string;
  startImageUrl?: string;
}): Promise<{ url: string }> {
  if (!GENERATE_AUDIO) {
    throw new Error(
      "generate_audio guard tripped: AI Movie Bot requires audio ON",
    );
  }
  const modelId = MODELS.video.higgsfield;
  const medias = await Promise.all(args.imageRefs.map(importMedia));
  const startMedia = args.startImageUrl
    ? await importMedia(args.startImageUrl)
    : undefined;
  const submitted = await submit(modelId, {
    prompt: args.prompt,
    aspect_ratio: ASPECT_RATIO,
    resolution: args.resolution,
    mode: args.mode,
    duration: args.duration,
    genre: args.genre ?? "auto",
    generate_audio: true,
    medias: [
      ...medias.map((value) => ({ value, role: "image" })),
      ...(startMedia ? [{ value: startMedia, role: "start_image" }] : []),
    ],
  });
  const final =
    submitted.status === "completed"
      ? submitted
      : await pollJob(submitted.request_id, { timeoutMs: 12 * 60 * 1000 });
  const url = final.video?.url;
  if (!url) {
    throw new HiggsfieldError(
      `Higgsfield video completed without a URL: ${JSON.stringify(final)}`,
    );
  }
  return { url };
}
