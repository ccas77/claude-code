"use client";
import { use, useEffect, useState } from "react";

type DialogueLine = { speaker: string; line: string };
type CharacterSheet = { name: string; url: string };

type StatusResponse = {
  jobId: string;
  status: string;
  artifacts: {
    sceneDescription?: string;
    dialogue?: DialogueLine[];
    characterSheets?: CharacterSheet[];
    locationSheetUrl?: string;
    shotList?: { n: number; camera: string; action: string; dialogue: DialogueLine[] }[];
    storyboardUrl?: string;
    videoUrl?: string;
  };
  servedBy?: Record<string, "higgsfield" | "gateway">;
  error?: { stage: string; message: string };
};

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  concept: "Drafting concept",
  awaiting_approval: "Awaiting approval",
  char_sheets: "Character sheets",
  loc_sheet: "Location sheet",
  shot_list: "16-shot list",
  storyboard: "Storyboard grid",
  video: "Final video",
  done: "Done",
  failed: "Failed",
};

export default function StatusPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/video?jobId=${jobId}`);
        const json = (await res.json()) as StatusResponse & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
        setData(json);
        if (json.status !== "done" && json.status !== "failed") {
          timer = setTimeout(tick, 4000);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const a = data.artifacts;

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {STAGE_LABELS[data.status] ?? data.status}
        </h1>
        <p className="text-stone-600 mt-1 text-sm">Job {jobId}</p>
        {data.error ? (
          <p className="text-red-600 mt-2 text-sm">
            Failed at {data.error.stage}: {data.error.message}
          </p>
        ) : null}
      </header>

      {a.videoUrl ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Final video</h2>
          <video
            controls
            src={a.videoUrl}
            className="w-full max-w-sm mx-auto aspect-[9/16] bg-black rounded-lg"
          />
          <a
            href={a.videoUrl}
            download
            className="inline-block text-violet-700 underline text-sm"
          >
            Download mp4
          </a>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-4">
        {(a.characterSheets ?? []).map((sheet) => (
          <ArtifactTile
            key={sheet.name}
            label={sheet.name}
            url={sheet.url}
            served={data.servedBy?.stage1}
          />
        ))}
        {(!a.characterSheets || a.characterSheets.length === 0) &&
        data.status !== "done" &&
        data.status !== "failed" ? (
          <ArtifactTile label="Character sheets" url={undefined} />
        ) : null}
        <ArtifactTile
          label="Location sheet"
          url={a.locationSheetUrl}
          served={data.servedBy?.stage2}
        />
        <ArtifactTile
          label="Storyboard"
          url={a.storyboardUrl}
          served={data.servedBy?.stage4}
        />
      </section>

      {a.shotList ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Shot list</h2>
          <ol className="space-y-1 text-sm text-stone-800">
            {a.shotList.map((s) => (
              <li key={s.n}>
                <span className="font-medium">Shot {s.n}:</span>{" "}
                <span className="text-stone-600">{s.camera}</span> — {s.action}
                {s.dialogue.length > 0 ? (
                  <span className="ml-1 text-violet-700">
                    {s.dialogue
                      .map((d) => `[${d.speaker}: "${d.line}"]`)
                      .join(" ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {a.sceneDescription ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Approved scene</h2>
          <p className="text-sm text-stone-800 whitespace-pre-wrap">
            {a.sceneDescription}
          </p>
          {a.dialogue && a.dialogue.length > 0 ? (
            <ul className="text-sm text-stone-700">
              {a.dialogue.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.speaker}:</span> "{d.line}"
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function ArtifactTile({
  label,
  url,
  served,
}: {
  label: string;
  url?: string;
  served?: "higgsfield" | "gateway";
}) {
  return (
    <div className="border border-stone-200 rounded-lg p-3 bg-white">
      <div className="text-xs text-stone-600 mb-2 flex justify-between">
        <span>{label}</span>
        {served ? <span className="text-stone-400">{served}</span> : null}
      </div>
      {url ? (
        <img src={url} alt={label} className="w-full aspect-[9/16] object-cover rounded" />
      ) : (
        <div className="w-full aspect-[9/16] rounded bg-stone-100 border border-dashed border-stone-300 flex items-center justify-center text-stone-400 text-xs">
          pending
        </div>
      )}
    </div>
  );
}
