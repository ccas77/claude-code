/**
 * Genre-neutral system prompt for style-recipe distillation.
 *
 * The whole point of this step is that the *images* tell the model what the
 * genre looks like - we don't want our prompt to predispose the model toward
 * any vocabulary. So this text doesn't name any genre, mood, or aesthetic.
 */
export const RECIPE_PROMPT = `You are shown a set of reference images that belong to the same visual category.

Study them and extract the design rules they share. Your goal is a generative recipe: a description that lets an image model invent fresh new scenes that obey these rules, not a description of any single one of the references.

Output a single coherent recipe, in plain prose, covering:

- palette and color relationships
- lighting, contrast, time of day
- composition, framing, depth
- recurring props and objects
- textures and materials
- typography or text styling if visible
- overall mood and atmosphere
- what is conspicuously absent

Be specific and observational. Avoid genre labels and brand names. Describe what you see, not what you assume. The recipe should be reusable across many different subjects, not tied to any one scene.`;
