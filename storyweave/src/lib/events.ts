import { db, schema } from './db/client';

/**
 * Append-only audit spine. Every pipeline stage writes a row here; the story
 * page surfaces recent rows as the live progress log.
 */
export async function logEvent(args: {
  ownerId?: string | null;
  storyId?: string | null;
  level?: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  payload?: unknown;
}): Promise<void> {
  try {
    await db.insert(schema.eventLog).values({
      ownerId: args.ownerId ?? null,
      storyId: args.storyId ?? null,
      level: args.level ?? 'info',
      stage: args.stage,
      message: args.message,
      payload: args.payload ?? null,
    });
  } catch (err) {
    // Logging must never take down the pipeline.
    console.error('[event_log]', err);
  }
}
