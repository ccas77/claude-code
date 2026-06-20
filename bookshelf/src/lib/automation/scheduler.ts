import { and, eq, gte, lte, sql } from 'drizzle-orm';
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

const COUNT_AS_POSTED_AFTER_RENDER = true;

export type SkipReason =
  | 'outside-window'
  | 'daily-cap-reached'
  | 'window-full'
  | 'no-book-selections'
  | 'book-missing'
  | 'no-music-match';

export type Decision =
  | { fired: true; cardId: string }
  | { fired: false; reason: SkipReason; detail?: Record<string, unknown> };

export type RunResult = {
  triggered: number;
  skipped: number;
  decisions: Array<{
    configId: string;
    platform: string;
    username: string;
    decision: Decision;
  }>;
};

export async function runAutoSchedule(options: {
  dryRun?: boolean;
  simulateMinutesOfDay?: number;
} = {}): Promise<RunResult> {
  const now = new Date();
  const london = londonNow(now);
  const effectiveMinutes =
    typeof options.simulateMinutesOfDay === 'number'
      ? options.simulateMinutesOfDay
      : london.minutesOfDay;

  const configs = await db
    .select()
    .from(schema.automationConfigs)
    .where(eq(schema.automationConfigs.enabled, true));

  let triggered = 0;
  let skipped = 0;
  const decisions: RunResult['decisions'] = [];

  for (const cfg of configs) {
    const decision = await maybeFireOne(
      cfg,
      effectiveMinutes,
      now,
      london,
      options.dryRun ?? false,
    );
    decisions.push({
      configId: cfg.id,
      platform: cfg.platform,
      username: cfg.username,
      decision,
    });
    if (decision.fired) triggered++;
    else skipped++;

    // Log every skip reason EXCEPT outside-window (would spam ~1440 rows/day
    // per config). Window-matched skips are the interesting ones because they
    // tell you the scheduler tried and bounced.
    if (!options.dryRun && !decision.fired && decision.reason !== 'outside-window') {
      await db.insert(schema.eventLog).values({
        ownerId: cfg.ownerId,
        cardId: null,
        stage: 'auto.skip',
        level: 'warn',
        message: `${cfg.platform}/${cfg.username}: ${decision.reason}`,
        payload: { configId: cfg.id, ...decision.detail },
      });
    }
  }

  return { triggered, skipped, decisions };
}

async function maybeFireOne(
  cfg: typeof schema.automationConfigs.$inferSelect,
  minutesOfDayLondon: number,
  now: Date,
  london: ReturnType<typeof londonNow>,
  dryRun: boolean,
): Promise<Decision> {
  const window = currentWindow(cfg.intervals, minutesOfDayLondon);
  if (!window) {
    return {
      fired: false,
      reason: 'outside-window',
      detail: { minutesOfDay: minutesOfDayLondon, intervals: cfg.intervals },
    };
  }

  // Per-owner daily cap.
  const dayStartLondonUtc = londonHHMMToUtc('00:00', london);
  const todayCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.ownerId, cfg.ownerId),
        gte(schema.cards.createdAt, dayStartLondonUtc),
      ),
    );
  const cap = cfg.dailyRenderCap ?? 20;
  const todayN = Number(todayCount[0]?.count ?? 0);
  if (todayN >= cap) {
    return { fired: false, reason: 'daily-cap-reached', detail: { todayN, cap } };
  }

  // Window bounds for today expressed as UTC Dates.
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
        gte(schema.cards.postTime, windowStart),
        lte(schema.cards.postTime, windowEnd),
      ),
    );

  if (recentCards.length >= window.posts) {
    return {
      fired: false,
      reason: 'window-full',
      detail: {
        recentCount: recentCards.length,
        targetPosts: window.posts,
        window,
      },
    };
  }

  const books = await db
    .select({ bookId: schema.automationBookSelections.bookId })
    .from(schema.automationBookSelections)
    .where(eq(schema.automationBookSelections.configId, cfg.id))
    .orderBy(schema.automationBookSelections.position);
  if (books.length === 0) {
    return { fired: false, reason: 'no-book-selections' };
  }

  const bookId = books[cfg.bookPointer % books.length].bookId;
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, bookId),
  });
  if (!book) {
    return { fired: false, reason: 'book-missing', detail: { bookId } };
  }

  const musicResult = await pickMusic(cfg, book.id, book.genreId);
  if (!musicResult.musicId) {
    return {
      fired: false,
      reason: 'no-music-match',
      detail: {
        bookId,
        bookGenreId: book.genreId,
        ...musicResult.diag,
      },
    };
  }
  const musicId = musicResult.musicId;

  if (dryRun) {
    return {
      fired: true,
      cardId: 'dry-run',
    };
  }

  // Spread the day's posts evenly across the window.
  const slot = recentCards.length;
  const windowMs = windowEnd.getTime() - windowStart.getTime();
  const offset = window.posts > 0 ? Math.round((slot + 0.5) * windowMs / window.posts) : 0;
  const postTime = new Date(windowStart.getTime() + offset);

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

  await db
    .update(schema.automationConfigs)
    .set({
      bookPointer: (cfg.bookPointer + 1) % books.length,
      lastPostedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.automationConfigs.id, cfg.id));

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

  if (!COUNT_AS_POSTED_AFTER_RENDER) {
    return { fired: true, cardId: card.id };
  }
  return { fired: true, cardId: card.id };
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

