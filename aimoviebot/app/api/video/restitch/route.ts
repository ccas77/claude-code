import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clipUrlsFingerprint,
  readJob,
  setStatus,
  updateJob,
} from "@/lib/video-module/storage";
import { stage6 } from "@/lib/video-module/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Concat current clipUrls + Whisper + caption burn. No Higgsfield calls.
// Triggered manually from the status page when the user is happy with
// the current set of clips. Updates videoUrl + lastStitchedClipFingerprint
// so the "Restitch" button hides itself until the next clip change.
const bodySchema = z.object({
  jobId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const { jobId } = parsed.data;

    const job = await readJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const clipUrls = job.artifacts.clipUrls;
    if (!clipUrls || clipUrls.length === 0) {
      return NextResponse.json(
        { error: "No clip URLs on job — nothing to stitch" },
        { status: 409 },
      );
    }

    await setStatus(jobId, "captioning");
    const result = await stage6(jobId, {
      clipUrls,
      dialogue: job.artifacts.dialogue ?? [],
    });

    // Snapshot the fingerprint of what we just stitched so the UI can
    // tell if any clip changes since.
    const fp = clipUrlsFingerprint(clipUrls);
    await updateJob(jobId, (j) => ({
      ...j,
      status: "done",
      artifacts: {
        ...j.artifacts,
        videoUrl: result.url,
        lastStitchedClipFingerprint: fp,
      },
    }));

    return NextResponse.json({ jobId, videoUrl: result.url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
