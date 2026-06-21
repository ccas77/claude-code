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
  // Optional human-readable label for the render. Shown on /status,
  // /projects, /library. Editable later via /api/video/title.
  title: z.string().min(1).max(100).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const input = parsed.data;
  // Reject duplicate character names (they'd collide on dialogue mapping
  // and Blob keys).
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
    title: input.title?.trim() || undefined,
    status: "concept",
    characters: input.characters,
    locationImageUrl: input.locationImageUrl,
    artifacts: {},
    createdAt: now,
    updatedAt: now,
  };
  console.log(`[concept ${jobId}] initial writeJob start`);
  await writeJob(job);
  console.log(`[concept ${jobId}] initial writeJob done`);

  try {
    console.log(`[concept ${jobId}] runConcept start mode=${input.mode}`);
    const result = await runConcept(input);
    console.log(
      `[concept ${jobId}] runConcept done sceneLen=${result.sceneDescription.length} dialogueLen=${result.dialogue.length}`,
    );
    await updateJob(jobId, (j) => ({
      ...j,
      status: "awaiting_approval",
      artifacts: {
        ...j.artifacts,
        sceneDescription: result.sceneDescription,
        dialogue: result.dialogue,
      },
    }));
    console.log(`[concept ${jobId}] updateJob done`);
    return NextResponse.json({
      jobId,
      sceneDescription: result.sceneDescription,
      dialogue: result.dialogue,
      alternates: result.alternates,
      notes: result.notes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[concept ${jobId}] CAUGHT ERROR: ${message}`);
    try {
      await setStatus(jobId, "failed");
    } catch (statusErr) {
      console.log(
        `[concept ${jobId}] failed to mark failed: ${
          statusErr instanceof Error ? statusErr.message : String(statusErr)
        }`,
      );
    }
    return NextResponse.json(
      { jobId, error: `Concept failed: ${message}` },
      { status: 500 },
    );
  }
}
