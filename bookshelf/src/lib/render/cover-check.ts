import { generateText, type ModelMessage } from 'ai';

/**
 * Check that a generated render still features the actual book cover, not
 * a hallucinated/drifted variant. Runs before ffmpeg so a bad image
 * doesn't burn assembly time.
 *
 * Uses Gemini Flash via the Vercel AI Gateway (OIDC auth on Vercel, no
 * extra key). Returns ok=true if the generated image clearly shows the
 * same book as the reference, ok=false otherwise.
 */

const MODEL = 'google/gemini-2.5-flash';

const SINGLE_PROMPT = `You are a strict visual verifier.

You will be shown two images.

IMAGE A is the original book cover.
IMAGE B is a generated photograph that is supposed to feature the exact same book sitting inside a styled scene.

Your task: decide whether the book visible in IMAGE B is the same book as IMAGE A. The book in B should match A's cover artwork, title text, author, and overall design. Color and styling can change to fit the scene, but the cover itself must still be recognizable as the same book. Small stylistic interpretation is fine; a wrong title, wrong art, or completely fabricated cover is not.

Reply with a single line. Start with YES if the books match, or NO if they do not. After YES or NO, give a short reason (under 20 words).`;

const SET_PROMPT = `You are a strict visual verifier.

You will be shown two images.

IMAGE A shows a set of books (a duet, trilogy, or series) - multiple book covers visible together.
IMAGE B is a generated photograph that is supposed to feature the same set of books arranged together in a styled scene.

Your task: decide whether EVERY book from IMAGE A appears in IMAGE B. Each book's cover artwork, title, and author should be recognizable. Color and styling can shift to fit the scene, but the covers themselves must match. Missing a book from the set, inventing extra books, or substituting generic stand-ins all count as failure.

Reply with a single line. Start with YES if all books from A appear in B, or NO if any are missing or wrong. After YES or NO, give a short reason (under 20 words).`;

export type CoverCheckResult = { ok: boolean; reason: string };

export async function verifyCoverMatch(
  originalCoverUrl: string,
  generatedImageUrl: string,
  kind: 'single' | 'set' = 'single',
): Promise<CoverCheckResult> {
  const prompt = kind === 'set' ? SET_PROMPT : SINGLE_PROMPT;
  const labelA =
    kind === 'set' ? 'IMAGE A (original set of books):' : 'IMAGE A (original book cover):';

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'text', text: labelA },
        { type: 'image', image: new URL(originalCoverUrl) },
        { type: 'text', text: 'IMAGE B (generated render):' },
        { type: 'image', image: new URL(generatedImageUrl) },
      ],
    },
  ];

  const result = await generateText({ model: MODEL, messages });
  const reply = result.text.trim();
  const verdict = reply.toUpperCase().startsWith('YES');
  return { ok: verdict, reason: reply.slice(0, 300) };
}
