import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * One word of narration with its on-screen timing (seconds, relative to the
 * start of the scene's audio). Same shape bookshelf uses for captions.
 */
export type CaptionWord = { text: string; start: number; end: number };

export type StoredRef = { url: string; pathname: string };

export type ErrorInfo = {
  stage: string;
  message: string;
  at: string; // ISO timestamp
};

export const storyStatus = pgEnum('story_status', [
  'draft', // created, nothing generated yet
  'scripting', // LLM writing scenes
  'casting', // generating character reference images
  'generating', // scene images + narration audio
  'rendering', // per-scene clips + final assembly
  'ready', // final video on blob
  'failed',
]);

export const eventLevel = pgEnum('event_level', ['info', 'warn', 'error']);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  name: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const stories = pgTable(
  'stories',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    premise: text().notNull(),
    // The style lock — appended verbatim to every image prompt so the whole
    // video shares one illustrated look.
    style: text().notNull(),
    targetMinutes: real().notNull().default(3),
    aspect: text().notNull().default('16:9'),
    status: storyStatus().notNull().default('draft'),
    videoBlobUrl: text(),
    videoBlobPathname: text(),
    videoDurationSeconds: real(),
    errorInfo: jsonb().$type<ErrorInfo | null>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stories_owner_idx').on(t.ownerId), index('stories_status_idx').on(t.status)],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid().primaryKey().defaultRandom(),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    // The locked identity — this exact string is injected into every image
    // prompt the character appears in. The reference images are the visual
    // half of the same lock.
    description: text().notNull(),
    referenceImages: jsonb().$type<StoredRef[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('characters_story_idx').on(t.storyId),
    uniqueIndex('characters_story_slug_idx').on(t.storyId, t.slug),
  ],
);

export const scenes = pgTable(
  'scenes',
  {
    id: uuid().primaryKey().defaultRandom(),
    storyId: uuid()
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    idx: integer().notNull(),
    narration: text().notNull(),
    // Composition/action only. Character appearance and style are injected
    // mechanically at generation time — never written into this prompt.
    imagePrompt: text().notNull(),
    characterSlugs: jsonb().$type<string[]>().notNull().default([]),
    shot: text().notNull().default('medium'), // wide | medium | close
    focus: text().notNull().default('center'), // pan/zoom target region
    mood: text().notNull().default('calm'),
    imageUrl: text(),
    imagePathname: text(),
    audioUrl: text(),
    audioPathname: text(),
    audioDurationSeconds: real(),
    words: jsonb().$type<CaptionWord[]>().notNull().default([]),
    clipUrl: text(),
    clipPathname: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('scenes_story_idx').on(t.storyId),
    uniqueIndex('scenes_story_idx_idx').on(t.storyId, t.idx),
  ],
);

export const eventLog = pgTable(
  'event_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: uuid(),
    storyId: uuid(),
    level: eventLevel().notNull().default('info'),
    stage: text().notNull(),
    message: text().notNull(),
    payload: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('event_log_story_idx').on(t.storyId),
    index('event_log_created_idx').on(t.createdAt),
  ],
);
