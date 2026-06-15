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
      ? `BOOK IDENTITY (non-negotiable): The reference image shows a set of books (a duet, trilogy, or series). Every single book visible in the reference must appear in the output, all of them together. Reproduce each cover's art, title, and author identically. Do not omit any book from the set, do not invent additional books, do not redesign covers, do not substitute generic stand-ins. A reader must be able to match every rendered book to the reference one-for-one.`
      : `BOOK IDENTITY (non-negotiable): The book in the reference image is the exact book to render. Reproduce its cover art, title, and author identically. Do not invent a different book, redesign the cover, simplify it, or substitute a generic stand-in. The book in the output must be visually the same book a reader could pick up off a shelf and match to the reference.`;

  const composition =
    kind === 'set'
      ? `COMPOSITION: The books sit together as a set just below the center of the frame, all covers fully visible (stacked, fanned, lined up, or arranged so each one reads clearly), with a clear, uncluttered area above for caption text to sit cleanly.`
      : `COMPOSITION: The book sits just below the center of the frame, with a clear, uncluttered area above it for caption text to sit cleanly.`;

  const label =
    kind === 'set'
      ? `Set label (do not render the title text): ${bookTitle}`
      : `Book label (do not render the title text): ${bookTitle}`;

  return `Generate one photographic still. Build the scene strictly from the design rules below. Do not introduce any element these rules do not call for. Do not invent settings, props, or environments.

DESIGN RULES (drives every visual choice in this image):
${recipe}

${identity}

${composition}

Selected props to include in the scene:
${accessoryList}${variation}

Output: a single photographic still. No text overlays. No captions baked into the image.

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
