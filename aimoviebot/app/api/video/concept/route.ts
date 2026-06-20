import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { runConcept } from "@/lib/video-module/concept";
import {
  writeJob,
  setStatus,
  updateJob,
} from "@/lib/video-module/storage";
import type { Job } from "@/lib/video-module/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const characterSchema = z.object({
  name: z.string().min(1).max(40),
  imageUrl: z.string().url(),
});

const bodySchema = z.object({
  mode: z.enum(["A", "B", "C"]),
  conceptInput: z.string().min(1),
  characters: z.array(characterSchema).min(1).max(4),
  locationImageUrl: z.string().url(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const input = parsed.data;
  // Reject duplicate character names — they'd collide on dialogue mapping
  // and Blob keys.
  const names = input.characters.map((c) => c.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    return NextResponse.json(
      { error: "Character names must be unique." },
      { status: 400 },
    );
  }

  const jobId = randomUUID();
  const now = new Date().toISOString();

  const job: Job = {
    jobId,
    status: "concept",
    characters: input.characters,
    locationImageUrl: input.locationImageUrl,
    artifacts: {},
    createdAt: now,
    updatedAt: now,
  };
  await writeJob(job);

  try {
    const result = await runConcept(input);
    // Collapse artifacts+status into one write. Two sequential
    // read-modify-write ops on the same Blob key race with CDN propagation
    // and can clobber each other.
    await updateJob(jobId, (j) => ({
      ...j,
      status: "awaiting_approval",
      artifacts: {
        ...j.artifacts,
        sceneDescription: result.sceneDescription,
        dialogue: result.dialogue,
      },
    }));
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
