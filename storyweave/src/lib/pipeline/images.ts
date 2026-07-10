import { generateText } from 'ai';
import { env } from '../config';
import { putBlob, fetchStored, type StoredBlob } from '../storage';
import { placeholderImage } from '../render/ffmpeg';

/**
 * Image generation — the character-consistency core.
 *
 * Every scene call is assembled MECHANICALLY as
 *   scene action + locked character description(s) + style lock
 * and the character's reference images are attached to the model call.
 * That injection — not per-scene prompt-craft — is what keeps the character
 * identical across frames.
 *
 * Provider: the gateway image model ("Nano Banana") via the AI SDK, same as
 * bookshelf's fallback image path. In DRY_RUN a free placeholder is produced
 * so the full pipeline runs without spending anything.
 */

export function buildScenePrompt(args: {
  imagePrompt: string;
  shot: string;
  characterDescriptions: string[];
  style: string;
}): string {
  const parts = [args.imagePrompt];
  for (const desc of args.characterDescriptions) parts.push(desc);
  parts.push(args.style);
  parts.push(`${args.shot} shot, 16:9 cinematic composition`);
  return parts
    .map((p) => p.trim().replace(/[,\s]+$/, ''))
    .filter(Boolean)
    .join(', ');
}

export function buildCastPrompt(args: { angle: string; description: string; style: string }): string {
  return [
    `character reference, ${args.angle}, neutral background, consistent character design`,
    args.description.trim(),
    args.style.trim(),
  ].join(', ');
}

export async function generateImage(args: {
  prompt: string;
  referenceUrls: string[];
  pathname: string;
}): Promise<StoredBlob> {
  if (env().DRY_RUN) {
    const bytes = await placeholderImage(args.prompt);
    return putBlob(args.pathname, bytes);
  }

  // Reference images ride along as image parts; the model uses them to hold
  // the character's identity in the new composition.
  const refs = await Promise.all(args.referenceUrls.map((u) => fetchStored(u)));
  const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: Uint8Array }> = [
    ...refs.map((bytes) => ({ type: 'image' as const, image: new Uint8Array(bytes) })),
    { type: 'text' as const, text: promptWithRefInstruction(args.prompt, refs.length) },
  ];

  const result = await generateText({
    model: env().IMAGE_MODEL,
    messages: [{ role: 'user', content }],
    providerOptions: { google: { responseModalities: ['TEXT', 'IMAGE'] } },
  });

  const image = result.files.find((f) => f.mediaType?.startsWith('image/'));
  if (!image) {
    throw new Error(`image model returned no image (text was: ${result.text.slice(0, 200)})`);
  }
  return putBlob(args.pathname, Buffer.from(image.uint8Array));
}

function promptWithRefInstruction(prompt: string, refCount: number): string {
  if (refCount === 0) return prompt;
  return (
    `${prompt}. Keep the exact same character identity, face, hair and clothing ` +
    `as shown in the attached reference image${refCount > 1 ? 's' : ''}.`
  );
}
