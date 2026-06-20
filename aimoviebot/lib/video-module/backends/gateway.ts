import { generateText, experimental_generateImage } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  ASPECT_RATIO,
  GATEWAY_VIDEO_TIMEOUT_MS,
  GENERATE_AUDIO,
  MODELS,
} from "../config";

// Vercel AI Gateway client. On Vercel, OIDC auto-auth handles credentials
// (no AI_GATEWAY_API_KEY env var needed in production). For local dev set
// AI_GATEWAY_API_KEY to a Gateway API key.

// Sniff the real media type from an image's first bytes. Anthropic (and most
// vision providers) reject when the declared content-type doesn't match the
// actual file bytes. URL extensions and HTTP content-type headers lie all
// the time, so we always sniff.
function sniffImageMediaType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function fetchImageWithCorrectMediaType(
  url: string,
): Promise<{ data: Uint8Array; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image ${url}: ${res.status}`);
  }
  const data = new Uint8Array(await res.arrayBuffer());
  const sniffed = sniffImageMediaType(data);
  const headerCt = res.headers.get("content-type") ?? "";
  const mediaType =
    sniffed ??
    (headerCt.startsWith("image/") ? headerCt.split(";")[0] : "image/jpeg");
  return { data, mediaType };
}

// ---- text ----
// Vision images: always download + sniff. Passing a URL directly trusts the
// extension/content-type, which lies for files uploaded with the wrong
// extension and gets rejected by Anthropic with a media-type mismatch error.
export async function gatewayGenerateText(args: {
  prompt: string;
  system?: string;
  imageUrls?: string[];
  modelId?: string;
}): Promise<string> {
  const modelId = args.modelId ?? MODELS.concept.gateway;
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType: string }
  > = [{ type: "text", text: args.prompt }];
  for (const url of args.imageUrls ?? []) {
    const { data, mediaType } = await fetchImageWithCorrectMediaType(url);
    userContent.push({ type: "image", image: data, mediaType });
  }
  const { text } = await generateText({
    model: gateway(modelId),
    ...(args.system ? { system: args.system } : {}),
    messages: [{ role: "user", content: userContent }],
  });
  return text;
}

// ---- text -> JSON (concept output) ----
// Done via generateText + JSON parse rather than generateObject so the
// schema/instructions live in the prompt and we don't depend on a particular
// AI SDK helper signature.
export async function gatewayGenerateJSON<T>(args: {
  prompt: string;
  system?: string;
  imageUrls?: string[];
  modelId?: string;
}): Promise<T> {
  const text = await gatewayGenerateText(args);
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch (e) {
    throw new Error(
      `Gateway JSON parse failed. Raw text:\n${text}\n\nError: ${String(e)}`,
    );
  }
}

// ---- image gen ----
export async function gatewayGenerateImage(args: {
  prompt: string;
  imageRefs: string[]; // URLs
}): Promise<{ url: string }> {
  const modelId = MODELS.image.gateway;
  // Embed reference image URLs inline in the prompt. Gemini image models on
  // the Gateway accept image inputs via the unified messages content; the
  // experimental_generateImage signature varies, so this keeps the call shape
  // minimal and adds the refs as URLs the model can resolve.
  const promptWithRefs =
    args.imageRefs.length === 0
      ? args.prompt
      : `${args.prompt}\n\nReference images (use as sole source of truth):\n${args.imageRefs.map((u, i) => `${i + 1}. ${u}`).join("\n")}`;

  const result = await experimental_generateImage({
    model: gateway.imageModel(modelId),
    prompt: promptWithRefs,
    aspectRatio: ASPECT_RATIO,
  });
  // experimental_generateImage returns { image: { base64, mediaType, ... } }
  // OR { images: [...] } depending on the version. The Blob upload layer
  // accepts a base64 string or a URL; pass back a data: URL.
  const img = (result as { image?: { base64?: string; mediaType?: string } })
    .image;
  if (!img?.base64) {
    throw new Error(
      `Gateway image returned no base64 payload: ${JSON.stringify(result).slice(0, 500)}`,
    );
  }
  const mediaType = img.mediaType ?? "image/png";
  return { url: `data:${mediaType};base64,${img.base64}` };
}

// ---- video gen ----
// Gateway video for Seedance. The AI SDK doesn't (as of 6.x) expose a stable
// experimental_generateVideo for all providers, so we call the Gateway
// directly with an extended-timeout fetch. The Gateway-prefixed model slug
// for Seedance is bytedance/seedance-2.0-fast (verified against
// ai-gateway.vercel.sh/v1/models on build).
export async function gatewayGenerateVideo(args: {
  prompt: string;
  imageRefs: string[];
  resolution: "480p" | "720p" | "1080p";
  mode: "std" | "fast";
  duration: number;
  startImageUrl?: string;
}): Promise<{ url: string }> {
  if (!GENERATE_AUDIO) {
    throw new Error(
      "generate_audio guard tripped: AI Movie Bot requires audio ON",
    );
  }
  const modelId = MODELS.video.gateway;
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    throw new Error(
      "Gateway video needs AI_GATEWAY_API_KEY locally or VERCEL_OIDC_TOKEN in production",
    );
  }

  const body = {
    prompt: args.prompt,
    aspect_ratio: ASPECT_RATIO,
    resolution: args.resolution,
    mode: args.mode,
    duration: args.duration,
    generate_audio: true,
    image: args.startImageUrl ?? args.imageRefs[0],
    image_refs: args.imageRefs,
  };

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), GATEWAY_VIDEO_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ai-gateway.vercel.sh/v1/${modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Gateway video ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      video?: { url?: string };
      url?: string;
      output?: { url?: string };
    };
    const url = json.video?.url ?? json.output?.url ?? json.url;
    if (!url) {
      throw new Error(
        `Gateway video returned no URL: ${JSON.stringify(json).slice(0, 500)}`,
      );
    }
    return { url };
  } finally {
    clearTimeout(to);
  }
}
