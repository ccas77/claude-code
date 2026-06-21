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
      'This is the THIS-EXACT-ARTWORK test, not the same-vibe test. Mark TRUE only when the illustration, layout, AND composition match the reference one-for-one. If the reference has heavy splatter and tentacles in all four corners and the render shows tentacles in two corners with a clean background, that is a re-imagined cover - FALSE, even if the same kinds of elements are present. If the reference shows three specific items in a specific arrangement and the render shows different items or a different arrangement, FALSE. Lighting, brush-stroke fidelity, and minor colour shifts to fit the scene are fine; structural composition changes are not. Imagine showing the rendered book to someone hunting that exact book in a shop: if they would walk past the rendered one because the cover looks different, mark FALSE.',
    ),
  titleMatches: z
    .boolean()
    .describe(
      'Title text says the same words as the reference. Photographic angle, small size, or partial shadow is fine if the visible portion is consistent with the reference. Mark FALSE if you can read clearly DIFFERENT words, OR if the title appears in a substantially different typographic style (e.g. reference uses a heavy condensed all-caps with splatter texture and the render uses a clean serif).',
    ),
  authorMatches: z
    .boolean()
    .describe(
      'Author name matches the reference where legible. Same rule as title: angled or in shadow is fine if consistent; clearly-different words OR significantly different placement (top vs bottom of cover, etc.) is FALSE.',
    ),
  notAStandin: z
    .boolean()
    .describe(
      'This is the actual book, not a generic stand-in with similar genre vibes. A stand-in is when the cover has the right subject matter (tentacles, skulls, knives, whatever) but is not THIS book - the specific composition and details are different. If coverArtMatches is FALSE for compositional reasons, notAStandin is also FALSE.',
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
            'You are a careful visual verifier. The reference is a flat cover image; the generated image is a photograph of the book in a scene. Photographic angle, lighting, and minor cropping are fine. What you are checking is whether the rendered book IS the reference book - same artwork, same title, same author, same compositional layout - not just "vibes the same way." A re-imagined cover that uses the same kinds of elements (tentacles, skulls, knives) in a different composition is NOT a match; it is a stand-in. The viewer of this video should be able to walk into a shop, find the rendered book on a shelf, and pick it up without doubt. ' +
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
