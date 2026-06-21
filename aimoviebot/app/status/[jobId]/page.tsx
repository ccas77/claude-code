"use client";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DialogueLine = { speaker: string; line: string };
type CharacterSheet = { name: string; url: string };
type Shot = {
  n: number;
  camera: string;
  action: string;
  performance: string;
  dialogue: DialogueLine[];
};

// Match the backend chunkShots algorithm (lib/video-module/stages.ts).
// First (length % n) chunks get one extra element. Used to map chunkIndex
// → which shots from job.artifacts.shotList feed that storyboard.
function chunksOf<T>(arr: T[], n: number): T[][] {
  if (n <= 1) return [arr];
  if (arr.length < n) return [arr];
  const base = Math.floor(arr.length / n);
  const remainder = arr.length % n;
  const out: T[][] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < remainder ? 1 : 0);
    out.push(arr.slice(cursor, cursor + size));
    cursor += size;
  }
  return out;
}

type InflightHiggsfieldJob = {
  hfJobId: string;
  stage: string;
  label: string;
  submittedAt: string;
};

type StatusResponse = {
  jobId: string;
  status: string;
  characters?: { name: string; imageUrl: string }[];
  clipsAreStale?: boolean;
  artifacts: {
    sceneDescription?: string;
    dialogue?: DialogueLine[];
    characterSheets?: CharacterSheet[];
    locationSheetUrl?: string;
    shotList?: Shot[];
    storyboardUrls?: string[];
    chunkDurations?: number[];
    clipUrls?: string[];
    videoUrl?: string;
    inflightHiggsfieldJobs?: InflightHiggsfieldJob[];
    staleClipIndexes?: number[];
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
  awaiting_shotlist_approval: "Awaiting shot list approval",
  storyboard: "Storyboards",
  awaiting_storyboard_approval: "Awaiting storyboard approval",
  video: "Rendering clips",
  captioning: "Stitching + captions",
  done: "Done",
  failed: "Failed",
};

const STAGE_FROM: Record<string, 1 | 2 | 3 | 4 | 5> = {
  stage1: 1,
  stage2: 2,
  stage3: 3,
  stage4: 4,
  stage5: 5,
  stage6: 5, // stage6 failure retries from clip render forward
};

export default function StatusPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [clipUrlsRaw, setClipUrlsRaw] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [repairing, setRepairing] = useState(false);
  // Per-asset regenerate. Single string marker tracks WHICH asset is
  // currently in flight (e.g. "storyboard:2" or "clip:0") so other
  // tiles' buttons stay enabled.
  // Set of in-flight regen markers (e.g. "storyboard:1", "clip:0"). We
  // allow multiple in parallel, so a single string isn't enough.
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  // Bumped on every reload so <img src> includes a fresh ?v= query
  // string. Storyboards/clips are stored at content-addressed URLs now,
  // so this is belt-and-braces — harmless.
  const [assetVersion, setAssetVersion] = useState(0);
  // Storyboard tiles the user has ticked for the next batch regen.
  const [selectedTiles, setSelectedTiles] = useState<Set<number>>(new Set());
  // Storyboard tile whose inline shot editor is expanded.
  const [expandedTile, setExpandedTile] = useState<number | null>(null);
  // Local draft of edited shots before "Save shot edits" is clicked.
  // Keyed by shot index (matching shotList ordering).
  const [draftShots, setDraftShots] = useState<Record<number, Shot> | null>(null);
  // Per-chunk duration draft for the currently-expanded tile. Index =
  // chunkIndex. Saved alongside shot edits.
  const [draftDuration, setDraftDuration] = useState<number | null>(null);
  const [savingShots, setSavingShots] = useState(false);
  const [restitching, setRestitching] = useState(false);

  // Force a fresh job-state fetch. Used after server-side mutations
  // (regenerate, repair, etc.) because the passive polling stops once
  // status is done/failed, so the UI wouldn't otherwise pick up the
  // new state.
  async function reloadJob() {
    try {
      const res = await fetch(`/api/video?jobId=${jobId}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as StatusResponse & { error?: string };
      if (!res.ok)
        throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setAssetVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Elapsed-seconds ticker for the currently-regenerating asset, so the
  // button shows progress instead of a static "Regen…" that looks hung.
  const [regenElapsed, setRegenElapsed] = useState(0);
  useEffect(() => {
    if (!regenerating) {
      setRegenElapsed(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setRegenElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [regenerating]);

  async function regenerateAsset(
    kind: "storyboard" | "clip",
    chunkIndex: number,
  ) {
    const marker = `${kind}:${chunkIndex}`;
    if (regenerating.has(marker)) return;
    setRegenerating((s) => new Set(s).add(marker));
    setError(null);
    try {
      const res = await fetch("/api/video/regenerate-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, kind, chunkIndex }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating((s) => {
        const next = new Set(s);
        next.delete(marker);
        return next;
      });
    }
  }

  // Fire regen for every ticked storyboard tile in parallel.
  async function regenerateSelected() {
    const indexes = Array.from(selectedTiles);
    if (indexes.length === 0) return;
    setSelectedTiles(new Set());
    await Promise.all(indexes.map((i) => regenerateAsset("storyboard", i)));
  }

  // Persist edits to the canonical shotList. Used by the inline tile
  // editor. Edits are permanent (same shotList stage 5 and the next
  // regen read from).
  async function saveShotEdits() {
    if (!draftShots || !data?.artifacts.shotList) return;
    setSavingShots(true);
    setError(null);
    try {
      const merged: Shot[] = data.artifacts.shotList.map((s, i) => {
        if (!draftShots[i]) return s;
        const draft = draftShots[i];
        // Strip blank dialogue rows the user left in the editor — the
        // /api/video/shots schema requires speaker + line both non-empty.
        return {
          ...s,
          ...draft,
          dialogue: draft.dialogue
            .map((d) => ({ speaker: d.speaker.trim(), line: d.line.trim() }))
            .filter((d) => d.speaker && d.line),
        };
      });
      // Merge in the duration change for the expanded chunk (if any).
      const body: {
        jobId: string;
        shots: Shot[];
        chunkDurations?: number[];
      } = { jobId, shots: merged };
      if (
        expandedTile !== null &&
        draftDuration !== null &&
        data?.artifacts.storyboardUrls
      ) {
        const cc = data.artifacts.storyboardUrls.length;
        const next = Array.from(
          { length: cc },
          (_, k) => data.artifacts.chunkDurations?.[k] ?? 4,
        );
        next[expandedTile] = draftDuration;
        body.chunkDurations = next;
      }
      const res = await fetch("/api/video/shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDraftShots(null);
      setDraftDuration(null);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingShots(false);
    }
  }

  async function restitchFinal() {
    if (restitching) return;
    setRestitching(true);
    setError(null);
    try {
      const res = await fetch("/api/video/restitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestitching(false);
    }
  }

  async function repairFromBlob() {
    setRepairing(true);
    setError(null);
    try {
      const res = await fetch("/api/video/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepairing(false);
    }
  }

  // Auto-redirect to the shot-list review page the moment status hits
  // awaiting_shotlist_approval. Without this, the status page just shows
  // a stale "16-shot list" label with nothing actionable on it — there's
  // literally no work for the user to do here at that stage, they need
  // to be on /review-shots editing.
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
        if (json.status === "awaiting_shotlist_approval") {
          router.push(`/review-shots/${jobId}`);
          return;
        }
        if (json.status === "awaiting_storyboard_approval") {
          router.push(`/review-storyboards/${jobId}`);
          return;
        }
        if (json.status !== "done" && json.status !== "failed") {
          timer = setTimeout(tick, 4000);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };

    // Re-poll the moment the tab becomes visible again. Backgrounded
    // tabs throttle setTimeout to ~1s minimum, but some browsers pause
    // network too — visibility-change is the reliable wakeup signal so
    // the page can't get stuck on a stale snapshot.
    const onVisible = () => {
      if (!document.hidden && !cancelled) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [jobId, router]);

  async function retry(fromStage: 1 | 2 | 3 | 4 | 5, imageModel?: string) {
    setRetrying(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { jobId, fromStage };
      if (imageModel) body.imageModel = imageModel;
      const res = await fetch("/api/video/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  }

  // Recover-from-Higgsfield. Takes the hfJobIds from inflightHiggsfieldJobs
  // (stage 5 only, sorted by submittedAt so chunk order is preserved),
  // POSTs to /api/video/recover-clips which pulls the existing video URLs
  // from Higgsfield via job_status, persists each to Blob, then stitches
  // + captions. No new Seedance submissions.
  async function recoverFromHiggsfield(stage5Inflight: InflightHiggsfieldJob[]) {
    if (stage5Inflight.length === 0) return;
    setRecovering(true);
    setError(null);
    try {
      const sorted = [...stage5Inflight].sort(
        (a, b) =>
          new Date(a.submittedAt).getTime() -
          new Date(b.submittedAt).getTime(),
      );
      const hfJobIds = sorted.map((j) => j.hfJobId);
      const res = await fetch("/api/video/recover-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, hfJobIds }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecovering(false);
    }
  }

  // Finalize-from-existing-clips. Used when the workflow failed AFTER
  // Seedance produced clips. The user pastes the 4 cloudfront URLs (or any
  // playable mp4 URLs) and the backend persists them to Blob, then runs
  // stage 6 (concat + Whisper + caption burn). No Higgsfield calls.
  async function finalizeFromClips() {
    const urls = clipUrlsRaw
      .split(/\s+/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setError("Paste at least one clip URL, one per line.");
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/video/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, clipUrls: urls }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      await reloadJob();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const a = data.artifacts;
  const failedStage =
    data.status === "failed" && data.error?.stage
      ? STAGE_FROM[data.error.stage] ?? 1
      : null;

  return (
    <main className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {STAGE_LABELS[data.status] ?? data.status}
        </h1>
        <p className="text-stone-600 mt-1 text-sm">Job {jobId}</p>
        {data.error ? (
          <div className="mt-3 space-y-2">
            <p className="text-red-600 text-sm">
              Failed at {data.error.stage}: {data.error.message}
            </p>
            <div className="flex gap-2 flex-wrap items-center">
              {failedStage ? (
                <button
                  onClick={() => retry(failedStage)}
                  disabled={retrying}
                  className="bg-violet-700 text-white text-sm rounded px-3 py-1.5 disabled:bg-stone-300"
                >
                  {retrying ? "Restarting…" : `Retry from ${data.error.stage}`}
                </button>
              ) : null}
              <button
                onClick={repairFromBlob}
                disabled={repairing}
                className="text-violet-700 text-sm border border-violet-300 rounded px-3 py-1.5 disabled:text-stone-400 disabled:border-stone-200"
                title="Reconciles job state with what actually exists in Blob storage. Useful when a workflow crash claimed 'missing upstream artifacts' that are actually persisted at their deterministic keys. No Higgsfield calls."
              >
                {repairing ? "Repairing…" : "Repair from Blob"}
              </button>
              <button
                onClick={() => retry(1)}
                disabled={retrying}
                className="text-violet-700 text-sm border border-violet-300 rounded px-3 py-1.5 disabled:text-stone-400 disabled:border-stone-200"
              >
                Retry from stage 1
              </button>
              {failedStage && failedStage <= 4 ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-stone-600 hover:text-violet-700">
                    Retry with a different image model
                  </summary>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <button
                      onClick={() => retry(failedStage, "nano_banana_pro")}
                      disabled={retrying}
                      className="text-violet-700 text-sm border border-violet-300 rounded px-3 py-1.5 disabled:text-stone-400 disabled:border-stone-200"
                    >
                      Retry with nano_banana_pro
                    </button>
                    <button
                      onClick={() => retry(failedStage, "gpt_image_2")}
                      disabled={retrying}
                      className="text-violet-700 text-sm border border-violet-300 rounded px-3 py-1.5 disabled:text-stone-400 disabled:border-stone-200"
                    >
                      Retry with gpt_image_2
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    gpt_image_2 preserves identity better but rejects more
                    portraits on content moderation. nano_banana_pro is more
                    permissive but follows the reference image looser.
                  </p>
                </details>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {data.status === "awaiting_shotlist_approval" ? (
        <section className="border border-violet-300 bg-violet-50 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-medium text-violet-900">
            Shot list ready for review
          </h2>
          <p className="text-violet-800 text-sm">
            The 16-shot list draft is waiting on your edits before the
            storyboard image and the final video render. Open the editor:
          </p>
          <a
            href={`/review-shots/${jobId}`}
            className="inline-block bg-violet-700 text-white text-sm rounded px-4 py-2"
          >
            Review shots
          </a>
        </section>
      ) : null}

      {a.inflightHiggsfieldJobs && a.inflightHiggsfieldJobs.length > 0 ? (
        <section className="space-y-2 border border-violet-200 bg-violet-50 rounded-lg p-4">
          <h2 className="text-sm font-medium text-violet-900">
            Higgsfield jobs in flight ({a.inflightHiggsfieldJobs.length})
          </h2>
          <p className="text-xs text-violet-800">
            These jobs are currently submitted to Higgsfield. If a job
            stalls (e.g. queued waiting for IP approval), look it up in
            your Higgsfield dashboard by ID, approve there, and the next
            poll will pick it up automatically.
          </p>
          <ul className="space-y-1 text-sm text-stone-800">
            {a.inflightHiggsfieldJobs.map((j) => (
              <li key={j.hfJobId} className="flex gap-2 items-baseline">
                <span className="text-stone-500 text-xs font-mono">{j.stage}</span>
                <span className="font-medium">{j.label}</span>
                <code className="text-violet-700 text-xs">{j.hfJobId}</code>
                <span className="text-stone-400 text-xs ml-auto">
                  {new Date(j.submittedAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
          {(() => {
            const stage5Inflight = (a.inflightHiggsfieldJobs ?? []).filter(
              (j) => j.stage === "stage5",
            );
            if (stage5Inflight.length === 0) return null;
            return (
              <button
                onClick={() => recoverFromHiggsfield(stage5Inflight)}
                disabled={recovering}
                className="mt-2 bg-violet-700 text-white text-sm rounded px-3 py-1.5 disabled:bg-stone-300"
              >
                {recovering
                  ? "Recovering…"
                  : `Recover ${stage5Inflight.length} clip${stage5Inflight.length === 1 ? "" : "s"} from Higgsfield + stitch`}
              </button>
            );
          })()}
        </section>
      ) : null}

      {/* Finalize-from-clips: paste 4 cloudfront URLs to stitch + caption
          a render whose clips already exist in Higgsfield but never made it
          through stage 6. No Seedance calls. */}
      <section className="space-y-2 border border-stone-200 bg-white rounded-lg p-4">
        <h2 className="text-sm font-medium text-stone-700">
          Stitch from existing clips
        </h2>
        <p className="text-xs text-stone-600">
          If you already have rendered video clips (e.g. from your Higgsfield
          dashboard), paste their URLs one per line, in playback order. The
          backend will copy each one into Blob, concatenate them, transcribe
          for caption timing, burn captions, and save the final video. No new
          Seedance / Higgsfield credits used.
        </p>
        <textarea
          value={clipUrlsRaw}
          onChange={(e) => setClipUrlsRaw(e.target.value)}
          placeholder="https://...mp4&#10;https://...mp4&#10;https://...mp4&#10;https://...mp4"
          rows={4}
          className="w-full border border-stone-300 rounded p-2 text-xs font-mono"
        />
        <button
          onClick={finalizeFromClips}
          disabled={finalizing}
          className="bg-violet-700 text-white text-sm rounded px-3 py-1.5 disabled:bg-stone-300"
        >
          {finalizing ? "Stitching…" : "Stitch + caption"}
        </button>
      </section>

      {/* Persisted raw clips, if stage 5 wrote them. Lets the user inspect
          each chunk independently. */}
      {a.clipUrls && a.clipUrls.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">
            Raw clips ({a.clipUrls.length})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {a.clipUrls.map((u, i) => {
              const marker = `clip:${i}`;
              const busy = regenerating.has(marker);
              return (
                <div
                  key={u}
                  className="border border-stone-200 rounded-lg p-2 bg-white"
                >
                  <div className="text-xs text-stone-600 mb-1">
                    Clip {i + 1}/{a.clipUrls!.length}
                  </div>
                  <video
                    key={`${u}-${assetVersion}`}
                    controls
                    src={`${u}?v=${assetVersion}`}
                    className="w-full aspect-[9/16] bg-black rounded"
                  />
                  <div className="flex justify-between items-center mt-1">
                    <a
                      href={u}
                      download
                      className="text-violet-700 underline text-xs"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => regenerateAsset("clip", i)}
                      disabled={busy}
                      className="text-xs text-red-700 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 disabled:text-stone-300 disabled:border-stone-200"
                      title="Send this clip back to Seedance. Does NOT auto-restitch — use the Restitch button when you're happy with all the new clips."
                    >
                      {busy
                        ? `Regen ${regenElapsed}s…`
                        : "Regenerate"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Source character + location uploads, always visible regardless of
          stage. Helps the user audit what the renderer was given. */}
      {data.characters && data.characters.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">
            Source cast + location
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.characters.map((c) => (
              <ArtifactTile
                key={`src-${c.name}`}
                label={`${c.name} (source)`}
                url={c.imageUrl}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Raw job JSON view, collapsed by default. Always there so nothing
          about the run is hidden. */}
      <section>
        <details className="border border-stone-200 rounded-lg bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs text-stone-600 hover:text-violet-700">
            Raw job JSON
          </summary>
          <pre className="px-3 pb-3 text-[10px] text-stone-700 overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </section>

      {a.videoUrl ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Final video</h2>
          <video
            key={`${a.videoUrl}-${assetVersion}`}
            controls
            src={`${a.videoUrl}?v=${assetVersion}`}
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
        {(!a.storyboardUrls || a.storyboardUrls.length === 0) &&
        data.status !== "done" &&
        data.status !== "failed" ? (
          <ArtifactTile label="Storyboards" url={undefined} />
        ) : null}
      </section>

      {/* Storyboards section — tick the ones you want regenerated, edit
          underlying shot text inline before regen, send any new one to
          Seedance per-tile, restitch final video manually when ready. */}
      {a.storyboardUrls && a.storyboardUrls.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-medium text-stone-700">
              Storyboards ({a.storyboardUrls.length})
            </h2>
            <div className="flex gap-2 flex-wrap">
              {selectedTiles.size > 0 ? (
                <button
                  onClick={regenerateSelected}
                  disabled={regenerating.size > 0}
                  className="text-xs bg-violet-700 text-white rounded px-3 py-1.5 disabled:bg-stone-300"
                  title="Regenerate every ticked storyboard in parallel. One Higgsfield image call per tile. The matching clips stay as-is until you click Send to Seedance per tile."
                >
                  Regenerate {selectedTiles.size} selected
                </button>
              ) : null}
              {data.clipsAreStale ? (
                <button
                  onClick={restitchFinal}
                  disabled={restitching}
                  className="text-xs bg-emerald-700 text-white rounded px-3 py-1.5 disabled:bg-stone-300"
                  title="ffmpeg-concat the current clips and re-burn captions. No Higgsfield / Seedance spend."
                >
                  {restitching ? "Restitching…" : "Restitch final video"}
                </button>
              ) : null}
            </div>
          </div>
          {(() => {
            const cc = a.storyboardUrls.length;
            const shotChunks = chunksOf<Shot>(
              (a.shotList ?? []) as Shot[],
              cc,
            );
            // Map chunk index → absolute shot indexes in shotList.
            const shotIndexesByChunk: number[][] = [];
            let cursor = 0;
            for (let i = 0; i < cc; i++) {
              const size = shotChunks[i]?.length ?? 0;
              shotIndexesByChunk.push(
                Array.from({ length: size }, (_, k) => cursor + k),
              );
              cursor += size;
            }
            return (
              <div className="grid grid-cols-2 gap-3">
                {a.storyboardUrls!.map((url, i) => {
                  const regenMarker = `storyboard:${i}`;
                  const regenBusy = regenerating.has(regenMarker);
                  const sendMarker = `clip:${i}`;
                  const sendBusy = regenerating.has(sendMarker);
                  const isStale = (a.staleClipIndexes ?? []).includes(i);
                  const selected = selectedTiles.has(i);
                  const expanded = expandedTile === i;
                  const shotIdxs = shotIndexesByChunk[i] ?? [];
                  return (
                    <div
                      key={`sb-${i}`}
                      // Expanded editor breaks out of the 2-col grid so
                      // the shot fields aren't squeezed into half a page
                      // at 10px font.
                      className={`border rounded-lg p-3 bg-white space-y-2 ${
                        expanded ? "col-span-2" : ""
                      } ${isStale ? "border-amber-400" : "border-stone-200"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-1 text-xs text-stone-700">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              setSelectedTiles((s) => {
                                const next = new Set(s);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              });
                            }}
                          />
                          Storyboard {i + 1}
                        </label>
                        {isStale ? (
                          <span className="text-[10px] text-amber-700 font-medium">
                            clip stale
                          </span>
                        ) : null}
                      </div>
                      <img
                        src={`${url}?v=${assetVersion}`}
                        alt=""
                        className="w-full aspect-[9/16] object-cover rounded"
                      />
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => regenerateAsset("storyboard", i)}
                          disabled={regenBusy}
                          className="flex-1 text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:text-stone-300 disabled:border-stone-200"
                          title="Regenerate just this one. One Higgsfield call."
                        >
                          {regenBusy
                            ? `Regen ${regenElapsed}s…`
                            : "Regenerate"}
                        </button>
                        <button
                          onClick={() => {
                            if (expanded) {
                              setExpandedTile(null);
                              setDraftShots(null);
                              setDraftDuration(null);
                            } else {
                              setExpandedTile(i);
                              // Seed shot drafts for ONLY this chunk.
                              const seed: Record<number, Shot> = {};
                              for (const idx of shotIdxs) {
                                const s = (a.shotList ?? [])[idx];
                                if (s) seed[idx] = { ...s };
                              }
                              setDraftShots(seed);
                              setDraftDuration(
                                a.chunkDurations?.[i] ?? 4,
                              );
                            }
                          }}
                          className="flex-1 text-violet-700 border border-violet-200 rounded px-2 py-1 hover:bg-violet-50"
                          title="Edit the underlying shot prompts (and clip duration) before regenerating. Persists permanently."
                        >
                          {expanded ? "Close editor" : "Edit shots"}
                        </button>
                      </div>
                      {isStale ? (
                        <button
                          onClick={() => regenerateAsset("clip", i)}
                          disabled={sendBusy}
                          className="w-full text-xs text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-1 disabled:bg-stone-300"
                          title="Render one fresh Seedance clip from this storyboard at the chunk's chosen duration. Does NOT auto-restitch — use the Restitch button when you're done iterating."
                        >
                          {sendBusy
                            ? `Sending ${regenElapsed}s…`
                            : `Send to Seedance (${
                                a.chunkDurations?.[i] ?? 4
                              }s clip)`}
                        </button>
                      ) : null}
                      {expanded && draftShots ? (
                        <div className="border-t border-stone-200 pt-4 space-y-5 text-sm">
                          <label className="block space-y-1">
                            <span className="text-xs uppercase tracking-wide text-stone-500">
                              Clip duration
                            </span>
                            <div className="flex gap-1">
                              {[4, 8, 12, 15].map((d) => {
                                const active = draftDuration === d;
                                return (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDraftDuration(d)}
                                    className={`text-sm px-3 py-1.5 rounded border ${
                                      active
                                        ? "bg-violet-700 text-white border-violet-700"
                                        : "bg-white text-stone-700 border-stone-300 hover:border-violet-400"
                                    }`}
                                  >
                                    {d}s
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-xs text-stone-500">
                              Each clip is one Seedance call. Longer clips
                              cost more (≈ proportional). Use 8s+ when a
                              shot has more dialogue than fits in 4s.
                            </p>
                          </label>
                          {shotIdxs.map((idx) => {
                            const draft = draftShots[idx];
                            if (!draft) return null;
                            const patch = (p: Partial<Shot>) =>
                              setDraftShots((d) => ({
                                ...(d ?? {}),
                                [idx]: { ...draft, ...p },
                              }));
                            return (
                              <div
                                key={`shot-${idx}`}
                                className="space-y-3 pb-3 border-b border-stone-100 last:border-b-0"
                              >
                                <div className="font-semibold text-stone-800">
                                  Shot {draft.n}
                                </div>
                                <label className="block space-y-1">
                                  <span className="text-xs uppercase tracking-wide text-stone-500">
                                    Camera
                                  </span>
                                  <textarea
                                    value={draft.camera}
                                    onChange={(e) =>
                                      patch({ camera: e.target.value })
                                    }
                                    rows={3}
                                    className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="text-xs uppercase tracking-wide text-stone-500">
                                    Action
                                  </span>
                                  <textarea
                                    value={draft.action}
                                    onChange={(e) =>
                                      patch({ action: e.target.value })
                                    }
                                    rows={4}
                                    className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="text-xs uppercase tracking-wide text-stone-500">
                                    Performance
                                  </span>
                                  <textarea
                                    value={draft.performance}
                                    onChange={(e) =>
                                      patch({ performance: e.target.value })
                                    }
                                    rows={4}
                                    className="w-full border border-stone-300 rounded p-2 bg-white text-sm"
                                  />
                                </label>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs uppercase tracking-wide text-stone-500">
                                      Dialogue ({draft.dialogue.length})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        patch({
                                          dialogue: [
                                            ...draft.dialogue,
                                            { speaker: "", line: "" },
                                          ],
                                        })
                                      }
                                      className="text-violet-700 text-xs"
                                    >
                                      + add line
                                    </button>
                                  </div>
                                  {draft.dialogue.length === 0 ? (
                                    <p className="text-stone-400 italic text-xs">
                                      No dialogue on this shot.
                                    </p>
                                  ) : null}
                                  {draft.dialogue.map((d, lineIdx) => (
                                    <div
                                      key={lineIdx}
                                      className="flex gap-2 items-start"
                                    >
                                      <input
                                        value={d.speaker}
                                        onChange={(e) => {
                                          const next = [...draft.dialogue];
                                          next[lineIdx] = {
                                            ...next[lineIdx],
                                            speaker: e.target.value,
                                          };
                                          patch({ dialogue: next });
                                        }}
                                        placeholder="Speaker"
                                        className="w-32 border border-stone-300 rounded p-2 bg-white text-sm"
                                      />
                                      <textarea
                                        value={d.line}
                                        onChange={(e) => {
                                          const next = [...draft.dialogue];
                                          next[lineIdx] = {
                                            ...next[lineIdx],
                                            line: e.target.value,
                                          };
                                          patch({ dialogue: next });
                                        }}
                                        placeholder="What they say out loud"
                                        rows={2}
                                        className="flex-1 border border-stone-300 rounded p-2 bg-white text-sm"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const next = draft.dialogue.filter(
                                            (_, k) => k !== lineIdx,
                                          );
                                          patch({ dialogue: next });
                                        }}
                                        className="text-stone-500 hover:text-red-600 px-2 py-2"
                                        aria-label="Remove line"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          <button
                            onClick={saveShotEdits}
                            disabled={savingShots}
                            className="w-full text-sm bg-violet-700 text-white rounded px-3 py-2 disabled:bg-stone-300"
                          >
                            {savingShots ? "Saving…" : "Save shot edits"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      ) : null}

      {a.shotList ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-stone-700">Shot list</h2>
          <ol className="space-y-3 text-sm text-stone-800">
            {a.shotList.map((s) => (
              <li key={s.n} className="border-l-2 border-stone-200 pl-3">
                <div>
                  <span className="font-medium">Shot {s.n}:</span>{" "}
                  <span className="text-stone-600">{s.camera}</span> | {s.action}
                </div>
                {(s as { performance?: string }).performance ? (
                  <div className="text-xs text-stone-500 mt-0.5">
                    <span className="font-medium">Performance:</span>{" "}
                    {(s as { performance: string }).performance}
                  </div>
                ) : null}
                {s.dialogue.length > 0 ? (
                  <div className="mt-1 text-violet-700">
                    {s.dialogue
                      .map((d) => `[${d.speaker}: "${d.line}"]`)
                      .join(" ")}
                  </div>
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
