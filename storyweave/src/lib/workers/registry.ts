import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { enqueue, JOB_NAMES, type JobName } from '../queue';
import { logEvent } from '../events';
import { generateScript } from '../pipeline/script';
import { buildCastPrompt, buildScenePrompt, generateImage } from '../pipeline/images';
import { synthesizeNarration } from '../pipeline/voice';
import { assembleClips, renderSceneClip } from '../render/ffmpeg';

/**
 * Job handlers, worked by /api/cron/worker one batch per tick.
 *
 * Orchestration is a single idempotent `story.advance` job: it looks at what
 * exists in the DB and enqueues whatever unit work is missing (deduped with
 * singleton keys), then every unit job re-enqueues advance when it finishes.
 * The filesystem-is-state idea from the prototype, translated to rows: a
 * scene with no image gets an image job, a story whose scenes all have clips
 * gets an assemble job, and so on. Regeneration is just clearing columns.
 *
 * Heavy queues run batchSize 1-2 so a tick stays inside the 300s budget.
 */

type Handler = (data: unknown, jobId: string) => Promise<void>;

const REGISTRY: Partial<Record<JobName, { handler: Handler; batchSize: number }>> = {
  [JOB_NAMES.TEST_ECHO]: { handler: handleTestEcho, batchSize: 10 },
  [JOB_NAMES.STORY_ADVANCE]: { handler: handleAdvance, batchSize: 5 },
  [JOB_NAMES.STORY_SCRIPT]: { handler: wrapStory('script', handleScript), batchSize: 1 },
  [JOB_NAMES.STORY_CAST]: { handler: wrapStory('cast', handleCast), batchSize: 1 },
  [JOB_NAMES.SCENE_IMAGE]: { handler: wrapScene('image', handleSceneImage), batchSize: 2 },
  [JOB_NAMES.SCENE_VOICE]: { handler: wrapScene('voice', handleSceneVoice), batchSize: 5 },
  [JOB_NAMES.SCENE_CLIP]: { handler: wrapScene('clip', handleSceneClip), batchSize: 2 },
  [JOB_NAMES.STORY_ASSEMBLE]: { handler: wrapStory('assemble', handleAssemble), batchSize: 1 },
};

export function getHandler(name: JobName): Handler | undefined {
  return REGISTRY[name]?.handler;
}
export function getBatchSize(name: JobName): number {
  return REGISTRY[name]?.batchSize ?? 1;
}
export function registeredQueues(): JobName[] {
  return Object.keys(REGISTRY) as JobName[];
}

function pickString(data: unknown, key: string): string {
  const value = (data as Record<string, unknown> | null)?.[key];
  if (typeof value !== 'string' || !value) throw new Error(`job data missing ${key}`);
  return value;
}

export async function requestAdvance(storyId: string): Promise<void> {
  await enqueue(JOB_NAMES.STORY_ADVANCE, { storyId }, { singletonKey: `advance:${storyId}` });
}

// ---------------------------------------------------------------------------
// test.echo — the stage-1 round-trip harness
// ---------------------------------------------------------------------------

async function handleTestEcho(data: unknown): Promise<void> {
  await logEvent({
    stage: 'queue.test',
    message: 'echo job processed',
    payload: data ?? null,
  });
}

// ---------------------------------------------------------------------------
// story.advance — the orchestrator
// ---------------------------------------------------------------------------

async function handleAdvance(data: unknown): Promise<void> {
  const storyId = pickString(data, 'storyId');
  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story) return;
  const chars = await db.query.characters.findMany({
    where: eq(schema.characters.storyId, storyId),
  });
  const sceneRows = await db.query.scenes.findMany({
    where: eq(schema.scenes.storyId, storyId),
    orderBy: asc(schema.scenes.idx),
  });

  const setStatus = async (status: (typeof schema.storyStatus.enumValues)[number]) => {
    if (story.status !== status) {
      await db
        .update(schema.stories)
        .set({ status, updatedAt: new Date() })
        .where(eq(schema.stories.id, storyId));
    }
  };

  // 1. No scenes yet → write the script.
  if (sceneRows.length === 0) {
    await setStatus('scripting');
    await enqueue(JOB_NAMES.STORY_SCRIPT, { storyId }, { singletonKey: `script:${storyId}` });
    return;
  }

  // 2. Characters without reference images → cast stage.
  if (chars.some((c) => c.referenceImages.length === 0)) {
    await setStatus('casting');
    await enqueue(JOB_NAMES.STORY_CAST, { storyId }, { singletonKey: `cast:${storyId}` });
    return;
  }

  // 3. Scene images and narration (independent, run in the same phase).
  const needImage = sceneRows.filter((s) => !s.imageUrl);
  const needVoice = sceneRows.filter((s) => !s.audioUrl);
  if (needImage.length > 0 || needVoice.length > 0) {
    await setStatus('generating');
    for (const s of needImage) {
      await enqueue(JOB_NAMES.SCENE_IMAGE, { sceneId: s.id }, { singletonKey: `image:${s.id}` });
    }
    for (const s of needVoice) {
      await enqueue(JOB_NAMES.SCENE_VOICE, { sceneId: s.id }, { singletonKey: `voice:${s.id}` });
    }
    return;
  }

  // 4. Per-scene clips.
  const needClip = sceneRows.filter((s) => !s.clipUrl);
  if (needClip.length > 0) {
    await setStatus('rendering');
    for (const s of needClip) {
      await enqueue(JOB_NAMES.SCENE_CLIP, { sceneId: s.id }, { singletonKey: `clip:${s.id}` });
    }
    return;
  }

  // 5. Final assembly.
  if (!story.videoBlobUrl) {
    await setStatus('rendering');
    await enqueue(JOB_NAMES.STORY_ASSEMBLE, { storyId }, { singletonKey: `assemble:${storyId}` });
    return;
  }

  // 6. Done.
  if (story.status !== 'ready') {
    await db
      .update(schema.stories)
      .set({ status: 'ready', errorInfo: null, updatedAt: new Date() })
      .where(eq(schema.stories.id, storyId));
    await logEvent({ ownerId: story.ownerId, storyId, stage: 'story', message: 'story is ready' });
  }
}

