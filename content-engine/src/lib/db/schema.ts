import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const workspaceRole = pgEnum("workspace_role", ["admin", "member"]);

export const socialPlatform = pgEnum("social_platform", [
  "tiktok",
  "instagram",
  "facebook",
  "pinterest",
]);

export const postStatus = pgEnum("post_status", [
  "dry_run",
  "submitted",
  "verified",
  "unverified",
  "failed",
]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ownerUserId: uuid("owner_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
  }),
);

export const penNames = pgTable(
  "pen_names",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    voiceDefaults: jsonb("voice_defaults").$type<Record<string, unknown>>().default({}).notNull(),
    brandDefaults: jsonb("brand_defaults").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byWorkspace: index("pen_names_workspace_idx").on(t.workspaceId),
  }),
);

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id"),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byWorkspaceCreated: index("event_log_workspace_created_idx").on(t.workspaceId, t.createdAt),
    byEntity: index("event_log_entity_idx").on(t.entityType, t.entityId),
  }),
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: socialPlatform("platform").notNull(),
    pbAccountId: text("pb_account_id").notNull(),
    handle: text("handle"),
    isActive: boolean("is_active").notNull().default(true),
    isAigc: boolean("is_aigc").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byWorkspace: index("social_accounts_workspace_idx").on(t.workspaceId),
    uniquePbInWorkspace: uniqueIndex("social_accounts_workspace_pb_uidx").on(
      t.workspaceId,
      t.pbAccountId,
    ),
  }),
);

export const socialAccountAllowlist = pgTable(
  "social_account_allowlist",
  {
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.socialAccountId, t.userId] }),
    byUser: index("social_account_allowlist_user_idx").on(t.userId),
  }),
);

export const postLog = pgTable(
  "post_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => profiles.id, { onDelete: "set null" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    caption: text("caption"),
    mediaUrls: jsonb("media_urls").$type<string[]>().notNull(),
    dryRun: boolean("dry_run").notNull().default(false),
    pbPostId: text("pb_post_id"),
    status: postStatus("status").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>().default({}).notNull(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>().default({}).notNull(),
    verification: jsonb("verification").$type<Record<string, unknown>>().default({}).notNull(),
    error: text("error"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => ({
    byWorkspace: index("post_log_workspace_idx").on(t.workspaceId, t.submittedAt),
    byAccount: index("post_log_account_idx").on(t.socialAccountId, t.submittedAt),
    uniqueIdemInWorkspace: uniqueIndex("post_log_workspace_idem_uidx").on(
      t.workspaceId,
      t.idempotencyKey,
    ),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type PenName = typeof penNames.$inferSelect;
export type EventLog = typeof eventLog.$inferSelect;
export type NewEventLog = typeof eventLog.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type PostLog = typeof postLog.$inferSelect;
export type NewPostLog = typeof postLog.$inferInsert;
