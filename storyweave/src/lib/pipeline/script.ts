import { generateObject } from 'ai';
import { z } from 'zod';
import { env } from '../config';

/**
 * Stage: script. One LLM call decomposes the premise into scenes.
 *
 * The image prompt deliberately EXCLUDES character appearance and art style —
 * those are injected mechanically at generation time from the locked
 * character descriptions and the story's style lock. If the model wrote
 * "red-haired woman" itself it would paraphrase differently every scene and
 * fight the lock.
 */

const SHOTS = ['wide', 'medium', 'close'] as const;
const FOCUSES = ['center', 'upper-left', 'upper-right', 'lower-left', 'lower-right', 'left', 'right'] as const;
const MOODS = ['somber', 'tense', 'hopeful', 'wonder', 'calm', 'ominous'] as const;

const SECONDS_PER_SCENE = 18;
const WORDS_PER_SECOND = 2.6;

export type ScriptScene = {
  narration: string;
  imagePrompt: string;
  characterSlugs: string[];
  shot: string;
  focus: string;
  mood: string;
};

const SceneSchema = z.object({
  narration: z.string(),
  imagePrompt: z.string(),
  charactersInScene: z.array(z.string()).default([]),
  shot: z.enum(SHOTS).default('medium'),
  focus: z.enum(FOCUSES).default('center'),
  mood: z.enum(MOODS).default('calm'),
});

export async function generateScript(args: {
  title: string;
  premise: string;
  targetMinutes: number;
  characters: { slug: string; description: string }[];
}): Promise<ScriptScene[]> {
  const targetScenes = Math.max(2, Math.round((args.targetMinutes * 60) / SECONDS_PER_SCENE));
  const wordsPerScene = Math.round(SECONDS_PER_SCENE * WORDS_PER_SECOND);

  if (env().DRY_RUN) {
    return stubScript(args, targetScenes, wordsPerScene);
  }

  const knownSlugs = new Set(args.characters.map((c) => c.slug));
  const charLines = args.characters.map((c) => `- ${c.slug}: ${c.description}`).join('\n');

  const { object } = await generateObject({
    model: env().SCRIPT_MODEL,
    schema: z.object({ scenes: z.array(SceneSchema).min(2) }),
    system: [
      'You are a story-video director. Break a premise into scenes for an',
      'illustrated, narrated video.',
      `Produce about ${targetScenes} scenes. Each narration is ~${wordsPerScene} words`,
      'of engaging spoken prose that flows from scene to scene.',
      'imagePrompt describes composition and action ONLY — never a character\'s',
      'appearance and never an art style; refer to characters by their slug.',
      '`focus` marks where the visual interest sits (it drives the camera move).',
      'Vary shot and mood with the arc of the story.',
    ].join(' '),
    prompt: `Title: ${args.title}\nPremise: ${args.premise}\nCharacters:\n${charLines}`,
  });

  return object.scenes.map((s) => ({
    narration: s.narration,
    imagePrompt: s.imagePrompt,
    characterSlugs: s.charactersInScene.filter((c) => knownSlugs.has(c)),
    shot: s.shot,
    focus: s.focus,
    mood: s.mood,
  }));
}

/** Deterministic offline script so DRY_RUN exercises the full pipeline. */
function stubScript(
  args: { title: string; characters: { slug: string }[] },
  targetScenes: number,
  wordsPerScene: number,
): ScriptScene[] {
  const beats = (i: number, n: number): { stage: string; shot: string; mood: string } => {
    const frac = n <= 1 ? 0 : i / (n - 1);
    if (frac < 0.15) return { stage: 'establish', shot: 'wide', mood: 'wonder' };
    if (frac < 0.45) return { stage: 'rising', shot: 'medium', mood: 'hopeful' };
    if (frac < 0.7) return { stage: 'complication', shot: 'medium', mood: 'tense' };
    if (frac < 0.9) return { stage: 'climax', shot: 'close', mood: 'ominous' };
    return { stage: 'resolution', shot: 'wide', mood: 'calm' };
  };
  const subjects = [
    'a lone figure at the edge of a wide landscape',
    'a weathered doorway opening onto an unknown interior',
    'two figures facing each other across a small room',
    'a hand reaching toward an object just out of frame',
    'a distant silhouette against a dramatic sky',
    'an object resting on a table, lit from one side',
  ];
  const focuses = ['center', 'upper-left', 'right', 'lower-right', 'left', 'upper-right'];
  const filler =
    'The scene unfolded slowly, image by image, the way these stories always do. ' +
    'Details gathered at the edges. The moment held, then moved on.';

  const scenes: ScriptScene[] = [];
  for (let i = 0; i < targetScenes; i++) {
    const { shot, mood } = beats(i, targetScenes);
    const who = args.characters.length > 0 ? [args.characters[i % args.characters.length].slug] : [];
    let narration = `Scene ${i + 1} of ${targetScenes} in ${args.title}. ${filler}`;
    while (narration.split(' ').length < wordsPerScene) narration += ` ${filler}`;
    narration = narration.split(' ').slice(0, wordsPerScene).join(' ');
    scenes.push({
      narration,
      imagePrompt: `${subjects[i % subjects.length]}, ${shot} shot, cinematic composition`,
      characterSlugs: who,
      shot,
      focus: focuses[i % focuses.length],
      mood,
    });
  }
  return scenes;
}
