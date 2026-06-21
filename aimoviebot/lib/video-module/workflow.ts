import { createHook, FatalError } from "workflow";
import type { Backend, Character, StageName } from "./types";

// Deterministic hook tokens. /api/video/approve-shotlist and
// /api/video/approve-storyboards use the matching token to resume the
// workflow at Gate 2 and Gate 3 respectively.
const SHOTLIST_HOOK = (jobId: string) => `approve-shotlist:${jobId}`;
const STORYBOARD_HOOK = (jobId: string) => `approve-storyboards:${jobId}`;

// WORKFLOW SANDBOX RULE: the "use workflow" function runs in a VM sandbox
// without Node-only modules (no `require`, no fs, no @vercel/blob). Anything
// imported at the TOP of this file gets bundled into that sandbox and crashes
// the workflow on load if it transitively pulls in CJS. So:
//   - Top-level imports here are TYPES ONLY (plus FatalError from workflow,
//     which lives in the same package as the sandbox).
//   - Every "use step" function does its own dynamic `await import(...)` to
//     pull in the modules it actually needs. Steps run in full Node, so this
//     is fine.

// Wrap any step body so a thrown Error becomes FatalError. Vercel Workflow
// retries regular Errors up to 3 times by default; for image generation
// steps that means three new Higgsfield job submissions per failure, which
// drains paid credits when the underlying model is hung. FatalError stops
// the step at the first failure. The label is prepended to the message so
// inferStageFromError can route the failure to the correct stage's retry
// button in the UI.
async function fatal<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new FatalError(`${label}: ${msg}`);
  }
}

async function runStage1ForCharacterStep(
  jobId: string,
  character: Character,
): Promise<{ name: string; url: string; backend: Backend; reusedFromCache: boolean }> {
  "use step";
  const { stage1 } = await import("./stages");
  return fatal("Stage 1", () => stage1(jobId, character));
}

async function runStage2Step(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend; reusedFromCache: boolean }> {
  "use step";
  const { stage2 } = await import("./stages");
  return fatal("Stage 2", () => stage2(jobId, locationImageUrl));
}

async function persistStage1And2Step(
  jobId: string,
  characterSheets: { name: string; url: string; backend: Backend }[],
  locationSheet: { url: string; backend: Backend },
) {
  "use step";
  const { updateJob } = await import("./storage");
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: {
      ...j.artifacts,
      characterSheets: characterSheets.map((s) => ({
        name: s.name,
        url: s.url,
      })),
      locationSheetUrl: locationSheet.url,
    },
    servedBy: {
      ...(j.servedBy ?? {}),
      stage1: characterSheets[0]?.backend ?? j.servedBy?.stage1,
      stage2: locationSheet.backend,
    },
  }));
}

async function runStage3Step(jobId: string) {
  "use step";
  const { setStatus, readJob } = await import("./storage");
  const { stage3 } = await import("./stages");
  await setStatus(jobId, "shot_list");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (!job.artifacts.sceneDescription || !job.artifacts.dialogue) {
    throw new Error("Approved sceneDescription / dialogue missing");
  }
  // Stage 3 (shot list) is text-only and uses the user's original
  // uploads as visual refs. It does NOT depend on the AI-generated
  // character or location sheets, so it can run before any image-spend
  // stage — that's the whole point of moving it earlier in the pipeline.
  await fatal("Stage 3", () =>
    stage3(jobId, {
      sceneDescription: job.artifacts.sceneDescription!,
      dialogue: job.artifacts.dialogue!,
      characters: job.characters,
      locationImageUrl: job.locationImageUrl,
      chunkCount: job.chunkCount ?? 4,
    }),
  );
}

