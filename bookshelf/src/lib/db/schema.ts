import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

export const transcriptionStatus = pgEnum('transcription_status', [
  'pending',
  'processing',
  'done',
  'failed',
]);

export const recipeStatus = pgEnum('recipe_status', [
  'pending',
  'processing',
  'done',
  'failed',
]);

export const cardStatus = pgEnum('card_status', [
  'scheduled',
  'preparing',
  'ready',
  'posted',
  'failed',
]);

export const eventLevel = pgEnum('event_level', ['info', 'warn', 'error']);

// =============================================================================
// Owners (single user today, multi-tenant ready)
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// Genre library
// =============================================================================

export const genres = pgTable(
  'genres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    styleRecipe: text('style_recipe'),
    recipeStatus: recipeStatus('recipe_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('genres_owner_idx').on(t.ownerId)],
);

export const genreReferenceImages = pgTable(
  'genre_reference_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('genre_ref_images_genre_idx').on(t.genreId)],
);

// =============================================================================
// Book library
// =============================================================================

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').$type<'single' | 'set'>().notNull().default('single'),
    genreId: uuid('genre_id').references(() => genres.id, { onDelete: 'set null' }),
    accessories: jsonb('accessories').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('books_owner_idx').on(t.ownerId)],
);

export const bookImages = pgTable(
  'book_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    kind: text('kind').notNull().default('cover'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('book_images_book_idx').on(t.bookId)],
);

// =============================================================================
// Music library
// =============================================================================

export const musicClips = pgTable(
  'music_clips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    blobUrl: text('blob_url').notNull(),
    blobPathname: text('blob_pathname').notNull(),
    durationSeconds: integer('duration_seconds'),
    anyGenre: boolean('any_genre').notNull().default(false),
    transcriptionStatus: transcriptionStatus('transcription_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('music_owner_idx').on(t.ownerId)],
);

export const musicClipGenres = pgTable(
  'music_clip_genres',
  {
    musicClipId: uuid('music_clip_id')
      .notNull()
      .references(() => musicClips.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.musicClipId, t.genreId] })],
);

export const musicClipBooks = pgTable(
  'music_clip_books',
  {
    musicClipId: uuid('music_clip_id')
      .notNull()
      .references(() => musicClips.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.musicClipId, t.bookId] })],
);

export type CaptionWord = { text: string; start: number; end: number };

export const captions = pgTable(
  'captions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    musicClipId: uuid('music_clip_id')
      .notNull()
      .references(() => musicClips.id, { onDelete: 'cascade' })
      .unique(),
    words: jsonb('words').$type<CaptionWord[]>().notNull().default([]),
    fullText: text('full_text').notNull().default(''),
    reviewed: boolean('reviewed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

// =============================================================================
// Scheduling cards
// =============================================================================

export type ProviderUsage = {
  step: 'image' | 'cover-check' | 'video' | 'transcription' | 'post' | 'recipe';
  provider: string;
  fallback: boolean;
};

export type ErrorInfo = {
  stage: string;
  message: string;
  kind: 'temporary' | 'resource' | 'permanent';
  attempts: number;
  lastAttemptAt: string;
};

export type PostStats = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  refreshedAt?: string;
};

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: cardStatus('status').notNull().default('scheduled'),
    postTime: timestamp('post_time', { withTimezone: true }).notNull(),
    platform: text('platform').notNull(),
    accountHandle: text('account_handle').notNull(),
    bookId: uuid('book_id').references(() => books.id, { onDelete: 'set null' }),
    musicClipId: uuid('music_clip_id').references(() => musicClips.id, { onDelete: 'set null' }),
    videoBlobUrl: text('video_blob_url'),
    videoBlobPathname: text('video_blob_pathname'),
    providersUsed: jsonb('providers_used').$type<ProviderUsage[]>().notNull().default([]),
    errorInfo: jsonb('error_info').$type<ErrorInfo | null>(),
    postUrl: text('post_url'),
    stats: jsonb('stats').$type<PostStats | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('cards_owner_idx').on(t.ownerId),
    index('cards_status_idx').on(t.status),
    index('cards_post_time_idx').on(t.postTime),
  ],
);

// =============================================================================
// Audit / event log (history for diagnosis, separate from card state)
// =============================================================================

// =============================================================================
// MCP tokens (OAuth 2.1 + DCR storage, one row per provider)
// =============================================================================

export const mcpTokens = pgTable('mcp_tokens', {
  provider: text('provider').primaryKey(), // 'higgsfield', etc.
  clientId: text('client_id').notNull(),
  clientSecretEnc: text('client_secret_enc'),
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scopes: text('scopes').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// Automation configs (per social account)
// =============================================================================

export type IntervalWindow = {
  start: string; // "18:00" - HH:MM in Europe/London local time
  end: string;   // "23:00" - HH:MM in Europe/London local time
  posts: number; // how many posts to fire during this window
};

export const automationConfigs = pgTable(
  'automation_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(), // tiktok, instagram, etc.
    postBridgeAccountId: integer('post_bridge_account_id').notNull(),
    username: text('username').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    intervals: jsonb('intervals').$type<IntervalWindow[]>().notNull().default([]),
    bookPointer: integer('book_pointer').notNull().default(0),
    musicPointer: integer('music_pointer').notNull().default(0),
    lastPostedAt: timestamp('last_posted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('automation_owner_idx').on(t.ownerId),
    index('automation_enabled_idx').on(t.enabled),
  ],
);

export const automationBookSelections = pgTable(
  'automation_book_selections',
  {
    configId: uuid('config_id')
      .notNull()
      .references(() => automationConfigs.id, { onDelete: 'cascade' }),
    bookId: uuid('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.configId, t.bookId] })],
);

export const automationMusicSelections = pgTable(
  'automation_music_selections',
  {
    configId: uuid('config_id')
      .notNull()
      .references(() => automationConfigs.id, { onDelete: 'cascade' }),
    musicClipId: uuid('music_clip_id')
      .notNull()
      .references(() => musicClips.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.configId, t.musicClipId] })],
);

// =============================================================================

export const eventLog = pgTable(
  'event_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    level: eventLevel('level').notNull().default('info'),
    stage: text('stage').notNull(),
    message: text('message').notNull(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('event_log_owner_idx').on(t.ownerId),
    index('event_log_card_idx').on(t.cardId),
    index('event_log_created_idx').on(t.createdAt),
  ],
);
