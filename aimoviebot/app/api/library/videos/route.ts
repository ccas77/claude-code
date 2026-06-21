import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Returns every video this app has ever rendered: the final stitched +
// captioned videos under jobs/{jobId}/stage6-final.mp4 and the raw
// per-chunk clips under jobs/{jobId}/stage5-clip-N.mp4. Newest first.
type ProjectVideo = {
  source: "project";
  jobId: string;
  kind: "final" | "clip";
  index?: number;
  videoUrl: string;
  createdAtIso: string;
};

export async function GET() {
  const jobBlobs = await list({ prefix: "jobs/", limit: 1000 });

  const projectVideos: ProjectVideo[] = [];
  for (const b of jobBlobs.blobs) {
    const finalMatch = b.pathname.match(
      /^jobs\/([0-9a-f-]+)\/stage6-final\.mp4$/i,
    );
    const clipMatch = b.pathname.match(
      /^jobs\/([0-9a-f-]+)\/stage5-clip-(\d+)\.mp4$/i,
    );
    if (finalMatch) {
      projectVideos.push({
        source: "project",
        jobId: finalMatch[1],
        kind: "final",
        videoUrl: b.url,
        createdAtIso: new Date(b.uploadedAt).toISOString(),
      });
    } else if (clipMatch) {
      projectVideos.push({
        source: "project",
        jobId: clipMatch[1],
        kind: "clip",
        index: parseInt(clipMatch[2], 10),
        videoUrl: b.url,
        createdAtIso: new Date(b.uploadedAt).toISOString(),
      });
    }
  }

  projectVideos.sort(
    (a, b) =>
      new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
  );

  return NextResponse.json({ projectClips: projectVideos }, { headers: noStore });
}
