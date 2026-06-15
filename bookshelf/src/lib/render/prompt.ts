/**
 * Image-prompt assembler.
 *
 * The recipe is the dominant input. We do not paraphrase, summarize, or
 * extrapolate from it - we hand it to the model verbatim. The only things
 * this file adds are:
 *   - which book to feature (reference images do the heavy lifting)
 *   - which accessories to include
 *   - composition constraint: keep the top of the frame open for caption
 *     overlay; book sits in the lower portion of the frame
 *
 * No scene words ("room", "interior", etc). Those belong to the recipe.
 */

export type PromptInputs = {
  bookTitle: string;
  kind?: 'single' | 'set';
  accessories: string[];
  styleRecipe: string | null;
  variationSeed?: string;
};

const MAX_ACCESSORIES_PER_RENDER = 3;

export function assembleImagePrompt({
  bookTitle,
  kind = 'single',
  accessories,
  styleRecipe,
  variationSeed,
}: PromptInputs): string {
  const picked = pickAccessories(accessories, variationSeed);
  const accessoryList = picked.length
    ? picked.map((a) => `- ${a}`).join('\n')
    : '- (none)';

  const recipe = styleRecipe?.trim()
    ? styleRecipe.trim()
    : '(no recipe yet)';

  const variation = variationSeed
    ? `\nVariation seed: ${variationSeed}. Frame this render differently from any prior render with the same seed prefix.`
    : '';

  const identity =
    kind === 'set'
      ? `RULE 1, ABOVE EVERYTHING ELSE: The reference image shows a set of books. Every single book in the reference must appear in your output. Each cover's art, title, and author must match the reference one-for-one. Pixel-copy what you see. Do not omit any book. Do not invent extra books. Do not redesign, simplify, recolor, or restyle any cover. Do not substitute generic stand-ins. If you cannot read part of a cover, copy it as you see it; do not guess. A reader pulling these books off a shelf must match them to the reference exactly.`
      : `RULE 1, ABOVE EVERYTHING ELSE: The book in the reference image is the exact book to render. Its cover art, title, and author must match the reference one-for-one. Pixel-copy what you see. Do not redesign, simplify, recolor, restyle, or invent a different cover. Do not substitute a generic stand-in. If you cannot read part of the cover, copy it as you see it; do not guess. A reader pulling this book off a shelf must match it to the reference exactly.`;

  const composition =
    kind === 'set'
      ? `Composition: the books sit together as a set, just below frame center, all covers fully visible (stacked, fanned, or lined up). Top of the frame is clear for caption overlay.`
      : `Composition: the book sits just below frame center. Top of the frame is clear for caption overlay.`;

  const label =
    kind === 'set'
      ? `Reference label (do not bake into the image): ${bookTitle}`
      : `Reference label (do not bake into the image): ${bookTitle}`;

  return `${identity}

Now, with that exact book / set rendered faithfully, build the scene around it using the rules below.

Style:
${recipe}

${composition}

Props to include:
${accessoryList}${variation}

Output: one photograph. No text overlays. No captions baked into the image. Cover fidelity beats every other instruction here: if any part of this prompt would force you to alter the cover, ignore that part and keep the cover faithful to the reference.

${label}`;
}

function pickAccessories(all: string[], seed: string | undefined): string[] {
  if (all.length === 0) return [];
  if (all.length <= MAX_ACCESSORIES_PER_RENDER) return all;
  const seeded = seed ? hashSeed(seed) : Math.floor(Math.random() * 1e9);
  const indices = all.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = nextInt(seeded + i, i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, MAX_ACCESSORIES_PER_RENDER).map((i) => all[i]);
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextInt(state: number, max: number): number {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return Math.abs(x) % max;
}