// Per-storyboard durable step. One workflow step per chunk so a crash on
// chunk N leaves chunks 1..N-1 saved. stage4OneStoryboard is idempotent.
async function runStage4OneStoryboardStep(
  jobId: string,
  chunkIndex: number,
): Promise<{ url: string; backend: Backend }> {
  "use step";
  const { stage4OneStoryboard } = await import("./stages");
  return fatal(`Stage 4 storyboard ${chunkIndex + 1}`, () =>
    stage4OneStoryboard(jobId, chunkIndex),
  );
}

async function persistStoryboardUrlsStep(
  jobId: string,
  storyboardUrls: string[],
) {
  "use step";
  const { updateJob } = await import("./storage");
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: { ...j.artifacts, storyboardUrls },
    servedBy: { ...(j.servedBy ?? {}), stage4: "higgsfield" },
  }));
}

async function setStoryboardStatusStep(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "storyboard");
}

// Returns the per-job chunk count. Uses the resolveJobChunkCount
// cascade so legacy jobs without an explicit chunkCount still pick the
// right value (storyboards array length → clips array length →
// duration-derived → default).
async function getChunkCountStep(jobId: string): Promise<number> {
  "use step";
  const { readJob } = await import("./storage");
  const { resolveJobChunkCount } = await import("./config");
  const job = await readJob(jobId);
  if (!job) return 4;
  return resolveJobChunkCount(job);
}

// Promise.all of N per-storyboard steps. Matches stage5's pattern: each
// step is its own checkpoint, so a sibling crash doesn't lose persisted
// storyboards. N is per-job from videoDurationSec / 4s.
async function runStage4(jobId: string) {
  await setStoryboardStatusStep(jobId);
  const count = await getChunkCountStep(jobId);
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      runStage4OneStoryboardStep(jobId, i),
    ),
  );
  const storyboardUrls = results.map((r) => r.url);
  await persistStoryboardUrlsStep(jobId, storyboardUrls);
}

// Per-clip durable step. One workflow step per chunk so a crash on
// clip N leaves clips 1..N-1 saved. stage5OneClip is idempotent — on
// retry it short-circuits if the persisted Blob already exists.
async function runStage5OneClipStep(
  jobId: string,
  chunkIndex: number,
): Promise<{ url: string; backend: Backend }> {
  "use step";
  const { stage5OneClip } = await import("./stages");
  return fatal(`Stage 5 clip ${chunkIndex + 1}`, () =>
    stage5OneClip(jobId, chunkIndex),
  );
}

// After all per-clip steps complete, record their URLs in job state in
// ONE write. (Per-clip steps don't write clipUrls themselves to avoid
// parallel read-modify-write races on the job blob.)
async function persistClipUrlsStep(
  jobId: string,
  clipUrls: string[],
  backend: Backend,
) {
  "use step";
  const { updateJob } = await import("./storage");
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: { ...j.artifacts, clipUrls },
    servedBy: { ...(j.servedBy ?? {}), stage5: backend },
  }));
}

async function setVideoStatusStep(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "video");
}

// Stage 5 helper used INSIDE the workflow sandbox. Pure orchestration —
// only calls "use step" functions. No Node-only code here, so it's safe
// to live in the workflow VM scope. Promise.all of N per-clip steps; on
// crash of any one, the others' results are still durably persisted
// because each step's blob write is its own checkpoint. N is per-job.
async function runStage5(jobId: string) {
  await setVideoStatusStep(jobId);
  const count = await getChunkCountStep(jobId);
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      runStage5OneClipStep(jobId, i),
    ),
  );
  const clipUrls = results.map((r) => r.url);
  const backend = results[0]?.backend ?? "higgsfield";
  await persistClipUrlsStep(jobId, clipUrls, backend);
}

