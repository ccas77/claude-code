import { db, schema } from '../db/client';
import { JOB_NAMES, type JobName } from '../queue';
import { runTranscription } from '../transcription';
import { runRecipeDistillation } from '../recipe/distill';
import { runRender } from '../render';
import { runPost } from '../posting/run';
import { runStatsRefresh } from '../posting/refreshStats';
import { runRetryFailures, notifyOnTerminalFailure } from '../clocks/retryFailures';

/**
 * Worker handlers, one per queue name. Triggered by /api/cron/worker on every
 * cron tick. Each handler processes one job from its queue.
 *
 * Heavy queues (transcribe, recipe, render, post) set batchSize=1 so a single
 * tick doesn't blow the 300s function budget. Light queues batch up.
 */

export type Handler = (data: unknown, jobId: string) => Promise<void>;

type Slot = { handler: Handler; batchSize: number };

const pickString = (data: unknown, key: string): string | null => {
  if (data && typeof data === 'object' && key in data) {
    const v = (data as Record<string, unknown>)[key];
    return v == null ? null : String(v);
  }
  return null;
};

const handlers: Partial<Record<JobName, Slot>> = {
  [JOB_NAMES.TEST_ECHO]: {
    batchSize: 10,
    handler: async (data, jobId) => {
      const message = pickString(data, 'message') ?? '';
      await db.insert(schema.eventLog).values({
        stage: 'queue.test',
        level: 'info',
        message: `echo: ${message}`,
        payload: { jobId },
      });
    },
  },

  [JOB_NAMES.TRANSCRIBE_MUSIC]: {
    batchSize: 1,
    handler: async (data, jobId) => {
      const musicClipId = pickString(data, 'musicClipId');
      if (!musicClipId) return;
      await runTranscription({ musicClipId, jobId });
    },
  },

  [JOB_NAMES.DISTILL_RECIPE]: {
    batchSize: 1,
    handler: async (data, jobId) => {
      const genreId = pickString(data, 'genreId');
      if (!genreId) return;
      await runRecipeDistillation({ genreId, jobId });
    },
  },

  [JOB_NAMES.RENDER_CARD]: {
    batchSize: 1,
    handler: async (data, jobId) => {
      const cardId = pickString(data, 'cardId');
      if (!cardId) return;
      try {
        await runRender({ cardId, jobId });
      } catch {
        await notifyOnTerminalFailure(cardId);
        throw new Error('render failed; see card.errorInfo');
      }
    },
  },

  [JOB_NAMES.POST_CARD]: {
    batchSize: 5,
    handler: async (data, jobId) => {
      const cardId = pickString(data, 'cardId');
      if (!cardId) return;
      try {
        await runPost({ cardId, jobId });
      } catch {
        await notifyOnTerminalFailure(cardId);
        throw new Error('post failed; see card.errorInfo');
      }
    },
  },

  [JOB_NAMES.REFRESH_STATS]: {
    batchSize: 1,
    handler: async (_data, jobId) => {
      await runStatsRefresh({ jobId });
    },
  },

  [JOB_NAMES.RETRY_FAILURES]: {
    batchSize: 1,
    handler: async (_data, jobId) => {
      await runRetryFailures({ jobId });
    },
  },
};

export function getHandler(name: JobName): Handler | undefined {
  return handlers[name]?.handler;
}

export function getBatchSize(name: JobName): number {
  return handlers[name]?.batchSize ?? 1;
}

export function registeredQueues(): JobName[] {
  return Object.keys(handlers) as JobName[];
}
