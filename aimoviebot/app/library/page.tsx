"use client";
import { useEffect, useState } from "react";

type ProjectVideo = {
  source: "project";
  jobId: string;
  kind: "final" | "clip";
  index?: number;
  videoUrl: string;
  createdAtIso: string;
};

type Resp = {
  projectClips: ProjectVideo[];
};

export default function LibraryPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library/videos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Resp) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p>Loading…</p>;

  // Group clips by jobId so each project's chunks sit together. The
  // stitched final is the lead artifact within each group; raw chunks
  // follow in numeric order.
  const groups = new Map<string, ProjectVideo[]>();
  for (const c of data.projectClips) {
    const list = groups.get(c.jobId) ?? [];
    list.push(c);
    groups.set(c.jobId, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.kind === b.kind) return (a.index ?? 0) - (b.index ?? 0);
      return a.kind === "final" ? -1 : 1;
    });
  }
  const orderedJobIds = Array.from(groups.keys()).sort((a, b) => {
    const at = Math.max(
      ...(groups.get(a) ?? []).map((x) => new Date(x.createdAtIso).getTime()),
    );
    const bt = Math.max(
      ...(groups.get(b) ?? []).map((x) => new Date(x.createdAtIso).getTime()),
    );
    return bt - at;
  });

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-stone-600 text-sm">
          Every video this app has produced, grouped by project. Final
          stitched + captioned video first, then the raw 4-second chunks
          that make it up.
        </p>
      </header>

      {orderedJobIds.length === 0 ? (
        <p className="text-stone-500 text-sm">
          No project videos yet. Start a render from the Render page and the
          clips will appear here as soon as Stage 5 finishes any chunk.
        </p>
      ) : (
        orderedJobIds.map((jobId) => (
          <section key={jobId} className="space-y-3">
            <h2 className="text-sm font-medium text-stone-700">
              <a
                href={`/status/${jobId}`}
                className="hover:text-violet-700"
              >
                Project{" "}
                <span className="font-mono text-xs text-stone-500">
                  {jobId}
                </span>
              </a>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {(groups.get(jobId) ?? []).map((c) => (
                <ProjectClipTile key={c.videoUrl} c={c} />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

function ProjectClipTile({ c }: { c: ProjectVideo }) {
  const label =
    c.kind === "final"
      ? "Final stitched video"
      : `Clip ${c.index} (raw chunk)`;
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <video
        src={c.videoUrl}
        controls
        className="w-full aspect-[9/16] object-cover bg-black"
        preload="metadata"
      />
      <div className="p-2 space-y-1">
        <p className="text-[11px] text-stone-700">{label}</p>
        <p className="text-[10px] text-stone-500">{fmt(c.createdAtIso)}</p>
        <a
          href={c.videoUrl}
          download
          className="text-violet-700 underline text-[11px]"
        >
          Download
        </a>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
