import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { runConcept } from "@/lib/video-module/concept";
import { writeJob, mergeArtifacts, setStatus } from "@/lib/video-module/storage";
import type { Job } from "@/lib/video-module/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  mode: z.enum(["A", "B", "C"]),
  conceptInput: z.string().min(1),
  characterImageUrl: z.string().url(),
  locationImageUrl: z.string().url(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const input = parsed.data;
  const jobId = randomUUID();
  const now = new Date().toISOString();

  // Initialize job state first so the status endpoint is queryable while
  // Stage 0 runs.
  const job: Job = {
    jobId,
    status: "concept",
    characterImageUrl: input.characterImageUrl,
    locationImageUrl: input.locationImageUrl,
    artifacts: {},
    createdAt: now,
    updatedAt: now,
  };
  await writeJob(job);

  try {
    const result = await runConcept(input);
    await mergeArtifacts(jobId, {
      sceneDescription: result.sceneDescription,
      dialogue: result.dialogue,
    });
    await setStatus(jobId, "awaiting_approval");
    return NextResponse.json({
      jobId,
      sceneDescription: result.sceneDescription,
      dialogue: result.dialogue,
      alternates: result.alternates,
      notes: result.notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(jobId, "failed");
    return NextResponse.json(
      { jobId, error: `Concept failed: ${message}` },
      { status: 500 },
    );
  }
}