async function runStage6Step(jobId: string) {
  "use step";
  const { setStatus, readJob, updateJob, clipUrlsFingerprint } = await import(
    "./storage"
  );
  const { stage6 } = await import("./stages");
  await setStatus(jobId, "captioning");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (!job.artifacts.clipUrls || job.artifacts.clipUrls.length === 0) {
    throw new Error("Stage 6 missing clip URLs");
  }
  const clipUrls = job.artifacts.clipUrls;
  await fatal("Stage 6", () =>
    stage6(jobId, {
      clipUrls,
      dialogue: job.artifacts.dialogue ?? [],
    }),
  );
  // Snapshot fingerprint so the status page knows the final video is
  // in sync with the current clips (Restitch button stays hidden).
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: {
      ...j.artifacts,
      lastStitchedClipFingerprint: clipUrlsFingerprint(clipUrls),
    },
  }));
}

async function setSheetsStatusStep(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "char_sheets");
}

async function setAwaitingShotlistStep(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "awaiting_shotlist_approval");
}

async function setAwaitingStoryboardStep(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "awaiting_storyboard_approval");
}

async function markFailed(jobId: string, stage: StageName, message: string) {
  "use step";
  const { updateJob } = await import("./storage");
  await updateJob(jobId, (j) => ({
    ...j,
    status: "failed",
    error: { stage, message },
  }));
}

async function markDone(jobId: string) {
  "use step";
  const { setStatus } = await import("./storage");
  await setStatus(jobId, "done");
}

async function readJobStep(jobId: string) {
  "use step";
  const { readJob } = await import("./storage");
  return readJob(jobId);
}

async function refreshLocationOnly(
  jobId: string,
  locationSheet: { url: string; backend: Backend },
) {
  "use step";
  const { updateJob } = await import("./storage");
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: { ...j.artifacts, locationSheetUrl: locationSheet.url },
    servedBy: {
      ...(j.servedBy ?? {}),
      stage2: locationSheet.backend,
    },
  }));
}

// Sheets stage: characters in parallel WITH location. Both stage1 and
// stage2 are idempotent + cache-aware (reuse library/sheets/* when a
// cached entry exists for the source URL). After all complete, one
// updateJob writes the sheets to artifacts.
async function runSheetsStage(jobId: string, characters: Character[], locationImageUrl: string) {
  await setSheetsStatusStep(jobId);
  const [characterResults, locationResult] = await Promise.all([
    Promise.all(
      characters.map((c) => runStage1ForCharacterStep(jobId, c)),
    ),
    runStage2Step(jobId, locationImageUrl),
  ]);
  await persistStage1And2Step(jobId, characterResults, locationResult);
}

// Durable orchestrator. Pipeline order (after item-5 reorder):
//   1. Concept + dialogue ........ already done before this workflow starts
//   2. Gate 1 .................... already done before this workflow starts
//   3. Shot list (cheap, text) ... runStage3Step
//   4. Gate 2 (shot list) ........ createHook + await
//   5. Character + location sheets (parallel, cache-aware) ... runSheetsStage
//   6. Storyboards (4 parallel) .. runStage4
//   7. Video clips (4 parallel) .. runStage5
//   8. Stitch + captions ......... runStage6Step
// Nothing image-expensive fires until AFTER Gate 2.
export async function approvedVideoWorkflow(
  jobId: string,
  characters: Character[],
  locationImageUrl: string,
) {
  "use workflow";

  try {
    // (3) Shot list — cheap text, fires immediately so the user can
    // review what's actually going to be drawn before any image cost.
    await runStage3Step(jobId);
    // (4) Gate 2 — the user edits + approves the 16 shots. /api/video/
    // approve-shotlist resumes this hook after writing the edited shots
    // to artifacts.shotList.
    await setAwaitingShotlistStep(jobId);
    const hook = createHook<{ approved: true }>({
      token: SHOTLIST_HOOK(jobId),
    });
    await hook;
    // (5) Sheets — character sheets in parallel with location sheet.
    // Cache-aware: reuses library/sheets/* when source URL matches.
    await runSheetsStage(jobId, characters, locationImageUrl);
    // (6) Storyboards (4 parallel, each idempotent).
    await runStage4(jobId);
    // (Gate 3) — the user reviews the 4 storyboards before paying for
    // 4 Seedance video clips. Per-storyboard regenerate is available
    // on /review-storyboards. /api/video/approve-storyboards resumes
    // this hook once the user is satisfied.
    await setAwaitingStoryboardStep(jobId);
    const sbHook = createHook<{ approved: true }>({
      token: STORYBOARD_HOOK(jobId),
    });
    await sbHook;
    // (7-8) Clips → stitch + captions.
    await runStage5(jobId);
    await runStage6Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(jobId, inferStageFromError(message), message);
    throw err;
  }
}

