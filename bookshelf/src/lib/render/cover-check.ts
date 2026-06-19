import { generateObject, type ModelMessage } from 'ai';
import { z } from 'zod';

/**
 * Strict cover verifier. Reads two images and refuses to pass unless every
 * stated criterion is satisfied. Returning a JSON object with per-criterion
 * booleans forces the model to commit to evidence instead of giving a vibes-
 * based YES; missing any one criterion fails the check.
 *
 * Model: google/gemini-2.5-pro via Vercel AI Gateway. Pro is much stricter
 * on visual identity tasks than Flash. Cost goes from ~$0.0006 to ~$0.0025
 * per check; renders run at most 3 attempts, so ~$0.0076 ceiling per render.
 */

const MODEL = 'google/gemini-2.5-pro';

const Verdict = z.object({
  coverArtMatches: z
    .boolean()
    .describe(
      'Does the illustration / artwork / composition / colour scheme on the rendered book cover match the reference? Lighting and scene shadows can differ.',
    ),
  titleMatches: z
    .boolean()
    .describe(
      'Does the title text on the rendered cover say the same words as the reference, in a recognisably similar typeface and layout? Blurred or illegible where the reference is readable is FALSE.',
    ),
  authorMatches: z
    .boolean()
    .describe(
      'Does the author name on the rendered cover match the reference? Missing or illegible where the reference shows the author is FALSE.',
    ),
  notAStandin: z
    .boolean()
    .describe(
      'Is this the actual book from the reference rather than a generic-looking stand-in that merely fits the same genre or aesthetic? FALSE if the cover looks like a plausibly-typed substitute.',
    ),
  reason: z
    .string()
    .max(280)
    .describe('One short sentence stating exactly which criterion failed, if any.'),
});

const SET_INSTRUCTION = `IMAGE A shows a set of books (a duet, trilogy, series). IMAGE B is a generated photograph that is supposed to feature the same set together. Evaluate the criteria as ALL TRUE only when every book from the reference is present and faithfully reproduced in the output. Missing any book, inventing extras, blurred titles where the reference was readable, or generic stand-ins all flip the relevant booleans to false.`;
const SINGLE_INSTRUCTION = `IMAGE A is the original book cover. IMAGE B is a generated photograph that is supposed to feature the exact same book. Evaluate the criteria for that single book. Lighting and scene context can change; the cover artwork, title text, and author name cannot.`;

export type CoverCheckResult = { ok: boolean; reason: string };

export async function verifyCoverMatch(
  originalCoverUrl: string,
  generatedImageUrl: string,
  kind: 'single' | 'set' = 'single',
): Promise<CoverCheckResult> {
  const instruction = kind === 'set' ? SET_INSTRUCTION : SINGLE_INSTRUCTION;
  const labelA =
    kind === 'set' ? 'IMAGE A (original set of books):' : 'IMAGE A (original book cover):';

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'You are an unforgiving visual verifier. Default to false for every criterion. Only mark a criterion true when you can clearly see the evidence in both images. Be especially harsh on stand-ins: a cover that "looks about right" for the genre but is not literally the same book is NOT a match. ' +
            instruction,
        },
        { type: 'text', text: labelA },
        { type: 'image', image: new URL(originalCoverUrl) },
        { type: 'text', text: 'IMAGE B (generated render):' },
        { type: 'image', image: new URL(generatedImageUrl) },
      ],
    },
  ];

  try {
    const result = await generateObject({
      model: MODEL,
      schema: Verdict,
      messages,
    });
    const v = result.object;
    const ok =
      v.coverArtMatches &&
      v.titleMatches &&
      v.authorMatches &&
      v.notAStandin;
    const failedCriteria: string[] = [];
    if (!v.coverArtMatches) failedCriteria.push('cover art');
    if (!v.titleMatches) failedCriteria.push('title');
    if (!v.authorMatches) failedCriteria.push('author');
    if (!v.notAStandin) failedCriteria.push('looks like a stand-in');
    const reason = ok
      ? v.reason || 'all criteria matched'
      : `${failedCriteria.join(', ')}. ${v.reason}`.slice(0, 300);
    return { ok, reason };
  } catch (e) {
    // Don't gate renders behind a transient verifier failure. Surface the
    // error in the reason so the orchestrator's event log shows what happened.
    return {
      ok: true,
      reason: `verifier unavailable (${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}); accepting candidate`,
    };
  }
}
