import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { readJob } from "@/lib/video-module/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

// Returns every video the user can browse: videos this app rendered
// (project clips + finals under jobs/{jobId}/...) AND videos previously
// imported from Higgsfield (library/higgsfield/{id}.json sidecar). Each
// imported video is given a `shortTitle` derived from the first sentence
// of its prompt, since the raw prompt can be many KB and is unreadable
// as a label.
type ImportedHiggsfieldVideo = {
  source: "higgsfield";
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
  model?: string;
  durationSec?: number;
  createdAtIso?: string;
  sourceUrl?: string;
  // Derived fields:
  shortTitle: string;
  // Bucket date label like "Today", "Yesterday", or "Sat 20 Jun" — the
  // UI uses this to group cards into clear date sections.
  dateBucket: string;
};

type ProjectVideo = {
  source: "project";
  jobId: string;
  kind: "final" | "clip";
  index?: number;
  videoUrl: string;
  createdAtIso: string;
};

// First sentence of the prompt, capped to 80 chars. The aimoviebot
// prompts start with a long boilerplate header followed by per-shot
// directives; for those we extract the first real action line so the
// label reads like "(Shot 1) angle wide shot, camera near ground level…"
// rather than the boilerplate.
function deriveShortTitle(prompt: string | undefined): string {
  if (!prompt) return "(no prompt)";
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  const shotIdx = cleaned.search(/\(Shot 1\)/);
  if (shotIdx >= 0) {
    const fromShot = cleaned.slice(shotIdx + 9).trim();
    return fromShot.length > 80 ? fromShot.slice(0, 77) + "…" : fromShot;
  }
  const dot = cleaned.indexOf(". ");
  const first = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return first.length > 80 ? first.slice(0, 77) + "…" : first;
}

// London-local date label. Same-day -> "Today", previous -> "Yesterday",
// older -> "Sat 20 Jun" so the user can see at a glance roughly when
// each batch happened.
function deriveDateBucket(iso: string | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
  if (fmt(d) === fmt(today)) return "Today";
  if (fmt(d) === fmt(yesterday)) return "Yesterday";
  return fmt(d);
}

export async function GET() {
  const [imports, jobBlobs] = await Promise.all([
    list({ prefix: "library/higgsfield/", limit: 1000 }),
    list({ prefix: "jobs/", limit: 1000 }),
  ]);

  const sidecars = imports.blobs.filter((b) => b.pathname.endsWith(".json"));
  const imported: ImportedHiggsfieldVideo[] = (
    await Promise.all(
      sidecars.map(async (b) => {
        try {
          const res = await fetch(b.url, { cache: "no-store" });
          if (!res.ok) return null;
          const raw = (await res.json()) as Omit<
            ImportedHiggsfieldVideo,
            "shortTitle" | "dateBucket" | "source"
          >;
          return {
            ...raw,
            source: "higgsfield" as const,
            shortTitle: deriveShortTitle(raw.prompt),
            dateBucket: deriveDateBucket(raw.createdAtIso),
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is ImportedHiggsfieldVideo => Boolean(x));

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

  imported.sort(
    (a, b) =>
      new Date(b.createdAtIso ?? 0).getTime() -
      new Date(a.createdAtIso ?? 0).getTime(),
  );
  projectVideos.sort(
    (a, b) =>
      new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
  );

  // Look up the project title for each distinct jobId in projectVideos
  // so the Library can show "MaskX graveyard chase" instead of a UUID.
  const uniqueJobIds = Array.from(
    new Set(projectVideos.map((v) => v.jobId)),
  );
  const titlesByJobId: Record<string, string> = {};
  await Promise.all(
    uniqueJobIds.map(async (jid) => {
      try {
        const job = await readJob(jid);
        if (job?.title) titlesByJobId[jid] = job.title;
      } catch {
        // ignore — UI falls back to jobId
      }
    }),
  );

  return NextResponse.json(
    { imported, projectClips: projectVideos, titlesByJobId },
    { headers: noStore },
  );
}
