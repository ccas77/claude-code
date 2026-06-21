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

// Validation bounds depend on the per-job chunkCount, which is set at
// Gate 1 approve from videoDurationSec. We validate AFTER reading the
// job. Minimum = chunkCount (one shot per chunk). Maximum = chunkCount × 4
// (so the chunker keeps up to 4 shots per 4s clip).
const bodySchema = z.object({
  jobId: z.string().uuid(),
  shots: z.array(shotSchema).min(1).max(32),
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

  // Per-job count check: shots must fit chunkCount..chunkCount×4 so
  // chunker has at least 1 shot per clip and at most 4. Falls back
  // to legacy 4..16 if chunkCount is missing.
  const cc = job.chunkCount ?? 4;
  const minShots = cc;
  const maxShots = cc * 4;
  if (editedShots.length < minShots || editedShots.length > maxShots) {
    return NextResponse.json(
      {
        error: `Shot count must be ${minShots}..${maxShots} for a ${cc * 4}s video (${cc} clips × 4s).`,
      },
      { status: 400 },
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
