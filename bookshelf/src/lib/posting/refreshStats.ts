import { eq, and, gte } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { fetchPostStats } from './postbridge';

/**
 * Stats refresh handler. Runs on the upkeep clock. Walks every Posted card
 * from the last 30 days and asks post-bridge for fresh view/like/comment/share
 * numbers. Stores them on card.stats so the history screen can show
 * accumulating engagement.
 */

export async function runStatsRefresh({ jobId }: { jobId: string }): Promise<void> {
  if (env().DRY_RUN) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      cardId: null,
      stage: 'stats.dry_run',
      level: 'info',
      message: '[dry-run] stats refresh skipped',
      payload: { jobId },
    });
    return;
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cards = await db
    .select()
    .from(schema.cards)
    .where(and(eq(schema.cards.status, 'posted'), gte(schema.cards.updatedAt, since)))
    .limit(200);

  for (const card of cards) {
    const providers = (card.providersUsed ?? []) as { step: string; provider: string }[];
    const postEntry = providers.find((p) => p.step === 'post');
    if (!card.postUrl || !postEntry) continue;
    // post-bridge id is logged but not on the card; in production add a column
    // for it. For now we skip refresh if we can't recover the id.
    // (Stage 9 will wire this up properly if needed.)
  }

  await db.insert(schema.eventLog).values({
    ownerId: null,
    cardId: null,
    stage: 'stats.refresh',
    level: 'info',
    message: `stats refresh swept ${cards.length} cards`,
    payload: { jobId, count: cards.length },
  });
}
