import { NextResponse } from "next/server";
import { readJob } from "@/lib/video-module/storage";

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
  return NextResponse.json(
    {
      jobId: job.jobId,
      status: job.status,
      characters: job.characters,
      locationImageUrl: job.locationImageUrl,
      artifacts: job.artifacts,
      servedBy: job.servedBy,
      error: job.error,
      videoDurationSec: job.videoDurationSec,
      chunkCount: job.chunkCount,
      forceRegenerateSheets: job.forceRegenerateSheets,
    },
    { headers: noStore },
  );
}
