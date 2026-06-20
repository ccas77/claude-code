import {
  ALLOW_1080P,
  ASPECT_RATIO,
  GENERATE_AUDIO,
  MODELS,
  VIDEO_DEFAULTS,
} from "./config";
import {
  generateImage as hgImage,
  generateVideo as hgVideo,
} from "./backends/higgsfield";
import { gatewayGenerateVideo } from "./backends/gateway";
import { withFallback } from "./backends/withFallback";
import {
  renderStage1,
  renderStage2,
  renderStage3,
  renderStage4,
  renderStage5,
} from "./prompts";
import {
  clearInflightHiggsfieldJob,
  keys,
  mergeArtifacts,
  persistArtifact,
  readJob,
  recordBackend,
  trackInflightHiggsfieldJob,
  updateJob,
  writeShotList,
} from "./storage";
import type {
  Backend,
  Character,
  CharacterSheet,
  DialogueLine,
  Shot,
  ShotList,
} from "./types";

// Stage 1: one character sheet per character. Generates via Higgsfield
// gpt-image-2 (model configurable in MODELS.image.higgsfield). Persists to
// a deterministic Blob key but defers the job.json write to the orchestrator
// so concurrent character calls can't race on the characterSheets array.
async function loadImageModelOverride(jobId: string): Promise<string | undefined> {
  const job = await readJob(jobId);
  return job?.imageModelOverride;
}

export async function stage1(
  jobId: string,
  character: Character,
): Promise<{ name: string; url: string; backend: Backend }> {
  const prompt = await renderStage1(character.name);
  const modelOverride = await loadImageModelOverride(jobId);
  const result = await hgImage({
    prompt,
    imageRefs: [character.imageUrl],
    modelOverride,
    onSubmit: (hfJobId) =>
      trackInflightHiggsfieldJob(jobId, {
        hfJobId,
        stage: "stage1",
        label: `Character: ${character.name}`,
        submittedAt: new Date().toISOString(),
      }),
  });
  const url = await persistArtifact(
    keys.characterSheet(jobId, character.name),
    result.url,
  );
  if (result.hfJobId) await clearInflightHiggsfieldJob(jobId, result.hfJobId);
  return { name: character.name, url, backend: "higgsfield" };
}

// Stage 2: location sheet. Same shape as stage1: generate + persist to Blob,
// but defer the job.json write to the orchestrator.
export async function stage2(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend }> {
  const prompt = await renderStage2();
  const modelOverride = await loadImageModelOverride(jobId);
  const result = await hgImage({
    prompt,
    imageRefs: [locationImageUrl],
    modelOverride,
    onSubmit: (hfJobId) =>
      trackInflightHiggsfieldJob(jobId, {
        hfJobId,
        stage: "stage2",
        label: "Location",
        submittedAt: new Date().toISOString(),
      }),
  });
  const url = await persistArtifact(keys.locationSheet(jobId), result.url);
  if (result.hfJobId) await clearInflightHiggsfieldJob(jobId, result.hfJobId);
  return { url, backend: "higgsfield" };
}

// Stage 3: shot list, 16 panels, dialogue distributed.

// Strip em dashes from any model output before it reaches storage or the
// next stage's prompt. Em dashes break the speech pipeline (Seedance
// stumbles on them) and the user has banned them.
export const stripEmDashes = (s: string): string =>
  s
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
export async function stage3(
  jobId: string,
  args: {
    sceneDescription: string;
    dialogue: DialogueLine[];
    characters: Character[];
    characterSheets: CharacterSheet[];
    locationSheetUrl: string;
  },
): Promise<ShotList> {
  const prompt = await renderStage3({
    sceneDescription: args.sceneDescription,
    dialogue: args.dialogue,
    characters: args.characters,
  });
  const { gatewayGenerateJSON } = await import("./backends/gateway");
  const raw = await gatewayGenerateJSON<unknown>({
    prompt,
    imageUrls: [
      ...args.characterSheets.map((s) => s.url),
      args.locationSheetUrl,
    ],
    modelId: MODELS.shotList.gateway,
  });
  const shots = validateShotList(raw, args.dialogue);
  await writeShotList(jobId, shots);
  await mergeArtifacts(jobId, { shotList: shots });
  await recordBackend(jobId, "stage3", "gateway");
  return shots;
}

// Validates the JSON the model returned and patches in any missing dialogue
// lines (best-effort recovery — Stage 5 voices from the shot list, so a
// dropped line is a silent line). Every captured string runs through
// stripEmDashes so the speech pipeline downstream stays clean.
export function validateShotList(
  raw: unknown,
  expectedDialogue: DialogueLine[],
): Shot[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      `Stage 3: expected JSON array of shots, got ${typeof raw}`,
    );
  }
  if (raw.length !== 16) {
    throw new Error(`Stage 3: expected 16 shots, got ${raw.length}`);
  }
  const shots: Shot[] = raw.map((r, i) => {
    const obj = r as Record<string, unknown>;
    const n = typeof obj.n === "number" ? obj.n : i + 1;
    const camera = stripEmDashes(String(obj.camera ?? ""));
    const action = stripEmDashes(String(obj.action ?? ""));
    const performance = stripEmDashes(String(obj.performance ?? ""));
    const dialogueIn = Array.isArray(obj.dialogue) ? obj.dialogue : [];
    const dialogue: DialogueLine[] = dialogueIn
      .map((d) => {
        const o = d as Record<string, unknown>;
        return {
          speaker: String(o.speaker ?? "").trim(),
          line: stripEmDashes(String(o.line ?? "")),
        };
      })
      .filter((d) => d.speaker && d.line);
    return { n, camera, action, performance, dialogue };
  });
  shots.sort((a, b) => a.n - b.n);
  // Recovery: any approved dialogue line that didn't make it into a shot
  // gets appended to the middle shot so it still gets voiced.
  const placed = new Set(
    shots.flatMap((s) => s.dialogue.map((d) => `${d.speaker}|${d.line}`)),
  );
  const missing = expectedDialogue.filter(
    (d) => !placed.has(`${d.speaker}|${d.line}`),
  );
  if (missing.length > 0) {
    const mid = Math.floor(shots.length / 2);
    shots[mid] = {
      ...shots[mid],
      dialogue: [...shots[mid].dialogue, ...missing],
    };
  }
  return shots;
}

