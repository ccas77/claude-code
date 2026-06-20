import { stage1, stage2, stage3, stage4, stage5 } from "./stages";
import {
  mergeArtifacts,
  readJob,
  setStatus,
  updateJob,
} from "./storage";
import type { StageName } from "./types";

// Each stage is a "use step" function: it runs in a full Node.js context
// (Blob, fetch, AI SDK all work), it's independently retryable, and the
// workflow runtime persists the result so a replay doesn't redo the work.

async function runStage1Step(jobId: string, characterImageUrl: string) {
  "use step";
  await setStatus(jobId, "char_sheet");
  await stage1(jobId, characterImageUrl);
}

async function runStage2Step(jobId: string, locationImageUrl: string) {
  "use step";
  await setStatus(jobId, "loc_sheet");
  await stage2(jobId, locationImageUrl);
}

async function runStage3Step(jobId: string) {
  "use step";
  await setStatus(jobId, "shot_list");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (!job.artifacts.sceneDescription || !job.artifacts.dialogue)
    throw new Error("Approved sceneDescription / dialogue missing");
  if (!job.artifacts.characterSheetUrl || !job.artifacts.locationSheetUrl)
    throw new Error("Stage 1/2 artifacts missing for Stage 3");
  await stage3(jobId, {
    sceneDescription: job.artifacts.sceneDescription,
    dialogue: job.artifacts.dialogue,
    characterSheetUrl: job.artifacts.characterSheetUrl,
    locationSheetUrl: job.artifacts.locationSheetUrl,
  });
}

async function runStage4Step(jobId: string) {
  "use step";
  await setStatus(jobId, "storyboard");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (
    !job.artifacts.shotList ||
    !job.artifacts.characterSheetUrl ||
    !job.artifacts.locationSheetUrl
  ) {
    throw new Error("Stage 4 missing upstream artifacts");
  }
  await stage4(jobId, {
    shots: job.artifacts.shotList,
    characterSheetUrl: job.artifacts.characterSheetUrl,
    locationSheetUrl: job.artifacts.locationSheetUrl,
  });
}

async function runStage5Step(jobId: string) {
  "use step";
  await setStatus(jobId, "video");
  const job = await readJob(jobId);
  if (!job) throw new Error(`Job ${jobId} disappeared`);
  if (
    !job.artifacts.shotList ||
    !job.artifacts.characterSheetUrl ||
    !job.artifacts.locationSheetUrl ||
    !job.artifacts.storyboardUrl
  ) {
    throw new Error("Stage 5 missing upstream artifacts");
  }
  await stage5(jobId, {
    shots: job.artifacts.shotList,
    characterSheetUrl: job.artifacts.characterSheetUrl,
    locationSheetUrl: job.artifacts.locationSheetUrl,
    storyboardUrl: job.artifacts.storyboardUrl,
    durationSec: job.videoDurationSec,
  });
}

async function markFailed(jobId: string, stage: StageName, message: string) {
  "use step";
  await updateJob(jobId, (j) => ({
    ...j,
    status: "failed",
    error: { stage, message },
  }));
}

async function markDone(jobId: string) {
  "use step";
  await setStatus(jobId, "done");
}

// Durable orchestrator. Started by /api/video/approve once the user locks in
// the edited sceneDescription + dialogue. Each stage persists its own state,
// so an interruption resumes from the last completed step.
export async function approvedVideoWorkflow(
  jobId: string,
  characterImageUrl: string,
  locationImageUrl: string,
) {
  "use workflow";

  try {
    // Stages 1 + 2 are independent; run in parallel for latency.
    await Promise.all([
      runStage1Step(jobId, characterImageUrl),
      runStage2Step(jobId, locationImageUrl),
    ]);
    await runStage3Step(jobId);
    await runStage4Step(jobId);
    await runStage5Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stage = inferStageFromError(message);
    await markFailed(jobId, stage, message);
    throw err;
  }
}

function inferStageFromError(message: string): StageName {
  if (/stage 5|video/i.test(message)) return "stage5";
  if (/stage 4|storyboard/i.test(message)) return "stage4";
  if (/stage 3|shot/i.test(message)) return "stage3";
  if (/location/i.test(message)) return "stage2";
  if (/character/i.test(message)) return "stage1";
  return "stage1";
}

// Retry from a specific stage forward, reusing whatever is already persisted.
export async function retryFromStage(jobId: string, fromStage: 1 | 2 | 3 | 4 | 5) {
  "use workflow";

  const job = await readJobStep(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  try {
    if (fromStage <= 1) await runStage1Step(jobId, job.characterImageUrl);
    if (fromStage <= 2) await runStage2Step(jobId, job.locationImageUrl);
    if (fromStage <= 3) await runStage3Step(jobId);
    if (fromStage <= 4) await runStage4Step(jobId);
    if (fromStage <= 5) await runStage5Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(jobId, inferStageFromError(message), message);
    throw err;
  }
}

async function readJobStep(jobId: string) {
  "use step";
  return readJob(jobId);
}
