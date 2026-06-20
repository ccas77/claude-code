import { generateText } from "ai";
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
// AI SDK v6's `gateway.imageModel(...)` registry doesn't include the Gemini
// `-image` chat models (it errors "No such imageModel"). Use Gemini's chat
// API directly with image-modal output: generateText with the chat-image
// model returns generated image bytes in the experimental file attachments.
export async function gatewayGenerateImage(args: {
  prompt: string;
  imageRefs: string[]; // public URLs of reference images
}): Promise<{ url: string }> {
  const modelId = MODELS.image.gateway;

  // Reference images: download + sniff so the media type is honest before
  // we hand them to the chat API.
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: `${args.prompt}\n\nOutput a single image, 9:16 vertical (portrait). Do not output any text response; produce only the image.`,
    },
  ];
  for (const url of args.imageRefs) {
    const { data, mediaType } = await fetchImageWithCorrectMediaType(url);
    userContent.push({ type: "image", image: data, mediaType });
  }

  const result = await generateText({
    model: gateway(modelId),
    messages: [{ role: "user", content: userContent }],
    // Image-capable Gemini models stream both text and image parts; we just
    // want the image part.
    providerOptions: {
      gateway: {},
    },
  });

  // The image arrives in result.files (AI SDK v6) as a file part with
  // mediaType "image/..." and a base64 / Uint8Array payload. Walk every
  // shape we might see so a v6 minor-version bump doesn't break this.
  const files = (result as unknown as {
    files?: Array<{
      mediaType?: string;
      base64?: string;
      uint8Array?: Uint8Array;
      url?: string;
    }>;
  }).files;
  const file = files?.find((f) => (f.mediaType ?? "").startsWith("image/"));
  if (!file) {
    throw new Error(
      `Gateway chat image: no image part in response. Text: ${(result as { text?: string }).text?.slice(0, 200) ?? "(none)"}`,
    );
  }
  if (file.url) return { url: file.url };
  if (file.base64) {
    return {
      url: `data:${file.mediaType ?? "image/png"};base64,${file.base64}`,
    };
  }
  if (file.uint8Array) {
    const b64 = Buffer.from(file.uint8Array).toString("base64");
    return { url: `data:${file.mediaType ?? "image/png"};base64,${b64}` };
  }
  throw new Error(
    `Gateway chat image: file part has no payload (${JSON.stringify(file).slice(0, 200)})`,
  );
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
