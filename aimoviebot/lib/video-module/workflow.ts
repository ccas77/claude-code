import { stage1, stage2, stage3, stage4, stage5 } from "./stages";
import { readJob, setStatus, updateJob } from "./storage";
import type { Backend, Character, StageName } from "./types";

// Each stage is a "use step" function: it runs in a full Node.js context
// (Blob, fetch, AI SDK all work), it's independently retryable, and the
// workflow runtime persists the result so a replay doesn't redo the work.

// Stage 1+2 generation steps. Each writes its own artifact to a deterministic
// Blob key but DOES NOT touch job.json. The orchestrator collects the
// returned descriptors after Promise.all and merges them in one updateJob
// call, so concurrent parallel steps never race on the same job.json key.

async function runStage1ForCharacterStep(
  jobId: string,
  character: Character,
): Promise<{ name: string; url: string; backend: Backend }> {
  "use step";
  return stage1(jobId, character);
}

async function runStage2Step(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend }> {
  "use step";
  return stage2(jobId, locationImageUrl);
}

async function persistStage1And2Step(
  jobId: string,
  characterSheets: { name: string; url: string; backend: Backend }[],
  locationSheet: { url: string; backend: Backend },
) {
  "use step";
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
  await stage3(jobId, {
    sceneDescription: job.artifacts.sceneDescription,
    dialogue: job.artifacts.dialogue,
    characters: job.characters,
    characterSheets: job.artifacts.characterSheets,
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
    !job.artifacts.characterSheets ||
    job.artifacts.characterSheets.length === 0 ||
    !job.artifacts.locationSheetUrl
  ) {
    throw new Error("Stage 4 missing upstream artifacts");
  }
  await stage4(jobId, {
    shots: job.artifacts.shotList,
    characters: job.characters,
    characterSheets: job.artifacts.characterSheets,
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
    !job.artifacts.characterSheets ||
    job.artifacts.characterSheets.length === 0 ||
    !job.artifacts.locationSheetUrl ||
    !job.artifacts.storyboardUrl
  ) {
    throw new Error("Stage 5 missing upstream artifacts");
  }
  await stage5(jobId, {
    shots: job.artifacts.shotList,
    characters: job.characters,
    characterSheets: job.artifacts.characterSheets,
    locationSheetUrl: job.artifacts.locationSheetUrl,
    storyboardUrl: job.artifacts.storyboardUrl,
    durationSec: job.videoDurationSec,
  });
}

async function setSheetsStatusStep(jobId: string) {
  "use step";
  await setStatus(jobId, "char_sheets");
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

async function readJobStep(jobId: string) {
  "use step";
  return readJob(jobId);
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
    await runStage4Step(jobId);
    await runStage5Step(jobId);
    await markDone(jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(jobId, inferStageFromError(message), message);
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
      // keep existing character sheets; only refresh location
      await updateJob(jobId, (j) => ({
        ...j,
        artifacts: { ...j.artifacts, locationSheetUrl: locationResult.url },
        servedBy: {
          ...(j.servedBy ?? {}),
          stage2: locationResult.backend,
        },
      }));
    }
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
