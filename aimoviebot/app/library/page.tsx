"use client";
import { useEffect, useState } from "react";

type ImportedVideo = {
  source: "higgsfield";
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
  model?: string;
  durationSec?: number;
  createdAtIso?: string;
  sourceUrl?: string;
  shortTitle: string;
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

type Resp = {
  imported: ImportedVideo[];
  projectClips: ProjectVideo[];
  titlesByJobId?: Record<string, string>;
};

type SheetEntry = {
  kind: "character" | "location";
  sourceUrl: string;
  sheetUrl: string;
  label?: string;
  createdAt: string;
};

type TabName = "projects" | "imports" | "assets";

export default function LibraryPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [sheets, setSheets] = useState<SheetEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabName>("projects");

  useEffect(() => {
    fetch("/api/library/videos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Resp) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    fetch("/api/library/sheets", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { entries: SheetEntry[] }) => setSheets(d.entries))
      .catch(() => setSheets([]));
  }, []);

  async function deleteSheet(entry: SheetEntry) {
    if (
      !confirm(
        `Delete cached ${entry.kind} sheet${entry.label ? ` for "${entry.label}"` : ""}? Next render with the same source upload will regenerate it.`,
      )
    ) {
      return;
    }
    const url = `/api/library/sheets?kind=${entry.kind}&source=${encodeURIComponent(entry.sourceUrl)}`;
    await fetch(url, { method: "DELETE" });
    setSheets((s) => (s ?? []).filter((e) => e.sourceUrl !== entry.sourceUrl));
  }

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-stone-600 text-sm">
          Three tabs. <strong>Projects</strong> = videos this app rendered.{" "}
          <strong>Imports</strong> = videos pulled in from your Higgsfield
          account. <strong>Assets</strong> = cached character + location
          sheets that get auto-reused on future renders.
        </p>
      </header>

      <div className="flex gap-2 border-b border-stone-200">
        <Tab
          active={tab === "projects"}
          label={`Projects (${countProjects(data.projectClips)})`}
          onClick={() => setTab("projects")}
        />
        <Tab
          active={tab === "imports"}
          label={`Imports (${data.imported.length})`}
          onClick={() => setTab("imports")}
        />
        <Tab
          active={tab === "assets"}
          label={`Assets (${sheets?.length ?? "…"})`}
          onClick={() => setTab("assets")}
        />
      </div>

      {tab === "projects" ? (
        <ProjectsSection
          clips={data.projectClips}
          titlesByJobId={data.titlesByJobId ?? {}}
        />
      ) : tab === "imports" ? (
        <ImportsSection items={data.imported} />
      ) : (
        <AssetsSection sheets={sheets} onDelete={deleteSheet} />
      )}
    </main>
  );
}

