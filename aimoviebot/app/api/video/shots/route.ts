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
  performance: z.string().min(1),
  dialogue: z.array(dialogueLineSchema),
});

const bodySchema = z.object({
  jobId: z.string().uuid(),
  // Full list. Easier than diffing; the page always sends what it has.
  shots: z.array(shotSchema).min(1).max(32),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { jobId, shots } = parsed.data;

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

  await mergeArtifacts(jobId, { shotList: cleaned });
  return NextResponse.json({ jobId, count: cleaned.length });
}
