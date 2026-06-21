import { NextResponse } from "next/server";
import { z } from "zod";
import { readJob, setStatus, updateJob } from "@/lib/video-module/storage";
import {
  stage4OneStoryboard,
  stage5OneClip,
  stage6,
} from "@/lib/video-module/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Regenerate ONE storyboard OR ONE clip on an existing job without
// touching the others. After the regen, the job's URL array is rewritten
// AT THAT INDEX so other indexes' persisted blobs aren't disturbed.
// For clip regens, stage6 (concat + captions) re-runs to rebuild the
// final stitched video against the new clip.
//
// Cost: one Higgsfield image (storyboard) OR one Seedance clip (clip)
// PLUS, for clip regens, one ffmpeg/Whisper pass (no Higgsfield).
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
    await setStatus(jobId, "video");
    const result = await stage5OneClip(jobId, chunkIndex, { force: true });
    await updateJob(jobId, (j) => {
      const arr = [...(j.artifacts.clipUrls ?? [])];
      arr[chunkIndex] = result.url;
      return { ...j, artifacts: { ...j.artifacts, clipUrls: arr } };
    });

    // Re-stitch — the existing final video is stale because one of its
    // input clips just changed. Reuses the persisted other clips.
    await setStatus(jobId, "captioning");
    const fresh = await readJob(jobId);
    if (!fresh) throw new Error("Job vanished mid-regenerate");
    if (!fresh.artifacts.clipUrls || fresh.artifacts.clipUrls.length === 0) {
      throw new Error("No clip URLs after regenerate — cannot re-stitch");
    }
    const stitched = await stage6(jobId, {
      clipUrls: fresh.artifacts.clipUrls,
      dialogue: fresh.artifacts.dialogue ?? [],
    });
    // Clear the stale flag for this chunk — the clip is now in sync
    // with its storyboard again.
    await updateJob(jobId, (j) => {
      const stale = (j.artifacts.staleClipIndexes ?? []).filter(
        (i) => i !== chunkIndex,
      );
      return {
        ...j,
        status: "done",
        artifacts: { ...j.artifacts, videoUrl: stitched.url, staleClipIndexes: stale },
      };
    });

    return NextResponse.json({
      jobId,
      regenerated: { kind, chunkIndex, url: result.url },
      videoUrl: stitched.url,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
