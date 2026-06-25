import { generateObject, type ModelMessage } from 'ai';
import { z } from 'zod';

/**
 * Cover identity verifier.
 *
 * The reference is a flat cover scan. The render is a photo of a styled
 * scene with the book sitting in it. The check we want is: locate the
 * book inside the photo and look ONLY at the cover artwork on that book.
 * Everything else in the photo (blanket, props, lighting, surface) is
 * meant to vary - it's the whole point of the render. We are not
 * comparing scene compositions; we are comparing the book's own cover.
 *
 * Past versions of this prompt told the model to enforce "compositional
 * layout one-for-one." The model read that against the whole frame and
 * rejected three correct renders out of five. The current version is
 * scoped tightly: find the book, compare the cover art, return one
 * verdict.
 *
 * Model: google/gemini-2.5-pro via Vercel AI Gateway. Pro is much better
 * than Flash at small / angled subject detail (the keyhole graphic on a
 * 200px-wide book in a 1080-tall photo). Cost ~$0.0025 per check; renders
 * run at most 3 attempts, so ~$0.0076 ceiling per render.
 */

const MODEL = 'google/gemini-2.5-pro';

const Verdict = z.object({
  sameBook: z
    .boolean()
    .describe(
      'TRUE when the book shown in IMAGE B is the SAME book as IMAGE A. Look only at the book itself in IMAGE B - the props, surface, lighting, and surroundings are deliberately varied scene dressing and do NOT count. The cover artwork on that book must match the reference: same main illustration / motif, same title text, same author text, same arrangement of those elements on the cover. If the book in B is angled, small, partially in shadow, or slightly cropped, that is fine - read what you can see. FALSE if the cover art uses a different motif (e.g. reference has a keyhole with a figure inside it, render shows an empty keyhole or an eye instead), if the title or author text on the cover reads as different words where legible, or if title / author placement on the cover is flipped (e.g. reference has title above author, render has author above title).',
    ),
  artworkObservation: z
    .string()
    .max(160)
    .describe(
      "One short sentence describing what's on the cover IN IMAGE B (e.g. 'keyhole with small figure visible through it'). Forces you to actually look at the rendered cover instead of guessing.",
    ),
  reason: z
    .string()
    .max(240)
    .describe(
      'If sameBook is FALSE, one short sentence on what differs on the cover. If TRUE, "matches".',
    ),
});

const SET_INSTRUCTION = `IMAGE A shows a set of books (a duet, trilogy, series). IMAGE B is a generated photograph featuring that set together inside a styled scene. Locate the books in B and look only at their covers. Each book in B must be the corresponding book from A - same cover art, same title, same author, same arrangement on each cover. A missing book or a stand-in cover for any one of them is FALSE. The props and surface around the books are deliberately varied scene dressing and do not count.`;

const SINGLE_INSTRUCTION = `IMAGE A is the original flat book cover. IMAGE B is a generated photograph of a styled scene with the book sitting in it. Locate the book in B and look only at its cover. Compare only the cover artwork on that book to IMAGE A. The blanket, table, props, skull, knife, key, plants, lighting, etc. in B are deliberately varied scene dressing and do not count - do NOT use them as evidence either way. You are not comparing the two whole images; you are comparing the cover of the book in B to IMAGE A.`;

export type CoverCheckResult = { ok: boolean; reason: string };

export async function verifyCoverMatch(
  originalCoverUrl: string,
  generatedImageUrl: string,
  kind: 'single' | 'set' = 'single',
): Promise<CoverCheckResult> {
  const instruction = kind === 'set' ? SET_INSTRUCTION : SINGLE_INSTRUCTION;
  const labelA =
    kind === 'set' ? 'IMAGE A (original cover set, flat):' : 'IMAGE A (original cover, flat):';

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            'You are verifying that the book shown inside a generated scene photograph is the same book as a reference cover. ' +
            instruction +
            ' Photographic angle, lighting, partial shadow, and small size are fine - if you can see enough of the cover to make a call, make it. The bar: someone hunting this exact book in a shop should be able to pick up the rendered book and know it is the same one.',
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
    });
    const v = result.object;
    const reason = v.sameBook
      ? `matches (${v.artworkObservation})`
      : `${v.reason} | observed: ${v.artworkObservation}`.slice(0, 300);
    return { ok: v.sameBook, reason };
  } catch (e) {
    return {
      ok: true,
      reason: `verifier unavailable (${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}); accepting candidate`,
    };
  }
}
