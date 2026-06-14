/**
 * Image-prompt assembler.
 *
 * The boundary is the whole point of the spec: cover and accessories are
 * LOCKED (must appear, stay recognizable), the genre recipe drives the
 * generative scene. Variation per render is encouraged for the scene; the
 * book never changes.
 *
 * This file does not name any genre or aesthetic itself. Whatever is on
 * the genre's recipe field is what the model sees.
 */

export type PromptInputs = {
  bookTitle: string;
  accessories: string[];
  styleRecipe: string | null;
  variationSeed?: string;
};

export function assembleImagePrompt({
  bookTitle,
  accessories,
  styleRecipe,
  variationSeed,
}: PromptInputs): string {
  const accessoryList = accessories.length
    ? accessories.map((a) => `- ${a}`).join('\n')
    : '- (none specified)';

  const recipe = styleRecipe?.trim()
    ? styleRecipe.trim()
    : '(no style recipe yet for this genre; use a balanced, photographic look)';

  const variation = variationSeed
    ? `\nVariation seed: ${variationSeed}. Make different compositional choices than previous renders.`
    : '';

  return `Generate a single photographic still image showing one specific book placed in a scene.

REQUIRED ELEMENTS (must appear, prominently, recognizable):
- The exact book shown in the reference images, treated as a real physical object sitting in the scene (not a flat cover overlay).
- These items, visible in the frame:
${accessoryList}

SCENE STYLE — invent a fresh scene that obeys these design rules:
${recipe}

Render the book as a tangible physical object the viewer could pick up. Vary lighting, framing, and props from previous renders so the result feels original, not a copy of the references.${variation}

Output: a single image. No text overlays.

Book label (for your reference only, do not render): ${bookTitle}`;
}
