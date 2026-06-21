import { NextResponse } from "next/server";
import { z } from "zod";
import { resumeHook } from "workflow/api";
import { readJob, setStatus } from "@/lib/video-module/storage";

export const runtime = "nodejs";

// Gate 3 approval. The workflow is suspended on a hook keyed
// `approve-storyboards:${jobId}`; this route resumes it so stage 5
// (4 Seedance video clips) can fire.
const bodySchema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId } = parsed.data;

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "awaiting_storyboard_approval") {
    return NextResponse.json(
      {
        error: `Job not awaiting storyboard approval (status: ${job.status})`,
      },
      { status: 409 },
    );
  }
  if (
    !job.artifacts.storyboardUrls ||
    job.artifacts.storyboardUrls.length === 0
  ) {
    return NextResponse.json(
      { error: "No storyboards on job — nothing to approve" },
      { status: 409 },
    );
  }

  // Move status forward so the user's status page reflects the resume
  // immediately, before stage 5 has had time to set its own status.
  await setStatus(jobId, "video");
  await resumeHook(`approve-storyboards:${jobId}`, { approved: true });
  return NextResponse.json({ jobId });
}
