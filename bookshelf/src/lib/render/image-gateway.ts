import { generateText, type ModelMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import { putBlob } from '../storage';

/**
 * Image generation through Vercel AI Gateway.
 *
 * Routes to Google's Nano Banana (gemini-2.5-flash-image-preview) over the
 * gateway. This is the same model Higgsfield wraps, so cover fidelity is
 * equivalent - but the path is direct, so Higgsfield platform outages don't
 * take it down. Used as the backup when the primary Higgsfield MCP path
 * throws.
 *
 * Reference images are passed as multimodal content parts; Nano Banana
 * supports inline image inputs.
 *
 * Auth: OIDC on Vercel (no API key needed), or AI_GATEWAY_API_KEY in dev.
 */

const MODEL = 'google/gemini-2.5-flash-image-preview';

export type GeneratedImage = {
  url: string;
  pathname: string;
  provider: string;
  fallback: boolean;
};

export async function generateImageViaGateway(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
}): Promise<GeneratedImage> {
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

  const result = await generateText({
    model: MODEL,
    messages,
    providerOptions: {
      google: {
        responseModalities: ['IMAGE'],
      },
    },
  });

  // Nano Banana returns image bytes as a file in result.files.
  // The shape across AI SDK versions: { mediaType, uint8Array, base64 }.
  const files = (result as unknown as {
    files?: { mediaType?: string; uint8Array?: Uint8Array; base64?: string }[];
  }).files ?? [];
  const imageFile = files.find((f) => (f.mediaType ?? '').startsWith('image/'));
  if (!imageFile) {
    throw new Error(
      `AI Gateway returned no image file. Files: ${files.length}. Text: ${result.text.slice(0, 200)}`,
    );
  }
  const bytes = imageFile.uint8Array
    ? Buffer.from(imageFile.uint8Array)
    : imageFile.base64
      ? Buffer.from(imageFile.base64, 'base64')
      : null;
  if (!bytes) throw new Error('AI Gateway image file had no bytes');

  const ext = (imageFile.mediaType ?? 'image/png').split('/')[1] ?? 'png';
  const pathname = `library/renders/${args.ownerId}/${randomUUID()}.${ext}`;
  const stored = await putBlob(pathname, bytes);

  return {
    url: stored.url,
    pathname: stored.pathname,
    provider: 'ai-gateway/gemini-2.5-flash-image',
    fallback: false,
  };
}
