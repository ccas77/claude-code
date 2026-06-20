"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "A" | "B" | "C";

const modeLabels: Record<Mode, { title: string; hint: string; placeholder: string }> = {
  A: {
    title: "A · Write it",
    hint: "You write the scene yourself. Include dialogue in quotes if you want it spoken.",
    placeholder:
      'She steps into the rain-soaked street. He follows.\n"You shouldn\'t have come here."\n"Then why did you call?"',
  },
  B: {
    title: "B · Adapt an excerpt",
    hint: "Paste a passage. The model extracts a filmable scene and pulls dialogue from the prose.",
    placeholder: "Paste a few paragraphs of prose here…",
  },
  C: {
    title: "C · From a blurb",
    hint: "Give a title or a one-line idea. The model proposes 2–3 alternates and writes dialogue.",
    placeholder: "Title or blurb. e.g. A reluctant heir confronts her sister at midnight.",
  },
};

function ConceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const characterImageUrl = params.get("character") ?? "";
  const locationImageUrl = params.get("location") ?? "";
  const [mode, setMode] = useState<Mode>("A");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!characterImageUrl || !locationImageUrl) {
    return (
      <p className="text-stone-600">
        Missing uploads.{" "}
        <a className="text-violet-700 underline" href="/">
          Start over
        </a>
        .
      </p>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/video/concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          conceptInput: text,
          characterImageUrl,
          locationImageUrl,
        }),
      });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.push(`/review/${data.jobId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Concept</h1>
        <p className="text-stone-600 mt-1">{modeLabels[mode].hint}</p>
      </header>

      <div className="flex gap-2">
        {(["A", "B", "C"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded text-sm ${
              mode === m
                ? "bg-violet-700 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
          >
            {modeLabels[m].title}
          </button>
        ))}
      </div>

      <textarea
        className="w-full min-h-[200px] border border-stone-300 rounded-lg p-3 bg-white text-stone-900"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={modeLabels[mode].placeholder}
      />

      {error ? <p className="text-red-600 text-sm">{error}</p> : null}

      <div className="flex gap-3">
        <a
          href="/"
          className="px-4 py-2 rounded border border-stone-300 text-stone-700"
        >
          Back
        </a>
        <button
          onClick={submit}
          disabled={busy || text.trim().length === 0}
          className="flex-1 bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
        >
          {busy ? "Drafting…" : "Draft scene"}
        </button>
      </div>
    </main>
  );
}

export default function ConceptPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ConceptInner />
    </Suspense>
  );
}
