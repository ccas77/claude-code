import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { retryFromStage } from "@/lib/video-module/workflow";
import { readJob, updateJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";

const bodySchema = z.object({
  jobId: z.string().uuid(),
  fromStage: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  // Optional per-job override of the Higgsfield image model. If set, the
  // image stages (1, 2, 4) use this slug on the retry instead of the
  // default. Common use: gpt_image_2 default refused a portrait, retry
  // with nano_banana_pro which is more permissive.
  imageModel: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const job = await readJob(parsed.data.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  // Persist the model override + clear the prior error BEFORE kicking off
  // the workflow so stage1/2/4 see the override and the status page stops
  // showing the stale failure message.
  await updateJob(parsed.data.jobId, (j) => {
    const next = { ...j };
    if (parsed.data.imageModel) {
      next.imageModelOverride = parsed.data.imageModel;
    }
    delete next.error;
    return next;
  });
  const run = await start(retryFromStage, [
    parsed.data.jobId,
    parsed.data.fromStage,
  ]);
  return NextResponse.json({ jobId: job.jobId, runId: run.runId });
}
