import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeArtifacts, readJob } from "@/lib/video-module/storage";
import { stripEmDashes } from "@/lib/video-module/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Persist edits to a single shot (or multiple) on a job. Used by the
// inline shot editor on the storyboard tiles — the user can fix a
// badly-written shot before regenerating the storyboard against it.
// Edits persist permanently (same shotList that stage 5 / regen reads).
const dialogueLineSchema = z.object({
  speaker: z.string().min(1),
  line: z.string().min(1),
});

const shotSchema = z.object({
  n: z.number().int().min(1),
  camera: z.string().min(1),
  action: z.string().min(1),
  // Optional / empty allowed for legacy jobs whose shotList pre-dates
  // the performance field.
  performance: z.string().optional().default(""),
  dialogue: z.array(dialogueLineSchema),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  // Full list. Easier than diffing; the page always sends what it has.
  shots: z.array(shotSchema).min(1).max(32),
  // Per-chunk Seedance render duration (one entry per chunk index).
  // Seedance's range is 4-15s; we clamp to that on save.
  chunkDurations: z.array(z.number().int()).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId, shots, chunkDurations } = parsed.data;

  const job = await readJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Sanitize em dashes — they break Seedance speech.
  const cleaned = shots.map((s, i) => ({
    n: i + 1,
    camera: stripEmDashes(s.camera),
    action: stripEmDashes(s.action),
    performance: stripEmDashes(s.performance),
    dialogue: s.dialogue.map((d) => ({
      speaker: d.speaker.trim(),
      line: stripEmDashes(d.line),
    })),
  }));

  const patch: { shotList: typeof cleaned; chunkDurations?: number[] } = {
    shotList: cleaned,
  };
  if (chunkDurations) {
    patch.chunkDurations = chunkDurations.map((d) =>
      Math.max(4, Math.min(15, d)),
    );
  }
  await mergeArtifacts(jobId, patch);
  return NextResponse.json({ jobId, count: cleaned.length });
}
