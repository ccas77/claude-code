import { NextResponse } from "next/server";
import { z } from "zod";
import { start } from "workflow/api";
import { retryFromStage } from "@/lib/video-module/workflow";
import { readJob } from "@/lib/video-module/storage";

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
  const run = await start(retryFromStage, [
    parsed.data.jobId,
    parsed.data.fromStage,
  ]);
  return NextResponse.json({ jobId: job.jobId, runId: run.runId });
}
