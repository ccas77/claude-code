import { PgBoss } from 'pg-boss';
import { env } from './config';

/**
 * Job queue, Postgres-backed via pg-boss. No extra infra.
 *
 * Why pg-boss: atomic with our DB, transactional enqueue, built-in retries,
 * scheduling, and cron - exactly what the prepare-ahead clock needs in Stage 6.
 *
 * Stage 1 just proves the round-trip: enqueue → worker picks up → execute.
 */

export const JOB_NAMES = {
  TEST_ECHO: 'test.echo',
  TRANSCRIBE_MUSIC: 'music.transcribe',
  DISTILL_RECIPE: 'genre.distill_recipe',
  RENDER_CARD: 'card.render',
  POST_CARD: 'card.post',
  REFRESH_STATS: 'card.refresh_stats',
  RETRY_FAILURES: 'system.retry_failures',
  PREPARE_AHEAD: 'system.prepare_ahead',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

declare global {
  var __bookshelf_boss: PgBoss | undefined;
  var __bookshelf_boss_starting: Promise<PgBoss> | undefined;
}

export async function boss(): Promise<PgBoss> {
  if (global.__bookshelf_boss) return global.__bookshelf_boss;
  if (global.__bookshelf_boss_starting) return global.__bookshelf_boss_starting;

  global.__bookshelf_boss_starting = (async () => {
    const instance = new PgBoss({
      connectionString: env().DATABASE_URL,
      schema: 'pgboss',
    });
    instance.on('error', (err: Error) => {
      console.error('[pg-boss]', err);
    });
    await instance.start();
    global.__bookshelf_boss = instance;
    return instance;
  })();

  return global.__bookshelf_boss_starting;
}

export async function enqueue<T extends object>(
  name: JobName,
  data: T,
  opts?: { startAfter?: Date | number; singletonKey?: string; retryLimit?: number },
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
