"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Snapshot = {
  status: string;
  artifacts: {
    storyboardUrls?: string[];
    shotList?: {
      n: number;
      camera: string;
      action: string;
      performance?: string;
    }[];
  };
};

export default function ReviewStoryboardsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/video?jobId=${jobId}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as Snapshot & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSnap(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
  }, [jobId]);

  async function regenerate(chunkIndex: number) {
    if (
      !confirm(
        `Regenerate storyboard ${chunkIndex + 1}? One Higgsfield image call. Other storyboards stay as they are.`,
      )
    )
      return;
    setRegenerating(chunkIndex);
    setError(null);
    try {
      const res = await fetch("/api/video/regenerate-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, kind: "storyboard", chunkIndex }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(null);
    }
  }

  async function approve() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/video/approve-storyboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
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
  if (!snap) return <p>Loading…</p>;

  if (snap.status !== "awaiting_storyboard_approval") {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Storyboards</h1>
        <p className="text-stone-600 text-sm">
          This job is in status <code>{snap.status}</code>, not awaiting
          storyboard approval. Either clips already started or storyboards
          haven&apos;t been generated yet. View the{" "}
          <a className="text-violet-700 underline" href={`/status/${jobId}`}>
            status page
          </a>
          .
        </p>
      </main>
    );
  }

  const urls = snap.artifacts.storyboardUrls ?? [];
  const shotList = snap.artifacts.shotList ?? [];
  // Group the shot list into chunks parallel to the storyboards so each
  // tile can show "this storyboard depicts shots N..M" — useful for
  // judging whether a storyboard's panels match what the shot list said.
  const perChunk = Math.ceil(shotList.length / Math.max(1, urls.length));

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Review storyboards
        </h1>
        <p className="text-stone-600 text-sm">
          Last cheap stop. Each storyboard becomes one 4-second Seedance
          clip. If any looks off (wrong style, identity drift, cartoony),
          regenerate just that one before approving. Once you approve,
          clips fire — that&apos;s the expensive step.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {urls.map((url, i) => {
          const shotsInChunk = shotList.slice(
            i * perChunk,
            (i + 1) * perChunk,
          );
          const busy = regenerating === i;
          return (
            <div
              key={url}
              className="border border-stone-200 rounded-lg overflow-hidden bg-white"
            >
              <div className="p-2 text-xs text-stone-600 flex justify-between">
                <span>
                  Storyboard {i + 1}/{urls.length}
                </span>
                <span className="text-stone-400">
                  shots{" "}
                  {shotsInChunk.length > 0
                    ? `${shotsInChunk[0].n}-${shotsInChunk[shotsInChunk.length - 1].n}`
                    : "?"}
                </span>
              </div>
              <img
                src={url}
                alt={`Storyboard ${i + 1}`}
                className="w-full object-contain bg-stone-50"
              />
              {shotsInChunk.length > 0 ? (
                <ul className="px-3 py-2 text-[11px] text-stone-600 space-y-1 border-t border-stone-100">
                  {shotsInChunk.map((s) => (
                    <li key={s.n}>
                      <span className="font-medium">Shot {s.n}:</span>{" "}
                      <span className="text-stone-500">{s.camera}</span> |{" "}
                      {s.action}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="p-2 border-t border-stone-100">
                <button
                  onClick={() => regenerate(i)}
                  disabled={regenerating !== null || submitting}
                  className="w-full text-xs text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:text-stone-300 disabled:border-stone-200"
                >
                  {busy ? "Regenerating…" : "Regenerate this storyboard"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={approve}
        disabled={submitting || regenerating !== null || urls.length === 0}
        className="w-full bg-violet-700 text-white rounded-lg py-3 font-medium disabled:bg-stone-300"
      >
        {submitting
          ? "Starting clip render…"
          : "Approve storyboards & render clips"}
      </button>
    </main>
  );
}
