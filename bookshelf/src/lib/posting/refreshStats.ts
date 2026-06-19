import { eq, and, gte } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { getOwnerEmail } from '../owner';
import {
  getPostResults,
  getPostBridgeKeyForEmail,
  extractPostUrl,
} from './postbridge';

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

  // Pull the latest results per distinct owner (because each owner's posts
  // were sent through their own Post Bridge key). Cache so we only call once
  // per key. Then resolve URLs for any posted card still missing one.
  const resultsByOwner = new Map<string, Awaited<ReturnType<typeof getPostResults>>>();
  for (const card of cards) {
    if (card.postUrl) continue;
    if (resultsByOwner.has(card.ownerId)) continue;
    const email = await getOwnerEmail(card.ownerId);
    try {
      const apiKey = getPostBridgeKeyForEmail(email);
      const results = await getPostResults(apiKey);
      resultsByOwner.set(card.ownerId, results);
    } catch {
      resultsByOwner.set(card.ownerId, []);
    }
  }

  for (const card of cards) {
    if (card.postUrl) continue;
    if (!card.postBridgePostId) continue;
    const results = resultsByOwner.get(card.ownerId) ?? [];
    // Strict match: only attach a URL when the Post Bridge result's post_id
    // matches the one we stored at posting time. Without this filter the
    // shared Post Bridge key returns results for other apps using the same
    // key, and the wrong URL gets stamped on our card.
    const match = results.find((r) => r.success && r.post_id === card.postBridgePostId);
    if (!match) continue;
    const url = extractPostUrl(match);
    if (!url) continue;
    await db
      .update(schema.cards)
      .set({ postUrl: url, updatedAt: new Date() })
      .where(eq(schema.cards.id, card.id));
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
