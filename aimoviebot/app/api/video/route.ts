import { NextResponse } from "next/server";
import { readJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }
  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    artifacts: job.artifacts,
    servedBy: job.servedBy,
    error: job.error,
    videoDurationSec: job.videoDurationSec,
  });
}
