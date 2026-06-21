import { NextResponse } from "next/server";
import { z } from "zod";
import {
  keys,
  persistArtifact,
  readJob,
  updateJob,
} from "@/lib/video-module/storage";
import { stage6 } from "@/lib/video-module/stages";
import { getJobStatus } from "@/lib/video-module/backends/higgsfield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Pull EXISTING Higgsfield video clips into the app and finalise the
// render without re-submitting Seedance. Use this when stage 5 crashed
// after submitting clips — the videos exist in your Higgsfield account
// but the app never recorded them. Order matters: hfJobIds[0] becomes
// chunk 1, [1] becomes chunk 2, etc.
const bodySchema = z.object({
  jobId: z.string().uuid(),
  hfJobIds: z.array(z.string().uuid()).min(1).max(8),
  // If true (default), stage 6 (concat + Whisper captions) runs at the
  // end so the user gets a final video. Set false to only persist the
  // clips without stitching.
  stitch: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { jobId, hfJobIds, stitch } = parsed.data;

    const job = await readJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // For each hfJobId in order, ask Higgsfield for status + result URL,
    // then persist to this job's per-chunk Blob key. Errors are collected
    // per-clip so a single failed lookup doesn't poison the others.
    const persisted: string[] = [];
    const errors: { hfJobId: string; reason: string }[] = [];
    for (let i = 0; i < hfJobIds.length; i++) {
      const hfJobId = hfJobIds[i];
      try {
        const status = await getJobStatus(hfJobId);
        const url = status.videoUrl ?? status.imageUrl;
        if (
          status.status.toLowerCase() !== "completed" &&
          status.status.toLowerCase() !== "succeeded"
        ) {
          errors.push({
            hfJobId,
            reason: `Higgsfield status=${status.status}, not yet ready`,
          });
          continue;
        }
        if (!url) {
          errors.push({ hfJobId, reason: "Higgsfield returned no URL" });
          continue;
        }
        const persistedUrl = await persistArtifact(
          keys.videoClip(jobId, i + 1),
          url,
          "video/mp4",
        );
        persisted.push(persistedUrl);
      } catch (e) {
        errors.push({
          hfJobId,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (persisted.length === 0) {
      return NextResponse.json(
        { error: "No clips could be recovered", errors },
        { status: 502 },
      );
    }

    // Record the persisted clip URLs on the job in a single write.
    await updateJob(jobId, (j) => ({
      ...j,
      artifacts: { ...j.artifacts, clipUrls: persisted },
      servedBy: { ...(j.servedBy ?? {}), stage5: "higgsfield" },
    }));

    // Don't stitch unless all expected clips are present — partial
    // recoveries should let the user re-recover the missing chunk first.
    if (!stitch || errors.length > 0) {
      return NextResponse.json({
        jobId,
        clipUrls: persisted,
        errors,
        stitched: false,
      });
    }

    // Run stage 6 (concat + Whisper + caption burn).
    const result = await stage6(jobId, {
      clipUrls: persisted,
      dialogue: job.artifacts.dialogue ?? [],
    });

    // One final write that sets BOTH videoUrl AND status:done so the
    // status badge doesn't race against stage6's own write.
    await updateJob(jobId, (j) => ({
      ...j,
      status: "done",
      artifacts: { ...j.artifacts, videoUrl: result.url },
    }));

    return NextResponse.json({
      jobId,
      clipUrls: persisted,
      videoUrl: result.url,
      stitched: true,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
