import { NextResponse } from "next/server";
import { head, put, list } from "@vercel/blob";
import { listGenerationsPage, type GenerationItem } from "@/lib/video-module/backends/higgsfield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One-shot importer: walks Higgsfield's `show_generations` (video type) and
// for every generation that has a result URL, copies the mp4 bytes into
// Blob at `library/higgsfield/{id}.mp4`, writes a metadata sidecar at
// `library/higgsfield/{id}.json`, and reports counts.
//
// Idempotent: skips any generation whose sidecar already exists. Safe to
// re-run; new generations get pulled, old ones are left alone.

const PREFIX = "library/higgsfield/";
const sidecarKey = (id: string) => `${PREFIX}${id}.json`;
const mediaKey = (id: string) => `${PREFIX}${id}.mp4`;

type Sidecar = {
  source: "higgsfield";
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
  model?: string;
  durationSec?: number;
  createdAtIso?: string;
  sourceUrl?: string;
};

async function alreadyImported(): Promise<Set<string>> {
  const result = await list({ prefix: PREFIX, limit: 1000 });
  const ids = new Set<string>();
  for (const b of result.blobs) {
    const m = b.pathname.match(/^library\/higgsfield\/([^.]+)\.json$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

async function importOne(item: GenerationItem): Promise<{ ok: boolean; reason?: string }> {
  const sourceUrl = item.results?.rawUrl;
  if (!sourceUrl) return { ok: false, reason: "no rawUrl" };
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return { ok: false, reason: `fetch ${res.status}` };
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "video/mp4" });
    const upload = await put(mediaKey(item.id), blob, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "video/mp4",
    });
    const sidecar: Sidecar = {
      source: "higgsfield",
      id: item.id,
      videoUrl: upload.url,
      thumbnailUrl: item.results?.thumbnailUrl,
      prompt: item.params?.prompt,
      model: item.model,
      durationSec: item.params?.duration,
      createdAtIso: item.createdAt
        ? new Date(item.createdAt * 1000).toISOString()
        : undefined,
      sourceUrl,
    };
    await put(sidecarKey(item.id), JSON.stringify(sidecar, null, 2), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// Run N async tasks with at most `concurrency` in flight at a time. Keeps
// the import fast without saturating Blob / cloudfront on a serverless
// instance with limited connections.
async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    // Per-invocation cap so each call comfortably finishes inside the 5-min
    // function timeout. Re-run the endpoint to pull older history; it
    // resumes via the alreadyImported() skip list. Default = enough for a
    // typical day's renders without risking timeout.
    const maxNew = Math.max(
      1,
      Math.min(parseInt(url.searchParams.get("maxNew") ?? "20", 10), 200),
    );
    const concurrency = Math.max(
      1,
      Math.min(parseInt(url.searchParams.get("concurrency") ?? "5", 10), 10),
    );

    const existing = await alreadyImported();
    let cursor: number | null | undefined = undefined;
    let scanned = 0;
    let skipped = 0;
    let imported = 0;
    const errors: { id: string; reason: string }[] = [];
    let pages = 0;

    do {
      pages += 1;
      const page = await listGenerationsPage({
        type: "video",
        size: 50,
        cursor: cursor ?? undefined,
      });
      scanned += page.items.length;

      const candidates = page.items.filter((item) => {
        if (existing.has(item.id)) {
          skipped += 1;
          return false;
        }
        if (item.status !== "completed") {
          skipped += 1;
          return false;
        }
        return true;
      });

      // Trim to remaining budget so we don't blow past maxNew in this call.
      const remaining = Math.max(0, maxNew - imported);
      const toImport = candidates.slice(0, remaining);

      const results = await withConcurrency(toImport, concurrency, importOne);
      results.forEach((r, i) => {
        const id = toImport[i].id;
        if (r.ok) {
          imported += 1;
          existing.add(id);
        } else {
          errors.push({ id, reason: r.reason ?? "unknown" });
        }
      });

      if (imported >= maxNew) break;
      cursor = page.nextCursor;
    } while (cursor != null && pages < 50);

    return NextResponse.json({
      scanned,
      imported,
      skipped,
      errors,
      pages,
      hasMore: cursor != null,
      hint:
        cursor != null
          ? "There are more pages of history. POST again to continue (the importer skips anything already imported)."
          : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Lets the UI ask "have you imported X" without fetching the sidecar.
export async function HEAD(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new NextResponse(null, { status: 400 });
  try {
    await head(sidecarKey(id));
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