function Tab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active
          ? "border-violet-700 text-violet-700 font-medium"
          : "border-transparent text-stone-500 hover:text-violet-700"
      }`}
    >
      {label}
    </button>
  );
}

function countProjects(clips: ProjectVideo[]): number {
  return new Set(clips.map((c) => c.jobId)).size;
}

function ProjectsSection({
  clips,
  titlesByJobId,
}: {
  clips: ProjectVideo[];
  titlesByJobId: Record<string, string>;
}) {
  const groups = new Map<string, ProjectVideo[]>();
  for (const c of clips) {
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
  const jobIds = Array.from(groups.keys()).sort((a, b) => {
    const at = Math.max(
      ...(groups.get(a) ?? []).map((x) => new Date(x.createdAtIso).getTime()),
    );
    const bt = Math.max(
      ...(groups.get(b) ?? []).map((x) => new Date(x.createdAtIso).getTime()),
    );
    return bt - at;
  });

  if (jobIds.length === 0) {
    return (
      <p className="text-stone-500 text-sm">
        No project videos yet. Renders auto-save here as Stage 5 clips
        complete.
      </p>
    );
  }
  return (
    <div className="space-y-8">
      {jobIds.map((jobId) => (
        <section key={jobId} className="space-y-3">
          <h2 className="text-sm font-medium text-stone-700">
            <a href={`/status/${jobId}`} className="hover:text-violet-700">
              {titlesByJobId[jobId] || "Untitled render"}{" "}
              <span className="font-mono text-xs text-stone-400 ml-1">
                {jobId.slice(0, 8)}
              </span>
            </a>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {(groups.get(jobId) ?? []).map((c) => (
              <ProjectTile key={c.videoUrl} c={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ImportsSection({ items }: { items: ImportedVideo[] }) {
  if (items.length === 0)
    return (
      <p className="text-stone-500 text-sm">
        No imported videos. Anything you've previously rendered in
        Higgsfield shows up here.
      </p>
    );
  // Group by date bucket, in the order they first appear (already
  // newest-first from the API).
  const groups = new Map<string, ImportedVideo[]>();
  for (const v of items) {
    const list = groups.get(v.dateBucket) ?? [];
    list.push(v);
    groups.set(v.dateBucket, list);
  }
  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([bucket, vs]) => (
        <section key={bucket} className="space-y-3">
          <h2 className="text-sm font-medium text-stone-700">
            {bucket}{" "}
            <span className="text-stone-400 font-normal text-xs">
              ({vs.length})
            </span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {vs.map((v) => (
              <ImportedTile key={v.id} v={v} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssetsSection({
  sheets,
  onDelete,
}: {
  sheets: SheetEntry[] | null;
  onDelete: (entry: SheetEntry) => void;
}) {
  if (sheets == null) return <p className="text-stone-500 text-sm">Loading…</p>;
  if (sheets.length === 0)
    return (
      <p className="text-stone-500 text-sm">
        No cached sheets yet. After your first successful render, the
        character + location sheets the app generates will appear here
        and be reused automatically on future renders with the same
        source uploads.
      </p>
    );
  const characters = sheets.filter((s) => s.kind === "character");
  const locations = sheets.filter((s) => s.kind === "location");
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-stone-700">
          Character sheets ({characters.length})
        </h2>
        {characters.length === 0 ? (
          <p className="text-stone-500 text-sm">None.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {characters.map((s) => (
              <SheetTile key={s.sourceUrl} entry={s} onDelete={onDelete} />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-stone-700">
          Location sheets ({locations.length})
        </h2>
        {locations.length === 0 ? (
          <p className="text-stone-500 text-sm">None.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {locations.map((s) => (
              <SheetTile key={s.sourceUrl} entry={s} onDelete={onDelete} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SheetTile({
  entry,
  onDelete,
}: {
  entry: SheetEntry;
  onDelete: (entry: SheetEntry) => void;
}) {
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <div className="grid grid-cols-2 bg-stone-50">
        <div className="border-r border-stone-200">
          <img
            src={entry.sourceUrl}
            alt="source"
            className="w-full aspect-[9/16] object-cover"
          />
          <p className="text-[10px] text-center text-stone-500 py-1">
            source
          </p>
        </div>
        <div>
          <img
            src={entry.sheetUrl}
            alt="sheet"
            className="w-full aspect-[9/16] object-cover"
          />
          <p className="text-[10px] text-center text-stone-500 py-1">
            sheet
          </p>
        </div>
      </div>
      <div className="p-2 space-y-1">
        <p className="text-[11px] font-medium text-stone-800 truncate">
          {entry.label ?? "(no label)"}
        </p>
        <p className="text-[10px] text-stone-500">
          Cached {fmt(entry.createdAt)}
        </p>
        <button
          onClick={() => onDelete(entry)}
          className="text-[11px] text-stone-500 hover:text-red-600"
        >
          Delete cache
        </button>
      </div>
    </div>
  );
}

function ProjectTile({ c }: { c: ProjectVideo }) {
  const label =
    c.kind === "final"
      ? "Final stitched"
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
        <p className="text-[11px] font-medium text-stone-700">{label}</p>
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

function ImportedTile({ v }: { v: ImportedVideo }) {
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      {v.thumbnailUrl ? (
        <img
          src={v.thumbnailUrl}
          alt=""
          className="w-full aspect-[9/16] object-cover bg-stone-100"
        />
      ) : (
        <video
          src={v.videoUrl}
          className="w-full aspect-[9/16] object-cover bg-black"
          muted
          preload="metadata"
        />
      )}
      <div className="p-2 space-y-1">
        <p
          className="text-[11px] font-medium text-stone-800 line-clamp-2"
          title={v.prompt}
        >
          {v.shortTitle}
        </p>
        <p className="text-[10px] text-stone-500">
          {v.model ?? "—"} · {v.durationSec ?? "?"}s
          {v.createdAtIso ? ` · ${fmtTimeOnly(v.createdAtIso)}` : ""}
        </p>
        <div className="flex gap-2 text-[11px]">
          <a
            href={v.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-violet-700 underline"
          >
            Play
          </a>
          <a
            href={v.videoUrl}
            download
            className="text-violet-700 underline"
          >
            Download
          </a>
        </div>
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
function fmtTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