// ---------------------------------------------------------------------------
// Unit jobs
// ---------------------------------------------------------------------------

async function handleScript(storyId: string): Promise<void> {
  const story = await mustStory(storyId);
  if ((await db.query.scenes.findMany({ where: eq(schema.scenes.storyId, storyId) })).length > 0) {
    return requestAdvance(storyId); // already scripted (retry after partial failure)
  }
  const chars = await db.query.characters.findMany({
    where: eq(schema.characters.storyId, storyId),
  });
  const scenes = await generateScript({
    title: story.title,
    premise: story.premise,
    targetMinutes: story.targetMinutes,
    characters: chars.map((c) => ({ slug: c.slug, description: c.description })),
  });
  await db.insert(schema.scenes).values(
    scenes.map((s, i) => ({
      storyId,
      idx: i,
      narration: s.narration,
      imagePrompt: s.imagePrompt,
      characterSlugs: s.characterSlugs,
      shot: s.shot,
      focus: s.focus,
      mood: s.mood,
    })),
  );
  await logEvent({
    ownerId: story.ownerId,
    storyId,
    stage: 'script',
    message: `script written: ${scenes.length} scenes`,
  });
  await requestAdvance(storyId);
}

async function handleCast(storyId: string): Promise<void> {
  const story = await mustStory(storyId);
  const chars = await db.query.characters.findMany({
    where: eq(schema.characters.storyId, storyId),
  });
  const angles = ['front portrait', 'full body, three-quarter view'];
  for (const character of chars) {
    if (character.referenceImages.length > 0) continue;
    const refs = [];
    for (let i = 0; i < angles.length; i++) {
      const stored = await generateImage({
        prompt: buildCastPrompt({
          angle: angles[i],
          description: character.description,
          style: story.style,
        }),
        referenceUrls: refs.map((r) => r.url), // 2nd angle references the 1st
        pathname: `stories/${story.ownerId}/${storyId}/cast/${character.slug}_${i + 1}.png`,
      });
      refs.push(stored);
    }
    await db
      .update(schema.characters)
      .set({ referenceImages: refs })
      .where(eq(schema.characters.id, character.id));
    await logEvent({
      ownerId: story.ownerId,
      storyId,
      stage: 'cast',
      message: `cast ${character.slug}: ${refs.length} reference images`,
    });
  }
  await requestAdvance(storyId);
}

async function handleSceneImage(sceneId: string): Promise<void> {
  const { scene, story } = await mustScene(sceneId);
  const chars = await db.query.characters.findMany({
    where: eq(schema.characters.storyId, story.id),
  });
  const inScene = chars.filter((c) => scene.characterSlugs.includes(c.slug));
  const stored = await generateImage({
    prompt: buildScenePrompt({
      imagePrompt: scene.imagePrompt,
      shot: scene.shot,
      characterDescriptions: inScene.map((c) => c.description),
      style: story.style,
    }),
    referenceUrls: inScene.flatMap((c) => c.referenceImages.map((r) => r.url)),
    pathname: `stories/${story.ownerId}/${story.id}/scenes/${String(scene.idx).padStart(3, '0')}.png`,
  });
  await db
    .update(schema.scenes)
    .set({
      imageUrl: stored.url,
      imagePathname: stored.pathname,
      // New image invalidates the old clip (and the assembled video).
      clipUrl: null,
      clipPathname: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenes.id, sceneId));
  await logEvent({
    ownerId: story.ownerId,
    storyId: story.id,
    stage: 'image',
    message: `scene ${scene.idx + 1}: image generated`,
  });
  await requestAdvance(story.id);
}

