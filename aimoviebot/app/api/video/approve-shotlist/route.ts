import { NextResponse } from "next/server";
import { z } from "zod";
import { resumeHook } from "workflow/api";
import {
  mergeArtifacts,
  readJob,
  setStatus,
  writeShotList,
} from "@/lib/video-module/storage";
import { stripEmDashes } from "@/lib/video-module/stages";

export const runtime = "nodejs";

const dialogueLineSchema = z.object({
  speaker: z.string().min(1),
  line: z.string().min(1),
});

const shotSchema = z.object({
  n: z.number().int().min(1),
  camera: z.string().min(1),
  action: z.string().min(1),
  performance: z.string().min(1),
  dialogue: z.array(dialogueLineSchema),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  shots: z.array(shotSchema).min(1),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId, shots: editedShots } = parsed.data;

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "awaiting_shotlist_approval") {
    return NextResponse.json(
      {
        error: `Job not awaiting shot list approval (status: ${job.status})`,
      },
      { status: 409 },
    );
  }

  // Sanitize user edits the same way runtime model output is sanitized:
  // em dashes break Seedance's speech generation downstream.
  const cleaned = editedShots
    .map((s, i) => ({
      n: i + 1,
      camera: stripEmDashes(s.camera),
      action: stripEmDashes(s.action),
      performance: stripEmDashes(s.performance),
      dialogue: s.dialogue.map((d) => ({
        speaker: d.speaker.trim(),
        line: stripEmDashes(d.line),
      })),
    }))
    .sort((a, b) => a.n - b.n);

  await writeShotList(jobId, cleaned);
  await mergeArtifacts(jobId, { shotList: cleaned });
  await setStatus(jobId, "storyboard");

  // Resume the workflow's createHook(`approve-shotlist:${jobId}`) call so
  // stage 4 + stage 5 fire with the approved shot list.
  await resumeHook(`approve-shotlist:${jobId}`, { approved: true });

  return NextResponse.json({ jobId });
}
