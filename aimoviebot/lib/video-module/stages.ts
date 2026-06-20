import {
  ALLOW_1080P,
  ASPECT_RATIO,
  GENERATE_AUDIO,
  MODELS,
  VIDEO_CHUNKS,
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
  const modelOverride = await loadImageModelOverride(jobId);
  const refs = [
    args.locationSheetUrl,
    ...args.characterSheets.map((s) => s.url),
  ];
  // Split the 16-shot list into N chunks. Each chunk gets its OWN
  // mini-storyboard image (typically 4 panels) so gpt_image_2 isn't
  // trying to draw 16 panels in one go (which it does poorly).
  const chunks = chunkShots(args.shots, VIDEO_CHUNKS.count);
  const total = chunks.length;
  const results = await Promise.all(
    chunks.map(async (chunkShots, i) => {
      const prompt = await renderStage4({
        shots: chunkShots,
        characters: args.characters,
      });
      const r = await hgImage({
        prompt,
        imageRefs: refs,
        modelOverride,
        onSubmit: (hfJobId) =>
          trackInflightHiggsfieldJob(jobId, {
            hfJobId,
            stage: "stage4",
            label: `Storyboard ${i + 1}/${total}`,
            submittedAt: new Date().toISOString(),
          }),
      });
      const url = await persistArtifact(
        keys.storyboardChunk(jobId, i + 1),
        r.url,
      );
      return { url, hfJobId: r.hfJobId };
    }),
  );
  const storyboardUrls = results.map((r) => r.url);
  const burnedHfJobIds = results
    .map((r) => r.hfJobId)
    .filter((x): x is string => Boolean(x));
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        storyboardUrls,
        inflightHiggsfieldJobs: existing.filter(
          (e) => !burnedHfJobIds.includes(e.hfJobId),
        ),
      },
      servedBy: { ...(j.servedBy ?? {}), stage4: "higgsfield" },
    };
  });
  return { url: storyboardUrls[0], backend: "higgsfield" };
}

// Helper for chunked render: splits a flat shot list into N approximately
// equal chunks. With the default 16 shots and 4 chunks, that's 4 shots
// per chunk.
function chunkShots(shots: ShotList, n: number): ShotList[] {
  if (n <= 1) return [shots];
  const out: ShotList[] = [];
  const perChunk = Math.ceil(shots.length / n);
  for (let i = 0; i < shots.length; i += perChunk) {
    out.push(shots.slice(i, i + perChunk));
  }
  return out;
}

