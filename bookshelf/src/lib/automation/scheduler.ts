import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client';
import type { IntervalWindow, ProviderUsage } from '../db/schema';
import { enqueue, JOB_NAMES } from '../queue';
import { londonHHMMToUtc, londonNow, parseHourMinute } from '../time/london';

/**
 * Auto-scheduler. Fires on every minute. For each enabled automation config:
 *
 *   1. Skip if no book selections.
 *   2. Determine if we're inside one of the configured intervals AND haven't
 *      already posted the target number of posts for THIS interval today.
 *   3. If yes, pick the next book at bookPointer, pick a matching music clip
 *      (genre match preferred, any-genre fallback), create a card stamped
 *      with the post-bridge account id, enqueue render. Posting happens
 *      automatically via the existing post clock once the card is ready.
 *
 * Intervals are HH:MM strings in Europe/London local time, so BST/GMT changes
 * are handled automatically.
 */

const PREPARE_LEAD_MINUTES = 3 * 60; // give the renderer 3h headroom on slow days
const COUNT_AS_POSTED_AFTER_RENDER = true;

export async function runAutoSchedule(): Promise<{
  triggered: number;
  skipped: number;
}> {
  const now = new Date();
  const london = londonNow(now);

  const configs = await db
    .select()
    .from(schema.automationConfigs)
    .where(eq(schema.automationConfigs.enabled, true));

  let triggered = 0;
  let skipped = 0;

  for (const cfg of configs) {
    const fired = await maybeFireOne(cfg, london.minutesOfDay, now, london);
    if (fired) triggered++;
    else skipped++;
  }

  return { triggered, skipped };
}

async function maybeFireOne(
  cfg: typeof schema.automationConfigs.$inferSelect,
  minutesOfDayLondon: number,
  now: Date,
  london: ReturnType<typeof londonNow>,
): Promise<boolean> {
  const window = currentWindow(cfg.intervals, minutesOfDayLondon);
  if (!window) return false;

  // Window bounds for today expressed as real UTC Dates (the wall-clock
  // window in London converted to instant-in-time UTC).
  const windowStart = londonHHMMToUtc(window.start, london);
  const windowEnd = londonHHMMToUtc(window.end, london);

  const recentCards = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.ownerId, cfg.ownerId),
        eq(schema.cards.platform, cfg.platform),
        eq(schema.cards.accountHandle, cfg.username),
        sql`${schema.cards.postTime} >= ${windowStart}`,
        sql`${schema.cards.postTime} <= ${windowEnd}`,
      ),
    );

  if (recentCards.length >= window.posts) return false;

  // Pick the next book at pointer.
  const books = await db
    .select({ bookId: schema.automationBookSelections.bookId })
    .from(schema.automationBookSelections)
    .where(eq(schema.automationBookSelections.configId, cfg.id))
    .orderBy(schema.automationBookSelections.position);
  if (books.length === 0) return false;

  const bookId = books[cfg.bookPointer % books.length].bookId;

  // Pick music. Prefer same-genre as the book, fall back to any-genre, then any.
  const book = await db.query.books.findFirst({ where: eq(schema.books.id, bookId) });
  if (!book) return false;

  const musicId = await pickMusic(cfg, book.genreId);
  if (!musicId) return false;

  // Spread the day's posts evenly across the window: schedule each Nth post
  // at start + (n/posts) of the window length.
  const slot = recentCards.length; // 0-indexed slot within today's window
  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const offset = window.posts > 0 ? Math.round((slot + 0.5) * windowMs / window.posts) : 0;
  const postTime = new Date(windowStart.getTime() + offset);

  // Stamp the post-bridge account id on providersUsed so runPost can resolve it.
  const providers: ProviderUsage[] = [
    { step: 'post', provider: `account:${cfg.postBridgeAccountId}`, fallback: false },
  ];

  const [card] = await db
    .insert(schema.cards)
    .values({
      ownerId: cfg.ownerId,
      status: 'scheduled',
      postTime,
      platform: cfg.platform,
      accountHandle: cfg.username,
      bookId,
      musicClipId: musicId,
      providersUsed: providers,
    })
    .returning();

  // Advance pointers + last_posted_at so the next tick picks the next book.
  await db
    .update(schema.automationConfigs)
    .set({
      bookPointer: (cfg.bookPointer + 1) % books.length,
      lastPostedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.automationConfigs.id, cfg.id));

  // Enqueue render now (prepare ahead, with the postTime up to 3h away).
  await enqueue(
    JOB_NAMES.RENDER_CARD,
    { cardId: card.id },
    { singletonKey: `render:${card.id}` },
  );

  await db.insert(schema.eventLog).values({
    ownerId: cfg.ownerId,
    cardId: card.id,
    stage: 'auto.schedule',
    level: 'info',
    message: `auto-scheduled card for ${cfg.platform}/${cfg.username}`,
    payload: {
      bookId,
      musicId,
      postTime: postTime.toISOString(),
      slot,
      window,
    },
  });

  return COUNT_AS_POSTED_AFTER_RENDER;
}

function currentWindow(intervals: IntervalWindow[], minutesOfDay: number): IntervalWindow | null {
  for (const w of intervals) {
    const s = parseHourMinute(w.start);
    const e = parseHourMinute(w.end);
    const startMin = s.hour * 60 + s.minute;
    const endMin = e.hour * 60 + e.minute;
    if (startMin <= minutesOfDay && minutesOfDay <= endMin && w.posts > 0) {
      return w;
    }
  }
  return null;
}

async function pickMusic(
  cfg: typeof schema.automationConfigs.$inferSelect,
  bookGenreId: string | null,
): Promise<string | null> {
  // First: clips selected for this config
  const selected = await db
    .select({ musicClipId: schema.automationMusicSelections.musicClipId })
    .from(schema.automationMusicSelections)
    .where(eq(schema.automationMusicSelections.configId, cfg.id))
    .orderBy(schema.automationMusicSelections.position);
  if (selected.length === 0) {
    return null;
  }

  const selectedIds = selected.map((s) => s.musicClipId);

  // Filter to genre-matching or any-genre clips
  const candidatesQuery: SQL[] = [
    inArray(schema.musicClips.id, selectedIds),
    eq(schema.musicClips.ownerId, cfg.ownerId),
  ];
  const clips = await db
    .select({
      id: schema.musicClips.id,
      anyGenre: schema.musicClips.anyGenre,
    })
    .from(schema.musicClips)
    .where(and(...candidatesQuery));

  const genres = bookGenreId
    ? await db
        .select({
          musicClipId: schema.musicClipGenres.musicClipId,
        })
        .from(schema.musicClipGenres)
        .where(eq(schema.musicClipGenres.genreId, bookGenreId))
    : [];
  const sameGenreIds = new Set(genres.map((g) => g.musicClipId));

  const sameGenre = clips.filter((c) => sameGenreIds.has(c.id));
  const anyGenre = clips.filter((c) => c.anyGenre);
  const pool = sameGenre.length > 0 ? sameGenre : anyGenre.length > 0 ? anyGenre : clips;
  if (pool.length === 0) return null;

  // Round-robin: use musicPointer as a deterministic position into the pool.
  // (Per-pool pointer isn't ideal but produces variation without extra state.)
  return pool[cfg.musicPointer % pool.length].id;
}