// Stage 4: storyboard grid image (2x8 vertical panels). Reference ORDER
// matters: location FIRST so the model anchors the literal setting before
// the characters are placed inside it. Then character sheets in cast order.
export async function stage4(
  jobId: string,
  args: {
    shots: ShotList;
    characters: Character[];
    characterSheets: CharacterSheet[];
    locationSheetUrl: string;
  },
): Promise<{ url: string; backend: Backend }> {
  const prompt = await renderStage4({
    shots: args.shots,
    characters: args.characters,
  });
  const refs = [
    args.locationSheetUrl,
    ...args.characterSheets.map((s) => s.url),
  ];
  const modelOverride = await loadImageModelOverride(jobId);
  const result = await hgImage({
    prompt,
    imageRefs: refs,
    modelOverride,
    onSubmit: (hfJobId) =>
      trackInflightHiggsfieldJob(jobId, {
        hfJobId,
        stage: "stage4",
        label: "Storyboard",
        submittedAt: new Date().toISOString(),
      }),
  });
  const url = await persistArtifact(keys.storyboard(jobId), result.url);
  // ONE updateJob call: persist storyboardUrl + clear inflight + record
  // backend together. Three separate read-modify-writes would race on
  // Blob's sub-second uploadedAt resolution and could lose state.
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        storyboardUrl: url,
        inflightHiggsfieldJobs: result.hfJobId
          ? existing.filter((e) => e.hfJobId !== result.hfJobId)
          : existing,
      },
      servedBy: { ...(j.servedBy ?? {}), stage4: "higgsfield" },
    };
  });
  return { url, backend: "higgsfield" };
}

// Stage 5: video, with dialogue baked in.
// Hard guards:
//   - aspect ratio must be 9:16 (config const)
//   - 1080p banned unless ALLOW_1080P flips
//   - generate_audio must remain true
export async function stage5(
  jobId: string,
  args: {
    shots: ShotList;
    characters: Character[];
    characterSheets: CharacterSheet[];
    locationSheetUrl: string;
    storyboardUrl: string;
    durationSec?: number;
    resolution?: "480p" | "720p" | "1080p";
    mode?: "std" | "fast";
  },
): Promise<{ url: string; backend: Backend }> {
  const resolution = args.resolution ?? VIDEO_DEFAULTS.resolution;
  const mode = args.mode ?? VIDEO_DEFAULTS.mode;
  const duration = args.durationSec ?? VIDEO_DEFAULTS.duration;

  if (resolution === "1080p" && !ALLOW_1080P) {
    throw new Error(
      "Stage 5 refused 1080p: ALLOW_1080P=false in config (cost guard).",
    );
  }
  if (!GENERATE_AUDIO) {
    throw new Error(
      "Stage 5 refused: GENERATE_AUDIO must remain true. Seedance bakes the spoken dialogue from the prompt.",
    );
  }
  if (ASPECT_RATIO !== "9:16") {
    throw new Error(
      "Stage 5 refused: ASPECT_RATIO drifted from 9:16. Aborting render.",
    );
  }
  if (duration < 4 || duration > 15) {
    throw new Error(
      `Stage 5 refused: duration ${duration}s outside Seedance's 4-15s range.`,
    );
  }

  const prompt = await renderStage5({
    shots: args.shots,
    characters: args.characters,
  });
  // Storyboard first (primary source of truth per the spec), then every
  // character sheet, then location. Seedance reads medias in order.
  const refs = [
    args.storyboardUrl,
    ...args.characterSheets.map((s) => s.url),
    args.locationSheetUrl,
  ];

  const { result, servedBy } = await withFallback(
    () =>
      hgVideo({
        prompt,
        imageRefs: refs,
        resolution,
        mode,
        duration,
        startImageUrl: args.storyboardUrl,
        onSubmit: (hfJobId) =>
          trackInflightHiggsfieldJob(jobId, {
            hfJobId,
            stage: "stage5",
            label: "Video",
            submittedAt: new Date().toISOString(),
          }),
      }),
    () =>
      gatewayGenerateVideo({
        prompt,
        imageRefs: refs,
        resolution,
        mode,
        duration,
        startImageUrl: args.storyboardUrl,
      }),
  );
  const url = await persistArtifact(keys.video(jobId), result.url, "video/mp4");
  // ONE updateJob: persist videoUrl + clear inflight + record backend
  // together. Sequential read-modify-writes on Blob race within a second.
  const hfJobId =
    "hfJobId" in result && result.hfJobId ? result.hfJobId : undefined;
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        videoUrl: url,
        inflightHiggsfieldJobs: hfJobId
          ? existing.filter((e) => e.hfJobId !== hfJobId)
          : existing,
      },
      servedBy: { ...(j.servedBy ?? {}), stage5: servedBy },
    };
  });
  return { url, backend: servedBy };
}
