import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import type { Job } from "@/lib/video-module/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Lists every project ever started, regardless of status. Walks `jobs/` in
// Blob, finds every `jobs/{jobId}/job-*.json`, keeps the latest one per
// jobId, fetches each and returns a thin summary so the /projects page can
// render a grid without re-fetching per row.
type ProjectSummary = {
  jobId: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  characterCount: number;
  // First available visual for the card thumbnail. Preference order:
  // final video (poster frame), first storyboard, first character sheet,
  // first character's source image.
  thumbnailUrl?: string;
  hasVideo: boolean;
  inflightCount: number;
  errorStage?: string;
  errorMessage?: string;
};

export async function GET() {
  const all = await list({ prefix: "jobs/", limit: 1000 });
  // Group JSON blobs by jobId, keep latest per group.
  const latestByJob = new Map<
    string,
    { url: string; uploadedAt: Date }
  >();
  for (const b of all.blobs) {
    const m = b.pathname.match(/^jobs\/([0-9a-f-]+)\/job-\d+-/i);
    if (!m) continue;
    const jobId = m[1];
    const uploadedAt = new Date(b.uploadedAt);
    const existing = latestByJob.get(jobId);
    if (!existing || uploadedAt.getTime() > existing.uploadedAt.getTime()) {
      latestByJob.set(jobId, { url: b.url, uploadedAt });
    }
  }

  const summaries: ProjectSummary[] = [];
  // Fetch each latest job JSON in parallel.
  await Promise.all(
    Array.from(latestByJob.entries()).map(async ([jobId, entry]) => {
      try {
        const res = await fetch(entry.url, { cache: "no-store" });
        if (!res.ok) return;
        const job = (await res.json()) as Job;
        const a = job.artifacts ?? {};
        const thumbnailUrl =
          a.storyboardUrls?.[0] ??
          a.locationSheetUrl ??
          a.characterSheets?.[0]?.url ??
          job.characters?.[0]?.imageUrl;
        summaries.push({
          jobId,
          status: job.status,
          updatedAt: job.updatedAt ?? entry.uploadedAt.toISOString(),
          createdAt: job.createdAt ?? entry.uploadedAt.toISOString(),
          characterCount: job.characters?.length ?? 0,
          thumbnailUrl,
          hasVideo: Boolean(a.videoUrl),
          inflightCount: a.inflightHiggsfieldJobs?.length ?? 0,
          errorStage: job.error?.stage,
          errorMessage: job.error?.message,
        });
      } catch {
        // skip unreadable / malformed blobs silently — they show up nowhere
        // rather than break the list
      }
    }),
  );

  summaries.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return NextResponse.json({ projects: summaries }, { headers: noStore });
}
