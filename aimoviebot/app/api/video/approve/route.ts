import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { approvedVideoWorkflow } from "@/lib/video-module/workflow";
import { mergeArtifacts, readJob, updateJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";

const dialogueLineSchema = z.object({
  speaker: z.string().min(1),
  line: z.string().min(1),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  sceneDescription: z.string().min(1),
  dialogue: z.array(dialogueLineSchema),
  // Optional per-render override of the duration. Defaults are applied in
  // stage 5 / config.ts.
  videoDurationSec: z.number().int().min(4).max(15).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId, sceneDescription, dialogue, videoDurationSec } = parsed.data;

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Job not awaiting approval (status: ${job.status})` },
      { status: 409 },
    );
  }

  // Persist the user-approved scene + dialogue + duration, then kick off
  // the durable workflow. Stages 1-5 pick the inputs up off Blob.
  await updateJob(jobId, (j) => ({
    ...j,
    status: "queued",
    videoDurationSec,
  }));
  await mergeArtifacts(jobId, { sceneDescription, dialogue });

  const run = await start(approvedVideoWorkflow, [
    jobId,
    job.characterImageUrl,
    job.locationImageUrl,
  ]);
  return NextResponse.json({ jobId, runId: run.runId });
}
