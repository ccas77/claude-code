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
};

export default function LibraryPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] =
    useState<{ scanned: number; imported: number; skipped: number } | null>(
      null,
    );

  async function load() {
    try {
      const res = await fetch("/api/library/videos", { cache: "no-store" });
      const json = (await res.json()) as Resp;
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function importFromHiggsfield() {
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const res = await fetch("/api/library/import-higgsfield", {
        method: "POST",
      });
      const json = (await res.json()) as {
        scanned: number;
        imported: number;
        skipped: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setImportResult({
        scanned: json.scanned,
        imported: json.imported,
        skipped: json.skipped,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  if (err) return <p className="text-red-600">{err}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-stone-600 text-sm">
          Every video produced by the app, plus everything ever generated in
          your Higgsfield account once you import it. Click any to play or
          download.
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={importFromHiggsfield}
            disabled={importing}
            className="bg-violet-700 text-white text-sm rounded px-3 py-1.5 disabled:bg-stone-300"
          >
            {importing
              ? "Importing from Higgsfield…"
              : "Import from Higgsfield"}
          </button>
          {importResult ? (
            <span className="text-xs text-stone-600">
              scanned {importResult.scanned} · imported{" "}
              {importResult.imported} new · skipped{" "}
              {importResult.skipped} already-imported / incomplete
            </span>
          ) : null}
        </div>
      </header>

      <Section title={`Imported from Higgsfield (${data.imported.length})`}>
        {data.imported.length === 0 ? (
          <p className="text-stone-500 text-sm">
            Nothing imported yet. Click "Import from Higgsfield" above to copy
            every completed video generation into your Blob storage so they
            live alongside your project work.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {data.imported.map((v) => (
              <ImportedTile key={v.id} v={v} />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Project clips + finals (${data.projectClips.length})`}>
        {data.projectClips.length === 0 ? (
          <p className="text-stone-500 text-sm">
            No project clips persisted yet. Once a project's Stage 5 succeeds,
            each chunk lands here.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {data.projectClips.map((c) => (
              <ProjectClipTile key={c.videoUrl} c={c} />
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-stone-700">{title}</h2>
      {children}
    </section>
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
        <p className="text-[11px] text-stone-700 line-clamp-2" title={v.prompt}>
          {v.prompt ?? "(no prompt)"}
        </p>
        <p className="text-[10px] text-stone-500">
          {v.model ?? "—"} · {v.durationSec ?? "?"}s ·{" "}
          {v.createdAtIso ? fmt(v.createdAtIso) : ""}
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

function ProjectClipTile({ c }: { c: ProjectVideo }) {
  const label =
    c.kind === "final"
      ? "Final stitched video"
      : `Clip ${c.index} (raw chunk)`;
  return (
    <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
      <video
        src={c.videoUrl}
        className="w-full aspect-[9/16] object-cover bg-black"
        muted
        preload="metadata"
      />
      <div className="p-2 space-y-1">
        <p className="text-[11px] text-stone-700">{label}</p>
        <p className="text-[10px] text-stone-500">
          {fmt(c.createdAtIso)}
        </p>
        <div className="flex gap-2 text-[11px]">
          <a
            href={`/status/${c.jobId}`}
            className="text-violet-700 underline"
          >
            Project
          </a>
          <a
            href={c.videoUrl}
            download
            className="text-violet-700 underline"
          >
            Download
          </a>
        </div>
        <p className="text-[10px] font-mono text-stone-400 truncate">
          {c.jobId}
        </p>
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