function inferStageFromError(message: string): StageName {
  // Check stage labels FIRST (most reliable; fatal() prefixes every error
  // with "Stage N:"). Fall back to keyword sniffing.
  if (/\bStage 6\b/.test(message)) return "stage6";
  if (/\bStage 5\b/.test(message)) return "stage5";
  if (/\bStage 4\b/.test(message)) return "stage4";
  if (/\bStage 3\b/.test(message)) return "stage3";
  if (/\bStage 2\b/.test(message)) return "stage2";
  if (/\bStage 1\b/.test(message)) return "stage1";
  if (/caption|ffmpeg|concat|whisper/i.test(message)) return "stage6";
  if (/video/i.test(message)) return "stage5";
  if (/storyboard/i.test(message)) return "stage4";
  if (/shot/i.test(message)) return "stage3";
  if (/location/i.test(message)) return "stage2";
  if (/character/i.test(message)) return "stage1";
  return "stage1";
}

// Retry from a specific stage forward, reusing whatever is already
// persisted. fromStage semantics map to CODE stage names (not the user-
// facing pipeline number), so they're stable across pipeline reorders:
//   1 = character sheets (+ location)        → redo sheets, then 4-6
//   2 = location sheet only                  → redo location, then 4-6
//   3 = shot list                            → redo shot list + Gate 2 + sheets + 4-6
//   4 = storyboards                          → redo storyboards + clips + stitch
//   5 = video clips                          → redo clips + stitch
//
// Reorder note: fromStage=3 re-parks at Gate 2 so the user can re-edit
// the regenerated shots before any image-spend resumes.
export async function retryFromStage(jobId: string, fromStage: 1 | 2 | 3 | 4 | 5) {
  "use workflow";

  const job = await readJobStep(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  try {
    // Helper — re-parks at Gate 3 storyboard approval after re-running
    // stage 4. Used by every fromStage path that ends up regenerating
    // storyboards: the user must re-approve before clips fire.
    const runStoryboardsThenGate = async () => {
      await runStage4(jobId);
      await setAwaitingStoryboardStep(jobId);
      const sbHook = createHook<{ approved: true }>({
        token: STORYBOARD_HOOK(jobId),
      });
      await sbHook;
    };

    if (fromStage === 3) {
      await runStage3Step(jobId);
      await setAwaitingShotlistStep(jobId);
      const hook = createHook<{ approved: true }>({
        token: SHOTLIST_HOOK(jobId),
      });
      await hook;
      await runSheetsStage(jobId, job.characters, job.locationImageUrl);
      await runStoryboardsThenGate();
      await runStage5(jobId);
    } else if (fromStage <= 2) {
      if (fromStage <= 1) {
        await runSheetsStage(jobId, job.characters, job.locationImageUrl);
      } else {
        const locationResult = await runStage2Step(jobId, job.locationImageUrl);
        await refreshLocationOnly(jobId, locationResult);
      }
      await runStoryboardsThenGate();
      await runStage5(jobId);
    } else if (fromStage === 4) {
      await runStoryboardsThenGate();
      await runStage5(jobId);
    } else {
      // fromStage === 5 — clips only; storyboards already approved on
      // their previous pass.
      await runStage5(jobId);
    }
    await runStage6Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(jobId, inferStageFromError(message), message);
    throw err;
  }
}
