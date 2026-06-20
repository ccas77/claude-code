import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { approvedVideoWorkflow } from "@/lib/video-module/workflow";
import { readJob, updateJob } from "@/lib/video-module/storage";
import { stripEmDashes } from "@/lib/video-module/stages";

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

  // Sanitize user-edited fields. Em dashes break the Seedance speech pipeline
  // and the user may have typed or pasted them on the review page.
  const cleanedScene = stripEmDashes(sceneDescription);
  const cleanedDialogue = dialogue.map((d) => ({
    speaker: d.speaker.trim(),
    line: stripEmDashes(d.line),
  }));

  // Collapse status, duration, and approved-artifacts into ONE updateJob so
  // two sequential read-modify-writes can't race each other on Blob.
  await updateJob(jobId, (j) => ({
    ...j,
    status: "queued",
    videoDurationSec,
    artifacts: {
      ...j.artifacts,
      sceneDescription: cleanedScene,
      dialogue: cleanedDialogue,
    },
  }));

  const run = await start(approvedVideoWorkflow, [
    jobId,
    job.characters,
    job.locationImageUrl,
  ]);
  return NextResponse.json({ jobId, runId: run.runId });
}
