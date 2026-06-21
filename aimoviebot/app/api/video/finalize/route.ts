import { NextResponse } from "next/server";
import { z } from "zod";
import {
  keys,
  persistArtifact,
  readJob,
  setStatus,
  updateJob,
} from "@/lib/video-module/storage";
import { stage6 } from "@/lib/video-module/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Stitch + caption from clip URLs WITHOUT touching Higgsfield/Seedance.
// Used to recover a job whose stage 5 video clips already exist (in
// Higgsfield or anywhere reachable by URL) but never made it through the
// workflow's persist + stage 6 path.
const bodySchema = z.object({
  jobId: z.string().uuid(),
  // Pass the clips in the order they should play. They will be persisted
  // to Blob first so future re-renders don't depend on the source URLs
  // staying alive.
  clipUrls: z.array(z.string().url()).min(1).max(8),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: body.error.message }, { status: 400 });
    }
    const job = await readJob(body.data.jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // 1. Persist each source clip into our Blob under the deterministic
    //    per-chunk key so the artifact survives independent of Higgsfield.
    const persistedClipUrls = await Promise.all(
      body.data.clipUrls.map((u, i) =>
        persistArtifact(keys.videoClip(body.data.jobId, i + 1), u, "video/mp4"),
      ),
    );

    // 2. Record the clip URLs on the job so the status page (and any future
    //    re-finalize) can see them.
    await updateJob(body.data.jobId, (j) => ({
      ...j,
      artifacts: { ...j.artifacts, clipUrls: persistedClipUrls },
      servedBy: { ...(j.servedBy ?? {}), stage5: "higgsfield" },
    }));

    // 3. Move status to captioning while ffmpeg + Whisper run.
    await setStatus(body.data.jobId, "captioning");

    // 4. Run stage 6 directly (concat + Whisper + caption burn). No
    //    workflow, no Higgsfield.
    const result = await stage6(body.data.jobId, {
      clipUrls: persistedClipUrls,
      dialogue: job.artifacts.dialogue ?? [],
    });

    // 5. Mark done. stage6 has just written videoUrl via its own updateJob;
    //    we re-read fresh state, then write status:done so the final blob
    //    write contains BOTH videoUrl AND status. (If we just call
    //    setStatus, it may race with stage6's write within ms-granularity
    //    of Blob's uploadedAt sort and leave a "video" status persisted.)
    await updateJob(body.data.jobId, (j) => ({
      ...j,
      status: "done",
      artifacts: { ...j.artifacts, videoUrl: result.url },
    }));

    return NextResponse.json({ jobId: body.data.jobId, videoUrl: result.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
