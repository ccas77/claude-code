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

const SINGLE_PROMPT = `You are an unforgiving visual verifier. Default to NO. Only say YES when the match is unmistakable.

You will be shown two images.

IMAGE A is the original book cover.
IMAGE B is a generated photograph that is supposed to feature the exact same book sitting inside a styled scene.

Decide whether the book visible in IMAGE B is the same book as IMAGE A. ALL of these must be true to say YES:
- The cover artwork (subject, composition, layout) matches A.
- The title text is the same words, in a recognisably similar typeface and layout.
- The author name matches.

Lighting and scene context can change. The cover artwork, title, and author cannot. Any of the following is a hard NO: wrong title, wrong author, a different illustration, a generic-looking stand-in cover, a blurred or unreadable title where A's was readable, a cover that looks plausibly like the right genre but is not this exact book.

Reply with a single line. Start with YES if the match is unmistakable, NO otherwise. After YES or NO, give a short reason under 20 words.`;

const SET_PROMPT = `You are an unforgiving visual verifier. Default to NO. Only say YES when every book is unmistakable.

You will be shown two images.

IMAGE A shows a set of books (a duet, trilogy, or series) - multiple book covers visible together.
IMAGE B is a generated photograph that is supposed to feature the same set of books arranged together in a styled scene.

Decide whether EVERY book from IMAGE A appears in IMAGE B with the same cover artwork, title, and author. Missing one, inventing an extra, or substituting a generic-looking stand-in for any of them is a hard NO. A blurred title where A's was readable is also a NO.

Reply with a single line. Start with YES if every book matches unmistakably, NO otherwise. After YES or NO, give a short reason under 20 words.`;

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
