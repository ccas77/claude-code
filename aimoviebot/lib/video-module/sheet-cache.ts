import crypto from "node:crypto";
import { head, put } from "@vercel/blob";

// Sheet cache — the durable "did we already generate a sheet for THIS
// source image?" lookup that lets every render reuse Stage 2 (character)
// and Stage 3 (location) sheets when the source uploads match.
//
// Layout:
//   library/sheets/character/{hash}.json   ← metadata sidecar (small)
//   library/sheets/character/{hash}.png    ← cached sheet bytes (re-served)
//   library/sheets/location/{hash}.json
//   library/sheets/location/{hash}.png
//
// hash = first 16 hex chars of sha256(sourceUrl). Stable per upload URL.
// Same uploaded file via the library "Saved cast" picker reuses the same
// URL → cache hit. A fresh re-upload of the same bytes gets a new Blob
// URL → cache miss (expected; we treat reuploads as a new asset).

export type SheetKind = "character" | "location";

export type SheetCacheEntry = {
  kind: SheetKind;
  sourceUrl: string;
  sheetUrl: string;
  // Optional human-readable label for the Assets tab (character name, or
  // location label). May be empty for entries backfilled from old jobs.
  label?: string;
  createdAt: string;
};

function hashOf(sourceUrl: string): string {
  return crypto.createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
}

function sidecarKey(kind: SheetKind, sourceUrl: string): string {
  return `library/sheets/${kind}/${hashOf(sourceUrl)}.json`;
}

function bytesKey(kind: SheetKind, sourceUrl: string): string {
  return `library/sheets/${kind}/${hashOf(sourceUrl)}.png`;
}

// Returns the cached sheetUrl + metadata if present, or null on miss.
// Uses head() on the sidecar key — that's the fast metadata check, no
// body fetch. Then fetches the small JSON for the actual URL.
export async function readSheetCache(
  kind: SheetKind,
  sourceUrl: string,
): Promise<SheetCacheEntry | null> {
  const key = sidecarKey(kind, sourceUrl);
  try {
    const meta = await head(key);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SheetCacheEntry;
  } catch {
    return null;
  }
}

// Writes the cache entry. Stores both the bytes (so the cache survives
// per-job blob deletion) and the sidecar. Overwrites silently — the
// caller is the source of truth for when to invalidate.
export async function writeSheetCache(args: {
  kind: SheetKind;
  sourceUrl: string;
  generatedSheetUrl: string;
  label?: string;
}): Promise<SheetCacheEntry> {
  // Copy the bytes into the cache namespace. If this fails (e.g. the
  // source URL is unreachable), we still write the sidecar pointing at
  // the original URL; the cache then falls back to the original blob.
  let cachedSheetUrl = args.generatedSheetUrl;
  try {
    const res = await fetch(args.generatedSheetUrl);
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "image/png";
      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type: ct });
      const upload = await put(bytesKey(args.kind, args.sourceUrl), blob, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: ct,
      });
      cachedSheetUrl = upload.url;
    }
  } catch {
    // fall through with the original URL
  }
  const entry: SheetCacheEntry = {
    kind: args.kind,
    sourceUrl: args.sourceUrl,
    sheetUrl: cachedSheetUrl,
    label: args.label,
    createdAt: new Date().toISOString(),
  };
  await put(
    sidecarKey(args.kind, args.sourceUrl),
    JSON.stringify(entry, null, 2),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    },
  );
  return entry;
}

// Used by the Assets tab and the backfill route — returns every cached
// entry. Pure metadata read; no body fetches beyond the small sidecars.
export async function listAllCachedSheets(): Promise<SheetCacheEntry[]> {
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "library/sheets/", limit: 1000 });
  const sidecars = result.blobs.filter((b) => b.pathname.endsWith(".json"));
  const entries = await Promise.all(
    sidecars.map(async (b) => {
      try {
        const res = await fetch(b.url, { cache: "no-store" });
        if (!res.ok) return null;
        return (await res.json()) as SheetCacheEntry;
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((e): e is SheetCacheEntry => Boolean(e));
}

// Drops both the bytes and the sidecar for a single cache entry.
export async function deleteCachedSheet(
  kind: SheetKind,
  sourceUrl: string,
): Promise<void> {
  const { del } = await import("@vercel/blob");
  // Looking up the public URLs by listing — del() takes URLs not keys.
  const { list } = await import("@vercel/blob");
  const sideKey = sidecarKey(kind, sourceUrl);
  const bytesK = bytesKey(kind, sourceUrl);
  const result = await list({ prefix: `library/sheets/${kind}/` });
  const toDel = result.blobs
    .filter((b) => b.pathname === sideKey || b.pathname === bytesK)
    .map((b) => b.url);
  if (toDel.length > 0) await del(toDel);
}
