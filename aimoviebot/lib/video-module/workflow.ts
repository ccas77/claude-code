import { createHook, FatalError } from "workflow";
import type { Backend, Character, StageName } from "./types";

// Deterministic hook token for the shot list approval step. The
// /api/video/approve-shotlist route uses the same token to resume the run.
const SHOTLIST_HOOK = (jobId: string) => `approve-shotlist:${jobId}`;

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
): Promise<{ name: string; url: string; backend: Backend }> {
  "use step";
  const { stage1 } = await import("./stages");
  return fatal("Stage 1", () => stage1(jobId, character));
}

async function runStage2Step(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend }> {
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
  if (
    !job.artifacts.characterSheets ||
    job.artifacts.characterSheets.length === 0 ||
    !job.artifacts.locationSheetUrl
  ) {
    throw new Error("Stage 1/2 artifacts missing for Stage 3");
  }
  await fatal("Stage 3", () =>
    stage3(jobId, {
      sceneDescription: job.artifacts.sceneDescription!,
      dialogue: job.artifacts.dialogue!,
      characters: job.characters,
      characterSheets: job.artifacts.characterSheets!,
      locationSheetUrl: job.artifacts.locationSheetUrl!,
    }),
  );
}

async function runStage4Step(jobId: string) {
  "use step";
  const { setStatus, readJob } = await import("./storage");
  const { stage4 } = await import("./stages");
  await setStatus(jobId, "storyboard");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (
    !job.artifacts.shotList ||
    !job.artifacts.characterSheets ||
    job.artifacts.characterSheets.length === 0 ||
    !job.artifacts.locationSheetUrl
  ) {
    throw new Error("Stage 4 missing upstream artifacts");
  }
  await fatal("Stage 4", () =>
    stage4(jobId, {
      shots: job.artifacts.shotList!,
      characters: job.characters,
      characterSheets: job.artifacts.characterSheets!,
      locationSheetUrl: job.artifacts.locationSheetUrl!,
    }),
  );
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
// because each step's blob write is its own checkpoint.
const STAGE5_CLIP_COUNT = 4; // must match VIDEO_CHUNKS.count in config.ts

async function runStage5(jobId: string) {
  await setVideoStatusStep(jobId);
  const results = await Promise.all(
    Array.from({ length: STAGE5_CLIP_COUNT }, (_, i) =>
      runStage5OneClipStep(jobId, i),
    ),
  );
  const clipUrls = results.map((r) => r.url);
  const backend = results[0]?.backend ?? "higgsfield";
  await persistClipUrlsStep(jobId, clipUrls, backend);
}

async function runStage6Step(jobId: string) {
  "use step";
  const { setStatus, readJob } = await import("./storage");
  const { stage6 } = await import("./stages");
  await setStatus(jobId, "captioning");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (!job.artifacts.clipUrls || job.artifacts.clipUrls.length === 0) {
    throw new Error("Stage 6 missing clip URLs");
  }
  await fatal("Stage 6", () =>
    stage6(jobId, {
      clipUrls: job.artifacts.clipUrls!,
      dialogue: job.artifacts.dialogue ?? [],
    }),
  );
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

// Durable orchestrator. Started by /api/video/approve once the user locks in
// the edited sceneDescription + dialogue. Each stage persists its own state,
// so an interruption resumes from the last completed step.
//
// Stage 1 runs in parallel ACROSS characters AND in parallel WITH Stage 2.
// N characters = N independent image gens, all concurrent.
export async function approvedVideoWorkflow(
  jobId: string,
  characters: Character[],
  locationImageUrl: string,
) {
  "use workflow";

  try {
    await setSheetsStatusStep(jobId);
    const [characterResults, locationResult] = await Promise.all([
      Promise.all(
        characters.map((c) => runStage1ForCharacterStep(jobId, c)),
      ),
      runStage2Step(jobId, locationImageUrl),
    ]);
    await persistStage1And2Step(jobId, characterResults, locationResult);
    await runStage3Step(jobId);
    // Approval gate #2: pause for user to review + edit the 16-shot list
    // before paying for storyboard image + Seedance video. /api/video/
    // approve-shotlist resumes this hook after writing the edited shots
    // to artifacts.shotList.
    await setAwaitingShotlistStep(jobId);
    const hook = createHook<{ approved: true }>({
      token: SHOTLIST_HOOK(jobId),
    });
    await hook;
    await runStage4Step(jobId);
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

// Retry from a specific stage forward, reusing whatever is already persisted.
// Retrying from stage 1 re-runs every character sheet in parallel + the
// location sheet, then re-persists them in one job.json write.
export async function retryFromStage(jobId: string, fromStage: 1 | 2 | 3 | 4 | 5) {
  "use workflow";

  const job = await readJobStep(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  try {
    if (fromStage <= 1) {
      await setSheetsStatusStep(jobId);
      const [characterResults, locationResult] = await Promise.all([
        Promise.all(
          job.characters.map((c) => runStage1ForCharacterStep(jobId, c)),
        ),
        runStage2Step(jobId, job.locationImageUrl),
      ]);
      await persistStage1And2Step(jobId, characterResults, locationResult);
    } else if (fromStage <= 2) {
      const locationResult = await runStage2Step(jobId, job.locationImageUrl);
      await refreshLocationOnly(jobId, locationResult);
    }
    if (fromStage <= 3) {
      await runStage3Step(jobId);
      // Re-running stage 3 means the shot list changed; re-park for approval
      // before consuming the expensive downstream stages.
      await setAwaitingShotlistStep(jobId);
      const hook = createHook<{ approved: true }>({
        token: SHOTLIST_HOOK(jobId),
      });
      await hook;
    }
    if (fromStage <= 4) await runStage4Step(jobId);
    if (fromStage <= 5) await runStage5(jobId);
    await runStage6Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(jobId, inferStageFromError(message), message);
    throw err;
  }
}