// Stage 5: multi-clip video render. Splits the 16 shots into N chunks,
// renders each as its OWN short Seedance call (against its own
// mini-storyboard from stage 4) in parallel, then persists the raw clip
// URLs. Stage 6 concatenates and burns captions.
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
    storyboardUrls: string[];
    resolution?: "480p" | "720p" | "1080p";
    mode?: "std" | "fast";
  },
): Promise<{ clipUrls: string[]; backend: Backend }> {
  const resolution = args.resolution ?? VIDEO_DEFAULTS.resolution;
  const mode = args.mode ?? VIDEO_DEFAULTS.mode;
  const secondsPerChunk = VIDEO_CHUNKS.secondsPerChunk;

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
  if (secondsPerChunk < 4 || secondsPerChunk > 15) {
    throw new Error(
      `Stage 5 refused: secondsPerChunk ${secondsPerChunk}s outside Seedance's 4-15s range.`,
    );
  }

  const chunks = chunkShots(args.shots, VIDEO_CHUNKS.count);
  if (chunks.length !== args.storyboardUrls.length) {
    throw new Error(
      `Stage 5 refused: ${chunks.length} shot chunks but ${args.storyboardUrls.length} storyboards. They must match.`,
    );
  }
  const total = chunks.length;

  // Each chunk gets: its own mini-storyboard (primary visual reference),
  // all character sheets (identity), the location sheet (environment).
  const sharedRefs = [
    ...args.characterSheets.map((s) => s.url),
    args.locationSheetUrl,
  ];

  const clipResults = await Promise.all(
    chunks.map(async (chunkShotList, i) => {
      const chunkPrompt = await renderStage5({
        shots: chunkShotList,
        characters: args.characters,
      });
      const refs = [args.storyboardUrls[i], ...sharedRefs];
      const { result, servedBy } = await withFallback(
        () =>
          hgVideo({
            prompt: chunkPrompt,
            imageRefs: refs,
            resolution,
            mode,
            duration: secondsPerChunk,
            startImageUrl: args.storyboardUrls[i],
            onSubmit: (hfJobId) =>
              trackInflightHiggsfieldJob(jobId, {
                hfJobId,
                stage: "stage5",
                label: `Video clip ${i + 1}/${total}`,
                submittedAt: new Date().toISOString(),
              }),
          }),
        () =>
          gatewayGenerateVideo({
            prompt: chunkPrompt,
            imageRefs: refs,
            resolution,
            mode,
            duration: secondsPerChunk,
            startImageUrl: args.storyboardUrls[i],
          }),
      );
      // Persist the raw clip to its own deterministic Blob key so we can
      // re-run stage 6 (concat + captions) without re-firing Seedance.
      const persistedUrl = await persistArtifact(
        keys.videoClip(jobId, i + 1),
        result.url,
        "video/mp4",
      );
      return { url: persistedUrl, servedBy, hfJobId: result.hfJobId };
    }),
  );

  const clipUrls = clipResults.map((r) => r.url);
  const overallServedBy = clipResults[0]?.servedBy ?? "higgsfield";
  const burnedHfJobIds = clipResults
    .map((r) => r.hfJobId)
    .filter((x): x is string => Boolean(x));
  await updateJob(jobId, (j) => {
    const existing = j.artifacts.inflightHiggsfieldJobs ?? [];
    return {
      ...j,
      artifacts: {
        ...j.artifacts,
        clipUrls,
        inflightHiggsfieldJobs: existing.filter(
          (e) => !burnedHfJobIds.includes(e.hfJobId),
        ),
      },
      servedBy: { ...(j.servedBy ?? {}), stage5: overallServedBy },
    };
  });
  return { clipUrls, backend: overallServedBy };
}

// Stage 6: ffmpeg concat + caption burn-in. Cheap local ops (no Seedance,
// no Higgsfield). Reads the clip URLs from job state, concatenates with
// -c copy, transcribes the result via Whisper for caption timing, burns
// the captions on, and persists the final mp4.
export async function stage6(
  jobId: string,
  args: { clipUrls: string[]; dialogue: DialogueLine[] },
): Promise<{ url: string }> {
  const { concatVideos, burnCaptionsOnto } = await import("./ffmpeg");
  const { whisperCaptionCues } = await import("./captions");
  // 1. Concat all the raw clips into one mp4 (in /tmp; no re-encode).
  const concatBuf = await concatVideos(args.clipUrls);
  // 2. Whisper-transcribe the audio for timing; falls back to estimated
  //    cue distribution if no OPENAI_API_KEY is set.
  const totalSeconds = VIDEO_CHUNKS.count * VIDEO_CHUNKS.secondsPerChunk;
  const cues = await whisperCaptionCues(
    concatBuf,
    args.dialogue,
    totalSeconds,
  );
  // 3. Burn the cues onto the video as ASS subtitles. Re-encodes the
  //    video stream (subtitles filter requires it) but copies the audio.
  const captionedBuf = await burnCaptionsOnto(concatBuf, cues);
  // 4. Persist as the final video.
  const { put } = await import("@vercel/blob");
  const finalBlob = new Blob([Uint8Array.from(captionedBuf)], {
    type: "video/mp4",
  });
  const upload = await put(keys.video(jobId), finalBlob, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "video/mp4",
  });
  await updateJob(jobId, (j) => ({
    ...j,
    artifacts: { ...j.artifacts, videoUrl: upload.url },
    servedBy: { ...(j.servedBy ?? {}), stage6: "gateway" },
  }));
  return { url: upload.url };
}

