"use client";
import { useEffect, useState } from "react";

type PromptKey =
  | "conceptSystem"
  | "modeA"
  | "modeB"
  | "modeC"
  | "stage1"
  | "stage2"
  | "stage3"
  | "stage4"
  | "stage5";

type Doc = { label: string; description: string; placeholders: string[] };

type Snapshot = {
  defaults: Record<PromptKey, string>;
  overrides: Partial<Record<PromptKey, string>>;
  docs: Record<PromptKey, Doc>;
  keys: PromptKey[];
};

export default function PromptsPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<PromptKey, string>>>({});
  const [saving, setSaving] = useState<PromptKey | null>(null);
  const [savedAt, setSavedAt] = useState<Partial<Record<PromptKey, number>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((d: Snapshot) => {
        setSnap(d);
        // Initialize drafts with whatever's currently active (override or default)
        const init: Partial<Record<PromptKey, string>> = {};
        for (const k of d.keys) init[k] = d.overrides[k] ?? d.defaults[k];
        setDrafts(init);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function save(key: PromptKey) {
    if (!snap) return;
    const value = drafts[key]?.trim();
    if (!value) return;
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = (await res.json()) as { overrides?: Snapshot["overrides"]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.overrides) {
        setSnap({ ...snap, overrides: data.overrides });
      }
      setSavedAt((s) => ({ ...s, [key]: Date.now() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function reset(key: PromptKey) {
    if (!snap) return;
    if (!confirm("Reset this prompt to default? Your edits will be lost.")) return;
    setSaving(key);
    setError(null);
    try {
      const res = await fetch(`/api/prompts?key=${key}`, { method: "DELETE" });
      const data = (await res.json()) as { overrides?: Snapshot["overrides"]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.overrides) {
        setSnap({ ...snap, overrides: data.overrides });
      }
      setDrafts((d) => ({ ...d, [key]: snap.defaults[key] }));
      setSavedAt((s) => ({ ...s, [key]: Date.now() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (!snap) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Prompts</h1>
        {error ? <p className="text-red-600 text-sm">{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
        <p className="text-stone-600 text-sm">
          Every prompt the model sees, editable. Your override stays in effect
          for all future renders until you Reset. Placeholders in {"{curly braces}"}{" "}
          are filled in at render time, don't remove them.
        </p>
        <p className="text-stone-500 text-xs">
          <a href="/" className="text-violet-700 underline">
            Back to renderer
          </a>
        </p>
      </header>

      {error ? <p className="text-red-600 text-sm">{error}</p> : null}

      {snap.keys.map((key) => {
        const doc = snap.docs[key];
        const isOverridden = key in snap.overrides;
        const draft = drafts[key] ?? "";
        const isSaving = saving === key;
        const saved = savedAt[key];
        return (
          <section
            key={key}
            className="border border-stone-200 rounded-lg p-4 bg-white space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-medium text-stone-800">{doc.label}</h2>
                <p className="text-xs text-stone-500 mt-0.5">{doc.description}</p>
              </div>
              <div className="text-xs flex-shrink-0">
                {isOverridden ? (
                  <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-800">
                    edited
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                    default
                  </span>
                )}
              </div>
            </div>
            {doc.placeholders.length > 0 ? (
              <p className="text-xs text-stone-500">
                Placeholders:{" "}
                {doc.placeholders.map((p, i) => (
                  <span key={p}>
                    <code className="text-violet-700">{p}</code>
                    {i < doc.placeholders.length - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            ) : null}
            <textarea
              value={draft}
              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
              spellCheck={false}
              className="w-full min-h-[260px] border border-stone-300 rounded p-3 bg-white font-mono text-xs leading-snug"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => save(key)}
                disabled={isSaving || !draft.trim() || draft === (snap.overrides[key] ?? snap.defaults[key])}
                className="bg-violet-700 text-white text-sm rounded px-4 py-2 disabled:bg-stone-300"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => reset(key)}
                disabled={isSaving || !isOverridden}
                className="text-stone-700 text-sm border border-stone-300 rounded px-3 py-2 disabled:text-stone-400 disabled:border-stone-200"
              >
                Reset to default
              </button>
              {saved && Date.now() - saved < 4000 ? (
                <span className="text-violet-700 text-xs">Saved.</span>
              ) : null}
            </div>
          </section>
        );
      })}
    </main>
  );
}
