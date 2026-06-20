"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DialogueLine = { speaker: string; line: string };

type ConceptDraft = {
  status: string;
  artifacts: {
    sceneDescription?: string;
    dialogue?: DialogueLine[];
  };
};

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState("");
  const [dialogue, setDialogue] = useState<DialogueLine[]>([]);
  const [duration, setDuration] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/video?jobId=${jobId}`);
        const data = (await res.json()) as ConceptDraft & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setScene(data.artifacts.sceneDescription ?? "");
        setDialogue(data.artifacts.dialogue ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  function setLine(i: number, patch: Partial<DialogueLine>) {
    setDialogue((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addLine() {
    setDialogue((d) => [...d, { speaker: "", line: "" }]);
  }
  function removeLine(i: number) {
    setDialogue((d) => d.filter((_, idx) => idx !== i));
  }

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const cleaned = dialogue
        .map((l) => ({ speaker: l.speaker.trim(), line: l.line.trim() }))
        .filter((l) => l.speaker && l.line);
      const res = await fetch("/api/video/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          sceneDescription: scene,
          dialogue: cleaned,
          videoDurationSec: duration,
        }),
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

  if (loading) return <p>Loading draft…</p>;

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Review & edit</h1>
        <p className="text-stone-600 mt-1">
          The draft is yours to fix before the expensive stages run. The dialogue
          lines below are what Seedance will speak aloud.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-stone-700">Scene action</h2>
        <textarea
          className="w-full min-h-[160px] border border-stone-300 rounded-lg p-3 bg-white"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-stone-700">
            Dialogue ({dialogue.length} {dialogue.length === 1 ? "line" : "lines"})
          </h2>
          <button onClick={addLine} className="text-violet-700 text-sm">
            + Add line
          </button>
        </div>
        {dialogue.length === 0 ? (
          <p className="text-stone-500 text-sm">
            No dialogue. This scene will be wordless unless you add lines.
          </p>
        ) : null}
        <ul className="space-y-2">
          {dialogue.map((d, i) => (
            <li key={i} className="flex gap-2 items-start">
              <input
                value={d.speaker}
                onChange={(e) => setLine(i, { speaker: e.target.value })}
                placeholder="Speaker"
                className="w-32 border border-stone-300 rounded p-2 bg-white"
              />
              <input
                value={d.line}
                onChange={(e) => setLine(i, { line: e.target.value })}
                placeholder="What they say out loud"
                className="flex-1 border border-stone-300 rounded p-2 bg-white"
              />
              <button
                onClick={() => removeLine(i)}
                className="text-stone-500 text-sm px-2 py-2"
                aria-label="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-stone-700">Render duration</h2>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={4}
            max={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm text-stone-700 w-12 text-right">{duration}s</span>
        </div>
        <p className="text-xs text-stone-500">
          4s is the cheap test default. Step up for production renders so 16
          shots have room to breathe.
        </p>
      </section>

      {error ? <p className="text-red-600 text-sm">{error}</p> : null}

      <button
        onClick={approve}
        disabled={submitting || !scene.trim()}
        className="w-full bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
      >
        {submitting ? "Starting render…" : "Approve & render"}
      </button>
    </main>
  );
}
