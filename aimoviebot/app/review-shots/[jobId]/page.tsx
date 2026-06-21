"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DialogueLine = { speaker: string; line: string };
type Shot = {
  n: number;
  camera: string;
  action: string;
  performance: string;
  dialogue: DialogueLine[];
};
type Character = { name: string; imageUrl: string };
type Snapshot = {
  status: string;
  characters?: Character[];
  chunkCount?: number;
  videoDurationSec?: number;
  artifacts: {
    sceneDescription?: string;
    dialogue?: DialogueLine[];
    shotList?: Shot[];
  };
};

export default function ReviewShotsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/video?jobId=${jobId}`)
      .then((r) => r.json())
      .then((d: Snapshot & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        // If the job is no longer at this gate, send the user to the
        // single hub instead of leaving them on a stale editor.
        if (d.status !== "awaiting_shotlist_approval") {
          router.replace(`/status/${jobId}`);
          return;
        }
        setSnap(d);
        setShots(d.artifacts.shotList ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [jobId, router]);

  function setShot(i: number, patch: Partial<Shot>) {
    setShots((cs) => (cs ? cs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) : cs));
  }
  function setShotDialogue(i: number, dialogue: DialogueLine[]) {
    setShot(i, { dialogue });
  }
  function addDialogueLine(shotIdx: number, atIndex: number) {
    setShots((cs) => {
      if (!cs) return cs;
      const next = [...cs];
      const target = { ...next[shotIdx] };
      const dlg = [...target.dialogue];
      dlg.splice(atIndex, 0, { speaker: "", line: "" });
      target.dialogue = dlg;
      next[shotIdx] = target;
      return next;
    });
  }
  function removeDialogueLine(shotIdx: number, lineIdx: number) {
    setShots((cs) => {
      if (!cs) return cs;
      const next = [...cs];
      const target = { ...next[shotIdx] };
      target.dialogue = target.dialogue.filter((_, i) => i !== lineIdx);
      next[shotIdx] = target;
      return next;
    });
  }
  // Remove an entire shot. Hard floor at chunkCount (one shot per
  // 4-second clip). Trying to delete below it is a no-op (button is
  // also disabled in the UI). Remaining shots keep their .n; the
  // approve endpoint renumbers them sequentially on submit.
  const minShots = snap?.chunkCount ?? 4;
  function removeShot(shotIdx: number) {
    setShots((cs) => {
      if (!cs || cs.length <= minShots) return cs;
      return cs.filter((_, idx) => idx !== shotIdx);
    });
  }
  function moveShot(shotIdx: number, dir: -1 | 1) {
    setShots((cs) => {
      if (!cs) return cs;
      const j = shotIdx + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[shotIdx], next[j]] = [next[j], next[shotIdx]];
      return next;
    });
  }
  function moveDialogueLine(shotIdx: number, lineIdx: number, dir: -1 | 1) {
    setShots((cs) => {
      if (!cs) return cs;
      const next = [...cs];
      const target = { ...next[shotIdx] };
      const dlg = [...target.dialogue];
      const j = lineIdx + dir;
      if (j < 0 || j >= dlg.length) return cs;
      [dlg[lineIdx], dlg[j]] = [dlg[j], dlg[lineIdx]];
      target.dialogue = dlg;
      next[shotIdx] = target;
      return next;
    });
  }

  async function approve() {
    if (!shots) return;
    setSubmitting(true);
    setError(null);
    try {
      // Strip any blank dialogue rows the user left in place.
      const cleaned = shots.map((s) => ({
        ...s,
        dialogue: s.dialogue
          .map((d) => ({
            speaker: d.speaker.trim(),
            line: d.line.trim(),
          }))
          .filter((d) => d.speaker && d.line),
      }));
      const res = await fetch("/api/video/approve-shotlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, shots: cleaned }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/status/${jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!snap || !shots) return <p>Loading…</p>;

  if (snap.status !== "awaiting_shotlist_approval") {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shot list</h1>
        <p className="text-stone-600 text-sm">
          This job is in status <code>{snap.status}</code>, not awaiting shot
          list approval. Either the storyboard + video already started, or it
          hasn't reached the shot list step yet. View the{" "}
          <a className="text-violet-700 underline" href={`/status/${jobId}`}>
            status page
          </a>
          .
        </p>
      </main>
    );
  }

  const cast = snap.characters ?? [];
  const dialogue = snap.artifacts.dialogue ?? [];

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Review shots</h1>
        <p className="text-stone-600 text-sm">
          Edit any field of any shot. When you approve, the storyboard image
          and the final video render against exactly what you have here.
        </p>
        {snap.artifacts.sceneDescription ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600 hover:text-violet-700">
              Approved scene + dialogue (read-only)
            </summary>
            <div className="mt-2 space-y-2 border-l-2 border-stone-200 pl-3">
              <p className="text-stone-800 whitespace-pre-wrap">
                {snap.artifacts.sceneDescription}
              </p>
              {dialogue.length > 0 ? (
                <ul className="text-stone-700">
                  {dialogue.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium">{d.speaker}:</span> "{d.line}"
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        ) : null}
      </header>

      <datalist id="cast-names">
        {cast.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>

      <p className="text-xs text-stone-500">
        {shots.length} shot{shots.length === 1 ? "" : "s"}. This render is{" "}
        {minShots * 4}s = {minShots} clip{minShots === 1 ? "" : "s"} of
        4 seconds each. Min {minShots} (one shot per clip), max{" "}
        {minShots * 4} (four shots per clip).
      </p>

      <ol className="space-y-4">
        {shots.map((s, i) => (
          <li
            key={i}
            className="border border-stone-200 rounded-lg p-3 bg-white space-y-2"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-stone-500 font-mono w-16">
                Shot {i + 1}
              </span>
              <input
                value={s.camera}
                onChange={(e) => setShot(i, { camera: e.target.value })}
                placeholder="Camera / framing / angle"
                className="flex-1 border border-stone-300 rounded p-2 bg-white text-sm"
              />
              <button
                type="button"
                onClick={() => moveShot(i, -1)}
                disabled={i === 0}
                className="text-stone-500 text-xs px-1 disabled:text-stone-300"
                aria-label="Move shot up"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveShot(i, 1)}
                disabled={i === shots.length - 1}
                className="text-stone-500 text-xs px-1 disabled:text-stone-300"
                aria-label="Move shot down"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeShot(i)}
                disabled={shots.length <= minShots}
                className="text-red-600 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50 disabled:text-stone-300 disabled:border-stone-200 disabled:hover:bg-transparent"
                aria-label="Delete shot"
                title={
                  shots.length <= minShots
                    ? `Need at least ${minShots} shot${minShots === 1 ? "" : "s"} (one per video clip)`
                    : "Delete this shot"
                }
              >
                Delete
              </button>
            </div>
            <label className="block">
              <span className="text-xs text-stone-500">Action</span>
              <textarea
                value={s.action}
                onChange={(e) => setShot(i, { action: e.target.value })}
                rows={2}
                className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-stone-500">Performance (body acting)</span>
              <textarea
                value={s.performance}
                onChange={(e) => setShot(i, { performance: e.target.value })}
                rows={3}
                className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
              />
            </label>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-500">
                  Dialogue on this shot ({s.dialogue.length})
                </span>
                <button
                  type="button"
                  onClick={() => addDialogueLine(i, s.dialogue.length)}
                  className="text-violet-700 text-xs"
                >
                  + add line
                </button>
              </div>
              {s.dialogue.length === 0 ? (
                <p className="text-stone-400 text-xs italic">No dialogue.</p>
              ) : null}
              {s.dialogue.map((d, lineIdx) => (
                <div key={lineIdx} className="flex gap-1 items-start">
                  <input
                    value={d.speaker}
                    onChange={(e) => {
                      const next = [...s.dialogue];
                      next[lineIdx] = { ...next[lineIdx], speaker: e.target.value };
                      setShotDialogue(i, next);
                    }}
                    list="cast-names"
                    placeholder="Speaker"
                    className="w-28 border border-stone-300 rounded p-1.5 bg-white text-xs"
                  />
                  <input
                    value={d.line}
                    onChange={(e) => {
                      const next = [...s.dialogue];
                      next[lineIdx] = { ...next[lineIdx], line: e.target.value };
                      setShotDialogue(i, next);
                    }}
                    placeholder="What they say out loud"
                    className="flex-1 border border-stone-300 rounded p-1.5 bg-white text-xs"
                  />
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveDialogueLine(i, lineIdx, -1)}
                      disabled={lineIdx === 0}
                      className="text-stone-500 text-xs px-1 disabled:text-stone-300"
                      aria-label="Up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDialogueLine(i, lineIdx, 1)}
                      disabled={lineIdx === s.dialogue.length - 1}
                      className="text-stone-500 text-xs px-1 disabled:text-stone-300"
                      aria-label="Down"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDialogueLine(i, lineIdx)}
                    className="text-stone-500 text-xs px-1"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <button
        onClick={approve}
        disabled={submitting}
        className="w-full bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
      >
        {submitting ? "Approving…" : "Approve shots & render"}
      </button>
    </main>
  );
}
