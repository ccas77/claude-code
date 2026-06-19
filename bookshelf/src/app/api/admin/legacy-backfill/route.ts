import { NextResponse } from 'next/server';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError, ForbiddenError } from '@/lib/ownership';
import { UnauthorizedError, getOwnerEmail } from '@/lib/owner';
import { isPrimaryOwner } from '@/lib/owner-role';
import { getPostBridgeKeyForEmail } from '@/lib/posting/postbridge';
import type { ProviderUsage, PostStats } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-shot backfill for posted cards that never had a Post Bridge id stamped
 * on them (everything posted before the run.ts rewrite). Walks
 * /v1/post-results paginated, filters per social_account_id, and assigns
 * results to the signed-in user's URL-less cards in chronological order.
 *
 * The shared Post Bridge key returns results for every app using it, but the
 * social_account_id filter guarantees we only attribute results to the
 * correct account; greedy chronological matching within an account is safe
 * because each account only ever had a handful of historical posts via the
 * app and they were posted in order.
 *
 * Primary owner only (we don't want a friend backfilling another friend's
 * history blindly).
 */

type PbPostResult = {
  id: string;
  post_id?: string;
  social_account_id: number;
  success: boolean;
  error: string | null;
  platform_data?: {
    id?: string;
    url?: string;
    username?: string;
  };
};

async function fetchPostResultsPaginated(apiKey: string): Promise<PbPostResult[]> {
  const PB_BASE = 'https://api.post-bridge.com';
  const all: PbPostResult[] = [];
  const MAX_PAGES = 50;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(
      `${PB_BASE}/v1/post-results?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) {
      // Deep pagination occasionally 500s; stop and use what we have.
      break;
    }
    const body = (await res.json()) as { data?: PbPostResult[] };
    const rows = body.data ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
    offset += 100;
  }
  return all;
}

function extractAccountIdFromCard(
  providersUsed: ProviderUsage[],
): number | null {
  const stamp = providersUsed.find(
    (p) => p.step === 'post' && p.provider.startsWith('account:'),
  );
  if (!stamp) return null;
  const id = Number(stamp.provider.slice('account:'.length));
  return Number.isFinite(id) ? id : null;
}

function extractPostUrl(r: PbPostResult): string | null {
  if (r.platform_data?.url) return r.platform_data.url;
  const id = r.platform_data?.id;
  const username = r.platform_data?.username;
  if (id && username) {
    const m = id.match(/v2\.(\d+)/);
    if (m) return `https://www.tiktok.com/@${username}/photo/${m[1]}`;
  }
  return null;
}

export async function POST() {
  try {
    const ownerId = await getOwnerId();
    if (!(await isPrimaryOwner())) {
      throw new ForbiddenError('Primary owner only.');
    }

    // Find URL-less posted cards belonging to the signed-in user. Restrict to
    // the signed-in owner so a friend hitting this with leaked auth (in
    // theory) can't backfill anyone else's history.
    const cards = await db
      .select()
      .from(schema.cards)
      .where(
        and(
          eq(schema.cards.ownerId, ownerId),
          eq(schema.cards.status, 'posted'),
          ne(schema.cards.platform, 'preview'),
          isNull(schema.cards.postUrl),
        ),
      );

    if (cards.length === 0) {
      return NextResponse.json({ ok: true, backfilled: 0, scanned: 0 });
    }

    const email = await getOwnerEmail(ownerId);
    const apiKey = getPostBridgeKeyForEmail(email);
    const results = await fetchPostResultsPaginated(apiKey);

    // Group cards by social_account_id, ordered newest -> oldest.
    type CardRow = typeof schema.cards.$inferSelect;
    const cardsByAccount = new Map<number, CardRow[]>();
    for (const card of cards) {
      const accountId = extractAccountIdFromCard(
        (card.providersUsed ?? []) as ProviderUsage[],
      );
      if (accountId == null) continue;
      const arr = cardsByAccount.get(accountId) ?? [];
      arr.push(card);
      cardsByAccount.set(accountId, arr);
    }
    for (const list of cardsByAccount.values()) {
      list.sort((a, b) => b.postTime.getTime() - a.postTime.getTime());
    }

    // Group successful results by social_account_id. The API returns rows in
    // a stable order (typically newest first); we use that order for greedy
    // chronological matching to the cards.
    const resultsByAccount = new Map<number, PbPostResult[]>();
    for (const r of results) {
      if (!r.success) continue;
      const arr = resultsByAccount.get(r.social_account_id) ?? [];
      arr.push(r);
      resultsByAccount.set(r.social_account_id, arr);
    }

    let backfilled = 0;
    const matches: { cardId: string; url: string; resultId: string }[] = [];

    for (const [accountId, accountCards] of cardsByAccount.entries()) {
      const accountResults = resultsByAccount.get(accountId) ?? [];
      // Walk the newest-first cards and assign successive results until one
      // side runs out.
      const upTo = Math.min(accountCards.length, accountResults.length);
      for (let i = 0; i < upTo; i++) {
        const card = accountCards[i];
        const r = accountResults[i];
        const url = extractPostUrl(r);
        if (!url) continue;
        const stats: PostStats | null = null;
        await db
          .update(schema.cards)
          .set({
            postUrl: url,
            postBridgeResultId: r.id,
            postBridgePostId: r.post_id ?? null,
            stats: stats ?? card.stats,
            updatedAt: new Date(),
          })
          .where(eq(schema.cards.id, card.id));
        backfilled++;
        matches.push({ cardId: card.id, url, resultId: r.id });
      }
    }

    await db.insert(schema.eventLog).values({
      ownerId,
      cardId: null,
      stage: 'legacy.backfill',
      level: 'info',
      message: `legacy URL backfill: scanned ${cards.length}, matched ${backfilled}`,
      payload: { scanned: cards.length, backfilled, matches },
    });

    return NextResponse.json({
      ok: true,
      scanned: cards.length,
      backfilled,
      matches,
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
