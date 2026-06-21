import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import type { Job } from "@/lib/video-module/types";
import {
  readSheetCache,
  writeSheetCache,
} from "@/lib/video-module/sheet-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Walk every job ever stored in Blob, extract (source upload → AI-generated
// sheet) pairs, and write cache entries for any not already cached. After
// this runs once, any future render using a previously-seen source upload
// will hit the cache and skip Higgsfield.
//
// Idempotent: cached entries are left alone. Re-run any time to pick up
// new jobs you've completed since the last backfill.
type JobBlobInfo = { jobId: string; latestUrl: string; uploadedAt: number };

async function listLatestJobJsons(): Promise<JobBlobInfo[]> {
  const all = await list({ prefix: "jobs/", limit: 1000 });
  const latest = new Map<string, JobBlobInfo>();
  for (const b of all.blobs) {
    const m = b.pathname.match(/^jobs\/([0-9a-f-]+)\/job-\d+-/i);
    if (!m) continue;
    const jobId = m[1];
    const uploadedAt = new Date(b.uploadedAt).getTime();
    const existing = latest.get(jobId);
    if (!existing || uploadedAt > existing.uploadedAt) {
      latest.set(jobId, { jobId, latestUrl: b.url, uploadedAt });
    }
  }
  return Array.from(latest.values());
}

export async function POST() {
  try {
    const infos = await listLatestJobJsons();
    let scanned = 0;
    let charactersCached = 0;
    let locationsCached = 0;
    let charactersSkipped = 0;
    let locationsSkipped = 0;
    const errors: { jobId: string; reason: string }[] = [];

    for (const info of infos) {
      scanned += 1;
      try {
        const res = await fetch(info.latestUrl, { cache: "no-store" });
        if (!res.ok) {
          errors.push({ jobId: info.jobId, reason: `fetch ${res.status}` });
          continue;
        }
        const job = (await res.json()) as Job;

        const characterSheets = job.artifacts?.characterSheets ?? [];
        const characters = job.characters ?? [];
        // Pair source upload (job.characters[i].imageUrl) with sheet
        // (job.artifacts.characterSheets[i].url) — matched by name so the
        // order doesn't have to be identical.
        for (const c of characters) {
          const sheet = characterSheets.find((s) => s.name === c.name);
          if (!sheet) continue;
          const existing = await readSheetCache("character", c.imageUrl);
          if (existing) {
            charactersSkipped += 1;
            continue;
          }
          await writeSheetCache({
            kind: "character",
            sourceUrl: c.imageUrl,
            generatedSheetUrl: sheet.url,
            label: c.name,
          });
          charactersCached += 1;
        }

        if (job.locationImageUrl && job.artifacts?.locationSheetUrl) {
          const existing = await readSheetCache(
            "location",
            job.locationImageUrl,
          );
          if (existing) {
            locationsSkipped += 1;
          } else {
            await writeSheetCache({
              kind: "location",
              sourceUrl: job.locationImageUrl,
              generatedSheetUrl: job.artifacts.locationSheetUrl,
            });
            locationsCached += 1;
          }
        }
      } catch (e) {
        errors.push({
          jobId: info.jobId,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      scanned,
      charactersCached,
      charactersSkipped,
      locationsCached,
      locationsSkipped,
      errors,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
