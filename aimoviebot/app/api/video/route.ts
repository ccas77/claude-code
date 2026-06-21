import { NextResponse } from "next/server";
import { clipUrlsFingerprint, readJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";
// Job state mutates on every stage; we must NEVER serve a cached response,
// and we must NEVER use Next's data cache when reading from Blob.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId" },
      { status: 400, headers: noStore },
    );
  }
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404, headers: noStore },
    );
  }
  // Derived: is the current clipUrls set out of sync with what was
  // last stitched into the final video? Drives the "Restitch" button.
  const currentFp = clipUrlsFingerprint(job.artifacts.clipUrls);
  const lastFp = job.artifacts.lastStitchedClipFingerprint ?? "";
  const clipsAreStale = Boolean(
    job.artifacts.clipUrls?.length && currentFp !== lastFp,
  );
  return NextResponse.json(
    {
      jobId: job.jobId,
      title: job.title,
      status: job.status,
      characters: job.characters,
      locationImageUrl: job.locationImageUrl,
      artifacts: job.artifacts,
      servedBy: job.servedBy,
      error: job.error,
      videoDurationSec: job.videoDurationSec,
      chunkCount: job.chunkCount,
      forceRegenerateSheets: job.forceRegenerateSheets,
      clipsAreStale,
    },
    { headers: noStore },
  );
}
