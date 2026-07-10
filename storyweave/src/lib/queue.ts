import { PgBoss } from 'pg-boss';
import { env } from './config';

/**
 * pg-boss on the same Postgres as the app (its own `pgboss` schema), worked
 * by the per-minute Vercel Cron at /api/cron/worker. Same pattern as
 * bookshelf: one cached boss instance per process, pull-a-batch-per-tick.
 */

declare global {
  var __storyweave_boss: PgBoss | undefined;
  var __storyweave_boss_starting: Promise<PgBoss> | undefined;
}

export async function boss(): Promise<PgBoss> {
  if (global.__storyweave_boss) return global.__storyweave_boss;
  if (global.__storyweave_boss_starting) return global.__storyweave_boss_starting;
  global.__storyweave_boss_starting = (async () => {
    const instance = new PgBoss({ connectionString: env().DATABASE_URL, schema: 'pgboss' });
    instance.on('error', (err) => console.error('[pg-boss]', err));
    await instance.start();
    global.__storyweave_boss = instance;
    return instance;
  })();
  return global.__storyweave_boss_starting;
}

export const JOB_NAMES = {
  TEST_ECHO: 'test.echo',
  STORY_ADVANCE: 'story.advance',
  STORY_SCRIPT: 'story.script',
  STORY_CAST: 'story.cast',
  SCENE_IMAGE: 'scene.image',
  SCENE_VOICE: 'scene.voice',
  SCENE_CLIP: 'scene.clip',
  STORY_ASSEMBLE: 'story.assemble',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export async function enqueue<T extends object>(
  name: JobName,
  data: T,
  opts?: { retryLimit?: number; startAfter?: number; singletonKey?: string },
): Promise<string | null> {
  const b = await boss();
  await b.createQueue(name).catch(() => {});
  return b.send(name, data, {
    retryLimit: opts?.retryLimit ?? 3,
    retryBackoff: true,
    ...(opts?.startAfter !== undefined ? { startAfter: opts.startAfter } : {}),
    ...(opts?.singletonKey ? { singletonKey: opts.singletonKey } : {}),
  });
}
