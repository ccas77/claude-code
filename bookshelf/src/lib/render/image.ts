import { generateText, type ModelMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import { putBlob } from '../storage';

/**
 * Image generation via Vercel AI Gateway.
 *
 * Default model: Gemini 2.5 Flash Image (a.k.a. Nano Banana). Accepts
 * multiple reference images plus a text prompt, returns an image. The
 * boundary in the prompt keeps the book recognizable; we just shuttle
 * the bytes back to our Blob.
 *
 * Configurable via env IMAGE_PROVIDER_PRIMARY.
 */

const PROVIDER_MODELS: Record<string, string> = {
  gemini: 'google/gemini-2.5-flash-image-preview',
  higgsfield: 'higgsfield/soul', // routed via gateway if available
};

export type GeneratedImage = {
  url: string;
  pathname: string;
  provider: string;
  fallback: boolean;
};

export async function generateBookImage(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
  provider?: string;
}): Promise<GeneratedImage> {
  const provider = args.provider ?? 'gemini';
  const model = PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.gemini;

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: args.prompt },
        ...args.referenceImageUrls.map((url) => ({
          type: 'image' as const,
          image: new URL(url),
        })),
      ],
    },
  ];

  const result = await generateText({ model, messages });

  // Image-output models return generated images on result.files
  const fileResult = result as unknown as {
    files?: { mediaType?: string; uint8Array?: Uint8Array; base64?: string }[];
  };
  const image = fileResult.files?.find((f) => f.mediaType?.startsWith('image/'));
  if (!image) {
    throw new Error(`${provider} returned no image (got text: ${result.text.slice(0, 200)})`);
  }

  const bytes =
    image.uint8Array ??
    (image.base64 ? Buffer.from(image.base64, 'base64') : null);
  if (!bytes) throw new Error('image bytes missing from model response');

  const ext = image.mediaType?.includes('png') ? 'png' : 'jpg';
  const pathname = `library/renders/${args.ownerId}/${randomUUID()}.${ext}`;
  const stored = await putBlob(pathname, bytes);

  return { url: stored.url, pathname: stored.pathname, provider, fallback: false };
}
