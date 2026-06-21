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

export async function POST() {
  try {
    const existing = await alreadyImported();
    let cursor: number | null | undefined = undefined;
    let scanned = 0;
    let skipped = 0;
    let imported = 0;
    const errors: { id: string; reason: string }[] = [];
    // Hard cap on pages so a runaway loop doesn't burn the function. 50
    // pages × 50 items = up to 2500 history entries. Most accounts won't
    // come close.
    let pages = 0;
    do {
      pages += 1;
      const page = await listGenerationsPage({
        type: "video",
        size: 50,
        cursor: cursor ?? undefined,
      });
      for (const item of page.items) {
        scanned += 1;
        if (existing.has(item.id)) {
          skipped += 1;
          continue;
        }
        if (item.status !== "completed") {
          skipped += 1;
          continue;
        }
        const r = await importOne(item);
        if (r.ok) {
          imported += 1;
          existing.add(item.id);
        } else {
          errors.push({ id: item.id, reason: r.reason ?? "unknown" });
        }
      }
      cursor = page.nextCursor;
    } while (cursor != null && pages < 50);

    return NextResponse.json({ scanned, imported, skipped, errors, pages });
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
