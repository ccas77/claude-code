import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { NewAsset } from "@/lib/db/schema";
import { ASSETS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

export type AssetKind = (typeof schema.assetKind.enumValues)[number];
export type AssetOrigin = (typeof schema.assetOrigin.enumValues)[number];

export interface CreateFromUrlInput {
  workspaceId: string;
  uploadedBy: string;
  kind: AssetKind;
  externalUrl: string;
  mimeType?: string;
  sourcePlatform?: string;
  sourceUrl?: string;
  metrics?: Record<string, number | string>;
  metadata?: Record<string, unknown>;
}

export async function createAssetFromUrl(input: CreateFromUrlInput) {
  const [row] = await db
    .insert(schema.assets)
    .values({
      workspaceId: input.workspaceId,
      uploadedBy: input.uploadedBy,
      kind: input.kind,
      origin: "uploaded",
      externalUrl: input.externalUrl,
      mimeType: input.mimeType ?? null,
      sourcePlatform: input.sourcePlatform ?? null,
      sourceUrl: input.sourceUrl ?? null,
      metrics: input.metrics ?? {},
      metadata: input.metadata ?? {},
    })
    .returning();

  await db.insert(schema.eventLog).values({
    workspaceId: input.workspaceId,
    actorUserId: input.uploadedBy,
    eventType: "asset.created",
    entityType: "asset",
    entityId: row.id,
    payload: { origin: "uploaded", kind: input.kind, via: "url" },
  });

  return row;
}

export interface CreateFromFileInput {
  workspaceId: string;
  uploadedBy: string;
  kind: AssetKind;
  filename: string;
  mimeType: string;
  bytes: ArrayBuffer;
  metadata?: Record<string, unknown>;
}

export async function createAssetFromFile(input: CreateFromFileInput) {
  const admin = supabaseAdmin();
  const storageKey = `${input.workspaceId}/${crypto.randomUUID()}-${sanitize(input.filename)}`;

  let storagePath: string | null = null;
  let dryRun = false;
  if (admin) {
    const upload = await admin.storage
      .from(ASSETS_BUCKET)
      .upload(storageKey, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (upload.error) throw new Error(`storage upload failed: ${upload.error.message}`);
    storagePath = upload.data?.path ?? storageKey;
  } else {
    dryRun = true;
    storagePath = null;
  }

  const [row] = await db
    .insert(schema.assets)
    .values({
      workspaceId: input.workspaceId,
      uploadedBy: input.uploadedBy,
      kind: input.kind,
      origin: "uploaded",
      storagePath,
      mimeType: input.mimeType,
      metadata: { ...(input.metadata ?? {}), filename: input.filename, dryRun },
    })
    .returning();

  await db.insert(schema.eventLog).values({
    workspaceId: input.workspaceId,
    actorUserId: input.uploadedBy,
    eventType: "asset.created",
    entityType: "asset",
    entityId: row.id,
    payload: { origin: "uploaded", kind: input.kind, via: dryRun ? "file-dryrun" : "file" },
  });

  return { asset: row, dryRun };
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export interface FacebookLibraryItem {
  sourceUrl: string;
  mediaUrl: string;
  mimeType?: string;
  metrics?: Record<string, number | string>;
  metadata?: Record<string, unknown>;
}

export async function ingestFromFacebookLibrary(params: {
  workspaceId: string;
  actorUserId: string | null;
  items: FacebookLibraryItem[];
}) {
  const seen = new Set<string>();
  const inserts: NewAsset[] = [];
  for (const item of params.items) {
    if (seen.has(item.sourceUrl)) continue;
    seen.add(item.sourceUrl);
    inserts.push({
      workspaceId: params.workspaceId,
      uploadedBy: params.actorUserId,
      kind: "image",
      origin: "ingested",
      externalUrl: item.mediaUrl,
      mimeType: item.mimeType ?? null,
      sourcePlatform: "facebook",
      sourceUrl: item.sourceUrl,
      metrics: item.metrics ?? {},
      metadata: item.metadata ?? {},
      ocrStatus: "pending",
    });
  }
  if (inserts.length === 0) return { inserted: 0, ids: [] as string[] };

  const rows = await db.insert(schema.assets).values(inserts).returning({ id: schema.assets.id });
  const ids = rows.map((r) => r.id);
  await db.insert(schema.eventLog).values({
    workspaceId: params.workspaceId,
    actorUserId: params.actorUserId,
    eventType: "asset.ingested",
    entityType: "asset",
    entityId: null,
    payload: { source: "facebook-library", count: ids.length },
  });
  return { inserted: ids.length, ids };
}

export async function listWorkspaceAssets(params: {
  workspaceId: string;
  kind?: AssetKind;
  origin?: AssetOrigin;
  limit?: number;
}) {
  const conds = [eq(schema.assets.workspaceId, params.workspaceId)];
  if (params.kind) conds.push(eq(schema.assets.kind, params.kind));
  if (params.origin) conds.push(eq(schema.assets.origin, params.origin));
  return db
    .select()
    .from(schema.assets)
    .where(and(...conds))
    .orderBy(desc(schema.assets.createdAt))
    .limit(params.limit ?? 50);
}

export async function getAssetsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(schema.assets).where(inArray(schema.assets.id, ids));
}
