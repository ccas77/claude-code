import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Returns every video known to the app:
//   - Final stitched + captioned videos under jobs/{jobId}/stage6-final.mp4
//     plus jobs/{jobId}/stage5-clip-N.mp4 raw clips with their owning job.
//   - Imported Higgsfield generations under library/higgsfield/{id}.json
//     (sidecar that includes the persisted mp4 URL + prompt + thumbnail).
// Sorted newest first so the most recent work appears at the top.
type ImportedHiggsfieldVideo = {
  source: "higgsfield";
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
  model?: string;
  durationSec?: number;
  createdAtIso?: string;
  // The MCP source URL we copied from. Kept so the dashboard link still
  // resolves if the user wants to look at the original.
  sourceUrl?: string;
};

type ProjectVideo = {
  source: "project";
  jobId: string;
  kind: "final" | "clip";
  index?: number; // clip index for clip kind
  videoUrl: string;
  createdAtIso: string;
};

export async function GET() {
  const [imports, jobBlobs] = await Promise.all([
    list({ prefix: "library/higgsfield/", limit: 1000 }),
    list({ prefix: "jobs/", limit: 1000 }),
  ]);

  const importedSidecars = imports.blobs.filter((b) =>
    b.pathname.endsWith(".json"),
  );
  const importedVideos: ImportedHiggsfieldVideo[] = (
    await Promise.all(
      importedSidecars.map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: "no-store" });
          if (!res.ok) return null;
          return (await res.json()) as ImportedHiggsfieldVideo;
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is ImportedHiggsfieldVideo => Boolean(x));

  const projectVideos: ProjectVideo[] = [];
  for (const b of jobBlobs.blobs) {
    const finalMatch = b.pathname.match(/^jobs\/([0-9a-f-]+)\/stage6-final\.mp4$/i);
    const clipMatch = b.pathname.match(/^jobs\/([0-9a-f-]+)\/stage5-clip-(\d+)\.mp4$/i);
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

  const ts = (x: ImportedHiggsfieldVideo | ProjectVideo) =>
    x.source === "higgsfield"
      ? x.createdAtIso
        ? new Date(x.createdAtIso).getTime()
        : 0
      : new Date(x.createdAtIso).getTime();
  importedVideos.sort((a, b) => ts(b) - ts(a));
  projectVideos.sort((a, b) => ts(b) - ts(a));

  return NextResponse.json(
    {
      imported: importedVideos,
      projectClips: projectVideos,
    },
    { headers: noStore },
  );
}