type MusicPick = {
  musicId: string | null;
  diag: {
    ownedClips: number;
    bookSpecificClips: number;
    sameGenreClips: number;
    anyGenreClips: number;
    poolPicked: 'book-specific' | 'same-genre' | 'any-genre' | 'all-owned' | 'none';
    poolSize: number;
  };
};

async function pickMusic(
  cfg: typeof schema.automationConfigs.$inferSelect,
  bookId: string,
  bookGenreId: string | null,
): Promise<MusicPick> {
  // Music routing lives at the BOOK level, not the automation level. The
  // pool of candidate clips is just everything the owner owns; the
  // priority filter (book-pinned > same-genre > any-genre) then narrows
  // by the book's eligibility rules.
  const diagBase = {
    ownedClips: 0,
    bookSpecificClips: 0,
    sameGenreClips: 0,
    anyGenreClips: 0,
    poolPicked: 'none' as MusicPick['diag']['poolPicked'],
    poolSize: 0,
  };

  const clips = await db
    .select({
      id: schema.musicClips.id,
      anyGenre: schema.musicClips.anyGenre,
    })
    .from(schema.musicClips)
    .where(eq(schema.musicClips.ownerId, cfg.ownerId));
  diagBase.ownedClips = clips.length;
  if (clips.length === 0) return { musicId: null, diag: diagBase };

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

  const bookSpecific = clips.filter((c) => bookSpecificIds.has(c.id));
  const sameGenre = clips.filter((c) => sameGenreIds.has(c.id));
  const anyGenre = clips.filter((c) => c.anyGenre);
  diagBase.bookSpecificClips = bookSpecific.length;
  diagBase.sameGenreClips = sameGenre.length;
  diagBase.anyGenreClips = anyGenre.length;

  let pool = bookSpecific;
  let poolPicked: MusicPick['diag']['poolPicked'] = 'book-specific';
  if (pool.length === 0) {
    pool = sameGenre;
    poolPicked = 'same-genre';
  }
  if (pool.length === 0) {
    pool = anyGenre;
    poolPicked = 'any-genre';
  }
  // No "all-owned" fallback: if nothing matches the book's rules (no pinned
  // clips, no genre match, no any-genre), refuse rather than dropping in a
  // random clip the book wouldn't allow.
  diagBase.poolPicked = pool.length === 0 ? 'none' : poolPicked;
  diagBase.poolSize = pool.length;

  if (pool.length === 0) return { musicId: null, diag: diagBase };

  return {
    musicId: pool[cfg.musicPointer % pool.length].id,
    diag: diagBase,
  };
}
