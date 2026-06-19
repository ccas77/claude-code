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
      'Same illustration / subject / composition / colour scheme as the reference cover. Artistic reinterpretation, brush-stroke differences, and minor colour shifts are fine - the question is whether it is recognisably the same artwork. FALSE only if the cover art is clearly a different image.',
    ),
  titleMatches: z
    .boolean()
    .describe(
      'Title text says the same words as the reference, where you can read it. If the title is angled, small, partially obscured, or unreadable but nothing about it contradicts the reference, mark TRUE - that is the book just photographed at an angle. Mark FALSE only when you can clearly read DIFFERENT words.',
    ),
  authorMatches: z
    .boolean()
    .describe(
      'Author name matches the reference where legible. Same rule as title: unreadable does not fail it; only clearly-different words fail it.',
    ),
  notAStandin: z
    .boolean()
    .describe(
      'This is the actual book from the reference, not a generic stand-in fitting the same genre. A stand-in is when the cover art is clearly different but happens to vibe similarly. If the cover art matches you can trust this one.',
    ),
  reason: z
    .string()
    .max(280)
    .describe('One short sentence stating which criterion failed, if any.'),
});

const SET_INSTRUCTION = `IMAGE A shows a set of books (a duet, trilogy, series). IMAGE B is a generated photograph featuring the set together. Each book in B may be angled, partially overlapping, or in shadow - that is fine. Apply the criteria across the WHOLE set: a missing book or a substituted stand-in for any one fails the relevant criterion; a faithful set rendered with photographic angle/lighting passes.`;
const SINGLE_INSTRUCTION = `IMAGE A is the original book cover, presented head-on. IMAGE B is a generated photograph meant to feature the SAME book inside a styled scene, so the book may be angled, small, in shadow, or partially obscured - this is a photograph, not a flat scan. You are checking identity, not legibility. A small or angled book whose cover art clearly matches the reference is a pass even if you cannot read the title text.`;

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
            'You are a fair-but-careful visual verifier. The reference is a flat cover image; the generated image is a photograph of the book in a scene, so the book may be tilted, small, or partly shadowed. Identity is what matters, not whether every word is legible. The only criterion to mark FALSE is one where you have clear evidence AGAINST it - never on "I cannot tell." If the cover art clearly matches the reference, the book is the right book. The single failure case you must catch is a stand-in: a cover whose art is clearly different but feels genre-adjacent. ' +
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
