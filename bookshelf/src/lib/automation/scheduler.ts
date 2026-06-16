import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client';
import type { IntervalWindow, ProviderUsage } from '../db/schema';
import { enqueue, JOB_NAMES } from '../queue';
import { londonHHMMToUtc, londonNow, parseHourMinute } from '../time/london';
import { generateCaption } from '../captions/generate';

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

  // Per-owner daily cap: refuse to fire if today already produced N cards for
  // this owner (sum across all their automation configs). Keeps any one user
  // from burning the shared OpenAI/Gemini/Higgsfield budget.
  const dayStartLondonUtc = londonHHMMToUtc('00:00', london);
  const todayCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.ownerId, cfg.ownerId),
        sql`${schema.cards.createdAt} >= ${dayStartLondonUtc}`,
      ),
    );
  const cap = cfg.dailyRenderCap ?? 20;
  if (todayCount[0]?.count >= cap) return false;

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

  const musicId = await pickMusic(cfg, book.id, book.genreId);
  if (!musicId) return false;

  // Spread the day's posts evenly across the window: schedule each Nth post
  // at start + (n/posts) of the window length.
  const slot = recentCards.length; // 0-indexed slot within today's window
  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const offset = window.posts > 0 ? Math.round((slot + 0.5) * windowMs / window.posts) : 0;
  const postTime = new Date(windowStart.getTime() + offset);

  // Riff a caption from the book's saved source material. Best-effort: if the
  // generator fails (no AI Gateway, network blip), fall back to the book title
  // so runPost still has something usable.
  const genre = book.genreId
    ? await db.query.genres.findFirst({ where: eq(schema.genres.id, book.genreId) })
    : null;
  const audioCaption = await db.query.captions.findFirst({
    where: eq(schema.captions.musicClipId, musicId),
  });
  const tagPool = Array.from(
    new Set([...(book.hashtags ?? []), ...(genre?.defaultHashtags ?? [])]),
  );
  let caption: string;
  try {
    caption = await generateCaption({
      bookTitle: book.title,
      isSet: book.kind === 'set',
      description: book.description,
      reviewDump: book.reviewDump,
      tropes: book.tropes ?? [],
      vibeNotes: book.vibeNotes,
      audioCaption: audioCaption?.fullText ?? null,
      hashtags: tagPool,
    });
  } catch {
    caption = book.title;
  }

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
      caption,
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
  bookId: string,
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

  // Filter to genre-matching, book-specific, or any-genre clips
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

  const bookLinks = await db
    .select({ musicClipId: schema.musicClipBooks.musicClipId })
    .from(schema.musicClipBooks)
    .where(eq(schema.musicClipBooks.bookId, bookId));
  const bookSpecificIds = new Set(bookLinks.map((g) => g.musicClipId));

  const genres = bookGenreId
    ? await db
        .select({
          musicClipId: schema.musicClipGenres.musicClipId,
        })
        .from(schema.musicClipGenres)
        .where(eq(schema.musicClipGenres.genreId, bookGenreId))
    : [];
  const sameGenreIds = new Set(genres.map((g) => g.musicClipId));

  // Priority: clips assigned to this exact book win. Otherwise fall back to
  // genre match, then any-genre, then anything selected for the config.
  const bookSpecific = clips.filter((c) => bookSpecificIds.has(c.id));
  const sameGenre = clips.filter((c) => sameGenreIds.has(c.id));
  const anyGenre = clips.filter((c) => c.anyGenre);
  const pool =
    bookSpecific.length > 0
      ? bookSpecific
      : sameGenre.length > 0
        ? sameGenre
        : anyGenre.length > 0
          ? anyGenre
          : clips;
  if (pool.length === 0) return null;

  // Round-robin: use musicPointer as a deterministic position into the pool.
  // (Per-pool pointer isn't ideal but produces variation without extra state.)
  return pool[cfg.musicPointer % pool.length].id;
}
