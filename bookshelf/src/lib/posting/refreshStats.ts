import { eq, and, gte } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { getOwnerEmail } from '../owner';
import {
  getAnalytics,
  getResultsForPost,
  getPostBridgeKeyForEmail,
  extractPostUrl,
} from './postbridge';
import type { PostStats } from '../db/schema';

/**
 * Two-stage stats refresh. Runs on the upkeep clock AND on demand from the
 * history page's Sync button.
 *
 *   1. Backfill stage. For any posted card with no postUrl yet, hit the
 *      cheap per-post results endpoint /v1/posts/{id}/results and store
 *      share_url + post_result_id directly. Toolkit pattern: capture at
 *      post time on our row, never via deep pagination.
 *   2. Stats stage. Per owner, walk /v1/analytics, match by post_result_id,
 *      and populate card.stats with view/like/comment/share counts.
 *
 * The shared Post Bridge key has no workspace isolation, so we strictly
 * filter by post_result_id (recorded against our own row at post time);
 * results that don't belong to one of our cards get ignored cleanly.
 */
export async function runStatsRefresh({
  jobId,
  ownerScope,
}: {
  jobId: string;
  ownerScope?: string;
}): Promise<{ updated: number; backfilled: number; swept: number }> {
  if (env().DRY_RUN) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      cardId: null,
      stage: 'stats.dry_run',
      level: 'info',
      message: '[dry-run] stats refresh skipped',
      payload: { jobId },
    });
    return { updated: 0, backfilled: 0, swept: 0 };
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = ownerScope
    ? and(
        eq(schema.cards.status, 'posted'),
        gte(schema.cards.updatedAt, since),
        eq(schema.cards.ownerId, ownerScope),
      )
    : and(eq(schema.cards.status, 'posted'), gte(schema.cards.updatedAt, since));
  const cards = await db.select().from(schema.cards).where(where).limit(500);

  // Stage 1: backfill missing share_url + post_result_id from the per-post
  // results endpoint. Cheap; one call per card with a postBridgePostId but
  // no postUrl/postResultId yet.
  let backfilled = 0;
  const keyByOwner = new Map<string, string | null>();
  const resolveKey = async (ownerId: string) => {
    if (keyByOwner.has(ownerId)) return keyByOwner.get(ownerId);
    const email = await getOwnerEmail(ownerId);
    try {
      const k = getPostBridgeKeyForEmail(email);
      keyByOwner.set(ownerId, k);
      return k;
    } catch {
      keyByOwner.set(ownerId, null);
      return null;
    }
  };

  for (const card of cards) {
    if (card.postUrl && card.postBridgeResultId) continue;
    if (!card.postBridgePostId) continue;
    const apiKey = await resolveKey(card.ownerId);
    if (!apiKey) continue;
    try {
      const results = await getResultsForPost(apiKey, card.postBridgePostId);
      const r = results.find((x) => x.success) ?? results[0];
      if (!r) continue;
      const url = extractPostUrl(r);
      const resultId =
        (r as unknown as { id?: string }).id ?? r.platform_data?.id ?? null;
      if (!url && !resultId) continue;
      await db
        .update(schema.cards)
        .set({
          postUrl: url ?? card.postUrl,
          postBridgeResultId: resultId ?? card.postBridgeResultId,
          updatedAt: new Date(),
        })
        .where(eq(schema.cards.id, card.id));
      backfilled++;
    } catch {
      // skip; next sweep retries
    }
  }

  // Stage 2: live stats per owner. Walk /v1/analytics once per owner, build a
  // post_result_id -> counts map, then update each card whose result id
  // matches.
  const fresh = await db.select().from(schema.cards).where(where).limit(500);
  const analyticsByOwner = new Map<string, Map<string, PostStats>>();
  let updated = 0;
  for (const card of fresh) {
    if (!card.postBridgeResultId) continue;
    let owned = analyticsByOwner.get(card.ownerId);
    if (!owned) {
      const apiKey = await resolveKey(card.ownerId);
      if (!apiKey) continue;
      try {
        const items = await getAnalytics(apiKey, '30d');
        owned = new Map();
        for (const it of items) {
          if (!it.post_result_id) continue;
          owned.set(it.post_result_id, {
            views: it.view_count ?? 0,
            likes: it.like_count ?? 0,
            comments: it.comment_count ?? 0,
            shares: it.share_count ?? 0,
            refreshedAt: new Date().toISOString(),
          });
        }
      } catch {
        owned = new Map();
      }
      analyticsByOwner.set(card.ownerId, owned);
    }
    const stats = owned.get(card.postBridgeResultId);
    if (!stats) continue;
    await db
      .update(schema.cards)
      .set({ stats, updatedAt: new Date() })
      .where(eq(schema.cards.id, card.id));
    updated++;
  }

  await db.insert(schema.eventLog).values({
    ownerId: ownerScope ?? null,
    cardId: null,
    stage: 'stats.refresh',
    level: 'info',
    message: `stats refresh: swept ${cards.length}, backfilled ${backfilled}, updated ${updated}`,
    payload: { jobId, swept: cards.length, backfilled, updated },
  });

  return { updated, backfilled, swept: cards.length };
}
