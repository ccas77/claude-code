import { NextResponse } from "next/server";
import { z } from "zod";
import { readJob, updateJob, keys } from "@/lib/video-module/storage";
import {
  rebuildCharacterSheetsFromBlob,
  rebuildStoryboardUrlsFromBlob,
  rebuildClipUrlsFromBlob,
} from "@/lib/video-module/stages";
import { VIDEO_CHUNKS } from "@/lib/video-module/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reconciles job state with what actually exists in Blob. When Vercel
// Blob's list() returns a stale snapshot, the workflow can crash with
// "missing upstream artifacts" even though the underlying artifact bytes
// are persisted at their deterministic keys. This endpoint scans the
// deterministic keys, fills in any missing arrays on the job, and clears
// the error so a subsequent retry resumes cleanly. No Higgsfield spend.
const bodySchema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { jobId } = parsed.data;

    const job = await readJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { head } = await import("@vercel/blob");
    const tryHead = async (k: string) => {
      try {
        return (await head(k)).url;
      } catch {
        return null;
      }
    };

    const rebuilt: Record<string, unknown> = {};

    // characterSheets
    if (
      !job.artifacts.characterSheets ||
      job.artifacts.characterSheets.length === 0
    ) {
      const sheets = await rebuildCharacterSheetsFromBlob(jobId, job.characters);
      if (sheets.length > 0) rebuilt.characterSheets = sheets;
    }
    // locationSheetUrl
    if (!job.artifacts.locationSheetUrl) {
      const u = await tryHead(keys.locationSheet(jobId));
      if (u) rebuilt.locationSheetUrl = u;
    }
    // storyboardUrls
    if (
      !job.artifacts.storyboardUrls ||
      job.artifacts.storyboardUrls.length === 0
    ) {
      const urls = await rebuildStoryboardUrlsFromBlob(
        jobId,
        VIDEO_CHUNKS.count,
      );
      if (urls.length > 0) rebuilt.storyboardUrls = urls;
    }
    // clipUrls
    if (!job.artifacts.clipUrls || job.artifacts.clipUrls.length === 0) {
      const urls = await rebuildClipUrlsFromBlob(jobId, VIDEO_CHUNKS.count);
      if (urls.length > 0) rebuilt.clipUrls = urls;
    }
    // videoUrl (final stitched)
    if (!job.artifacts.videoUrl) {
      const u = await tryHead(keys.video(jobId));
      if (u) rebuilt.videoUrl = u;
    }

    if (Object.keys(rebuilt).length === 0) {
      return NextResponse.json({
        jobId,
        repaired: {},
        message: "Nothing to repair — job state is already consistent.",
      });
    }

    // Single write: merge rebuilt artifacts AND clear the error so the
    // status page stops showing the stale failure.
    await updateJob(jobId, (j) => ({
      ...j,
      artifacts: { ...j.artifacts, ...rebuilt },
      error: undefined,
    }));

    return NextResponse.json({ jobId, repaired: rebuilt });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
