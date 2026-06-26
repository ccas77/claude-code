import { generateObject, type ModelMessage } from 'ai';
import { z } from 'zod';

/**
 * Cover identity verifier.
 *
 * IMAGE A is the flat reference cover. IMAGE B is a styled scene
 * photograph with the book sitting inside it. We are checking the
 * book's own cover, not the photograph's composition. The blanket,
 * props, lighting, and surroundings in B are deliberately varied
 * scene dressing and never count toward this check.
 *
 * The structure is: force the model to first WRITE DOWN what's on the
 * rendered cover (illustration, title text, author text, top/bottom
 * placement). Only then ask the per-criterion booleans. If the model
 * has to commit to "I see an empty keyhole and the title 'THE KEYHOLE'
 * at the top" before voting, it stops shrugging. All four booleans must
 * pass; one failure is a failure.
 *
 * Model: google/gemini-2.5-pro via Vercel AI Gateway. Pro is much better
 * than Flash at small / angled subject detail. ~$0.0025 per check; renders
 * run at most 3 attempts, so ~$0.0076 ceiling per render.
 */

const MODEL = 'google/gemini-2.5-pro';

const Verdict = z.object({
  referenceObservation: z
    .string()
    .max(220)
    .describe(
      'Describe IMAGE A (the flat reference cover) in one sentence: the central illustration / motif, the title text (exact words), the author text (exact words), and whether the title sits above or below the author. Example: "Central illustration is a keyhole with a small figure visible through it; title \'THE KEYHOLE\' sits below the keyhole; author \'GIGI STYX\' sits below the title."',
    ),
  renderedObservation: z
    .string()
    .max(220)
    .describe(
      "Find the book inside IMAGE B and describe ONLY its cover in one sentence (ignore the blanket, props, surface, lighting, skull, knife, key, plant, etc.): the central illustration / motif, the title text (exact words if legible, else 'not legible'), the author text (exact words if legible, else 'not legible'), and the relative placement (title above or below author). Be specific about the motif - 'keyhole with figure visible through it' is different from 'empty keyhole' is different from 'eye visible through keyhole'.",
    ),
  coverArtworkMatches: z
    .boolean()
    .describe(
      "Does the central illustration / motif on the rendered cover MATCH the reference? Compare your two observations above, not vibes. If the reference shows a keyhole with a figure inside it and the rendered cover shows an empty keyhole, FALSE - different motif. If the reference shows a figure in the keyhole and the rendered shows an eye in the keyhole, FALSE - different motif. Same kind-of-thing isn't enough; it must be the same specific illustration. Minor colour or lighting shifts from being photographed are fine.",
    ),
  titleTextMatches: z
    .boolean()
    .describe(
      "Does the title text on the rendered cover read as the SAME WORDS as the reference, where legible? If the title is partially shadowed or angled but the visible letters are consistent with the reference, TRUE. If you can clearly read different words, FALSE. If the title is entirely not legible (deep shadow, extreme crop), default to TRUE - don't punish photographic conditions.",
    ),
  authorTextMatches: z
    .boolean()
    .describe(
      "Does the author text on the rendered cover read as the SAME WORDS as the reference, where legible? Same rule as title: partial visibility consistent with the reference is TRUE; clearly-different words are FALSE; entirely unreadable defaults to TRUE.",
    ),
  layoutMatches: z
    .boolean()
    .describe(
      "Is the title vs author PLACEMENT on the rendered cover the same as the reference (e.g. both have title above author, or both have title below author)? FALSE if the reference has title-above-author but the rendered cover has author-above-title, or vice versa. Use your two observations above. This is about the cover's own internal layout, NOT the photograph's framing.",
    ),
  reason: z
    .string()
    .max(240)
    .describe(
      'If any boolean is FALSE, one short sentence naming which one and why (referencing your observations). If all TRUE, "matches".',
    ),
});

const SET_INSTRUCTION = `IMAGE A shows a set of books (a duet, trilogy, series). IMAGE B is a generated scene with that set sitting inside it. Apply the cover criteria across the WHOLE set: a missing book OR a stand-in cover for any one of them fails the relevant criterion. The blanket, props, surface, lighting, etc. in B are deliberately varied and do NOT count toward this check.`;

const SINGLE_INSTRUCTION = `IMAGE A is the flat reference cover. IMAGE B is a generated scene with the book sitting inside it. Locate the book in B and look ONLY at its cover. The blanket, table, props, skull, knife, key, plant, lighting, etc. in B are deliberately varied scene dressing and do NOT count toward this check. You are not comparing the two whole images; you are comparing the cover of the book in B to IMAGE A.`;

export type CoverCheckResult = { ok: boolean; reason: string };

export async function verifyCoverMatch(
  originalCoverUrl: string,
  generatedImageUrl: string,
  kind: 'single' | 'set' = 'single',
): Promise<CoverCheckResult> {
  const instruction = kind === 'set' ? SET_INSTRUCTION : SINGLE_INSTRUCTION;
  const labelA =
    kind === 'set' ? 'IMAGE A (reference cover set, flat):' : 'IMAGE A (reference cover, flat):';

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'You are verifying that the book shown inside a generated scene photograph is the same book as a reference cover. ' +
            instruction +
            ' First write down what you see on the reference cover, then write down what you see on the rendered cover (ignoring the scene around it), then answer the per-criterion booleans against your two observations. Do not skip the observation fields. Photographic angle, lighting, partial shadow, and small size are fine - if the visible portion is consistent with the reference, that criterion passes; if a portion is entirely unreadable, default to passing rather than punishing photographic conditions. The bar: someone hunting this exact book in a shop should be able to pick up the rendered book and know it is the same one.',
        },
        { type: 'text', text: labelA },
        { type: 'image', image: new URL(originalCoverUrl) },
        { type: 'text', text: 'IMAGE B (generated scene; find the book within it):' },
        { type: 'image', image: new URL(generatedImageUrl) },
      ],
    },
  ];

  try {
    const result = await generateObject({
      model: MODEL,
      schema: Verdict,
      messages,
      temperature: 0,
    });
    const v = result.object;
    const ok =
      v.coverArtworkMatches &&
      v.titleTextMatches &&
      v.authorTextMatches &&
      v.layoutMatches;
    const failed: string[] = [];
    if (!v.coverArtworkMatches) failed.push('cover artwork');
    if (!v.titleTextMatches) failed.push('title text');
    if (!v.authorTextMatches) failed.push('author text');
    if (!v.layoutMatches) failed.push('layout');
    const summary = ok
      ? `matches | rendered: ${v.renderedObservation}`
      : `${failed.join(', ')} failed. ${v.reason} | rendered: ${v.renderedObservation}`;
    return { ok, reason: summary.slice(0, 360) };
  } catch (e) {
    return {
      ok: true,
      reason: `verifier unavailable (${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}); accepting candidate`,
    };
  }
}