async function handleSceneVoice(sceneId: string): Promise<void> {
  const { scene, story } = await mustScene(sceneId);
  const result = await synthesizeNarration({
    text: scene.narration,
    pathnameBase: `stories/${story.ownerId}/${story.id}/audio/${String(scene.idx).padStart(3, '0')}`,
  });
  await db
    .update(schema.scenes)
    .set({
      audioUrl: result.stored.url,
      audioPathname: result.stored.pathname,
      audioDurationSeconds: result.durationSeconds,
      words: result.words,
      clipUrl: null,
      clipPathname: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.scenes.id, sceneId));
  await logEvent({
    ownerId: story.ownerId,
    storyId: story.id,
    stage: 'voice',
    message: `scene ${scene.idx + 1}: narration ${result.durationSeconds.toFixed(1)}s`,
  });
  await requestAdvance(story.id);
}

async function handleSceneClip(sceneId: string): Promise<void> {
  const { scene, story } = await mustScene(sceneId);
  if (!scene.imageUrl || !scene.audioUrl || scene.audioDurationSeconds == null) {
    return requestAdvance(story.id); // prerequisites regressed; let advance re-plan
  }
  const { stored } = await renderSceneClip({
    imageUrl: scene.imageUrl,
    audioUrl: scene.audioUrl,
    audioDurationSeconds: scene.audioDurationSeconds,
    words: scene.words,
    sceneIdx: scene.idx,
    focus: scene.focus,
    ownerId: story.ownerId,
    storyId: story.id,
  });
  await db
    .update(schema.scenes)
    .set({ clipUrl: stored.url, clipPathname: stored.pathname, updatedAt: new Date() })
    .where(eq(schema.scenes.id, sceneId));
  await logEvent({
    ownerId: story.ownerId,
    storyId: story.id,
    stage: 'clip',
    message: `scene ${scene.idx + 1}: clip rendered`,
  });
  await requestAdvance(story.id);
}

async function handleAssemble(storyId: string): Promise<void> {
  const story = await mustStory(storyId);
  const sceneRows = await db.query.scenes.findMany({
    where: eq(schema.scenes.storyId, storyId),
    orderBy: asc(schema.scenes.idx),
  });
  const clips = sceneRows.map((s) => s.clipUrl);
  if (clips.some((c) => !c)) {
    return requestAdvance(storyId); // a clip was invalidated since we were enqueued
  }
  const { stored, durationSeconds } = await assembleClips({
    clipUrls: clips as string[],
    ownerId: story.ownerId,
    storyId,
  });
  await db
    .update(schema.stories)
    .set({
      videoBlobUrl: stored.url,
      videoBlobPathname: stored.pathname,
      videoDurationSeconds: durationSeconds,
      status: 'ready',
      errorInfo: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.stories.id, storyId));
  await logEvent({
    ownerId: story.ownerId,
    storyId,
    stage: 'assemble',
    message: `final video assembled (${durationSeconds.toFixed(1)}s)`,
  });
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

async function mustStory(storyId: string) {
  const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, storyId) });
  if (!story) throw new Error(`story ${storyId} not found`);
  return story;
}

async function mustScene(sceneId: string) {
  const scene = await db.query.scenes.findFirst({ where: eq(schema.scenes.id, sceneId) });
  if (!scene) throw new Error(`scene ${sceneId} not found`);
  const story = await mustStory(scene.storyId);
  return { scene, story };
}

/**
 * Failure wrapper: stamp errorInfo + failed on the story, log, rethrow so
 * pg-boss retries (3x, backoff). A later successful retry re-advances the
 * status forward again.
 */
function wrapStory(stage: string, fn: (storyId: string) => Promise<void>): Handler {
  return async (data) => {
    const storyId = pickString(data, 'storyId');
    try {
      await fn(storyId);
    } catch (err) {
      await stampFailure(storyId, stage, err);
      throw err;
    }
  };
}

function wrapScene(stage: string, fn: (sceneId: string) => Promise<void>): Handler {
  return async (data) => {
    const sceneId = pickString(data, 'sceneId');
    try {
      await fn(sceneId);
    } catch (err) {
      const scene = await db.query.scenes
        .findFirst({ where: eq(schema.scenes.id, sceneId) })
        .catch(() => null);
      if (scene) await stampFailure(scene.storyId, stage, err);
      throw err;
    }
  };
}

async function stampFailure(storyId: string, stage: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(schema.stories)
    .set({
      status: 'failed',
      errorInfo: { stage, message, at: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .where(eq(schema.stories.id, storyId))
    .catch(() => {});
  await logEvent({ storyId, level: 'error', stage, message });
}
