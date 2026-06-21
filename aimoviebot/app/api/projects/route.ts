import { NextResponse } from "next/server";
import { listAllJobIds, readJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Lists every project ever started, regardless of status. Reads from
// KV's by-updated-at sorted set, then fetches each job blob in parallel.
type ProjectSummary = {
  jobId: string;
  title?: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  characterCount: number;
  thumbnailUrl?: string;
  hasVideo: boolean;
  inflightCount: number;
  errorStage?: string;
  errorMessage?: string;
};

export async function GET() {
  const ids = await listAllJobIds(500);
  const summaries: ProjectSummary[] = [];
  await Promise.all(
    ids.map(async (jobId) => {
      try {
        const job = await readJob(jobId);
        if (!job) return;
        const a = job.artifacts ?? {};
        const thumbnailUrl =
          a.storyboardUrls?.[0] ??
          a.locationSheetUrl ??
          a.characterSheets?.[0]?.url ??
          job.characters?.[0]?.imageUrl;
        summaries.push({
          jobId: job.jobId,
          title: job.title,
          status: job.status,
          updatedAt: job.updatedAt,
          createdAt: job.createdAt,
          characterCount: job.characters?.length ?? 0,
          thumbnailUrl,
          hasVideo: Boolean(a.videoUrl),
          inflightCount: a.inflightHiggsfieldJobs?.length ?? 0,
          errorStage: job.error?.stage,
          errorMessage: job.error?.message,
        });
      } catch {
        // skip jobs whose state failed to load
      }
    }),
  );

  summaries.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return NextResponse.json({ projects: summaries }, { headers: noStore });
}
