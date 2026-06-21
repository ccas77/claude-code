import { NextResponse } from "next/server";
import { z } from "zod";
import { readJob, setStatus, updateJob } from "@/lib/video-module/storage";
import {
  stage4OneStoryboard,
  stage5OneClip,
} from "@/lib/video-module/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Regenerate ONE storyboard OR ONE clip on an existing job without
// touching siblings. Neither path auto-restitches the final video —
// the user explicitly calls /api/video/restitch when they've finished
// iterating. That avoids wasting ffmpeg passes on intermediate states.
//
// Cost: one Higgsfield image (storyboard) OR one Seedance clip (clip).
const bodySchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["storyboard", "clip"]),
  // 0-indexed chunk. 0..3 for the default 4-clip pipeline.
  chunkIndex: z.number().int().min(0).max(7),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { jobId, kind, chunkIndex } = parsed.data;

    const job = await readJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // No need to delete the old blob: assets are content-addressed
    // so the regen lands at a NEW URL, the job state pointer flips
    // to that URL, and the browser/CDN refetch automatically. Old
    // versions stay in Blob as audit history (cheap).

    if (kind === "storyboard") {
      const result = await stage4OneStoryboard(jobId, chunkIndex, {
        force: true,
      });
      // Splice the new URL in at chunkIndex; leave siblings untouched.
      // If a clip already exists for this chunk, mark it stale — the
      // user has to explicitly hit "Send to Seedance" on the tile to
      // pay for the new clip. No silent Seedance spend.
      await updateJob(jobId, (j) => {
        const arr = [...(j.artifacts.storyboardUrls ?? [])];
        arr[chunkIndex] = result.url;
        const hasClip = Boolean(j.artifacts.clipUrls?.[chunkIndex]);
        const stale = new Set(j.artifacts.staleClipIndexes ?? []);
        if (hasClip) stale.add(chunkIndex);
        return {
          ...j,
          artifacts: {
            ...j.artifacts,
            storyboardUrls: arr,
            staleClipIndexes: Array.from(stale).sort((a, b) => a - b),
          },
        };
      });
      return NextResponse.json({
        jobId,
        regenerated: { kind, chunkIndex, url: result.url },
      });
    }

    // kind === "clip"
    // NOTE: this does NOT auto-restitch. The user explicitly clicks the
    // separate "Restitch final video" button once they're satisfied
    // with all the new clips. That avoids wasting ffmpeg+Whisper passes
    // when the user is going to regen more clips next.
    await setStatus(jobId, "video");
    const result = await stage5OneClip(jobId, chunkIndex, { force: true });
    await updateJob(jobId, (j) => {
      const arr = [...(j.artifacts.clipUrls ?? [])];
      arr[chunkIndex] = result.url;
      // Clip is now in sync with its storyboard — drop the stale flag.
      const stale = (j.artifacts.staleClipIndexes ?? []).filter(
        (i) => i !== chunkIndex,
      );
      return {
        ...j,
        artifacts: {
          ...j.artifacts,
          clipUrls: arr,
          staleClipIndexes: stale,
        },
      };
    });

    return NextResponse.json({
      jobId,
      regenerated: { kind, chunkIndex, url: result.url },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
