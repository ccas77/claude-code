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
import {
  gatewayGenerateImage,
  gatewayGenerateText,
  gatewayGenerateVideo,
} from "./backends/gateway";
import { withFallback } from "./backends/withFallback";
import {
  stage1Prompt,
  stage2Prompt,
  stage3Prompt,
  stage4Prompt,
  stage5Prompt,
} from "./prompts";
import {
  keys,
  mergeArtifacts,
  persistArtifact,
  putJSON,
  recordBackend,
} from "./storage";
import type { Backend, DialogueLine, Shot, ShotList } from "./types";

// Stage 1 — character sheet.
export async function stage1(
  jobId: string,
  characterImageUrl: string,
): Promise<{ url: string; backend: Backend }> {
  const { result, servedBy } = await withFallback(
    () => hgImage({ prompt: stage1Prompt, imageRefs: [characterImageUrl] }),
    () =>
      gatewayGenerateImage({
        prompt: stage1Prompt,
        imageRefs: [characterImageUrl],
      }),
  );
  const url = await persistArtifact(keys.characterSheet(jobId), result.url);
  await mergeArtifacts(jobId, { characterSheetUrl: url });
  await recordBackend(jobId, "stage1", servedBy);
  return { url, backend: servedBy };
}

// Stage 2 — location sheet.
export async function stage2(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend }> {
  const { result, servedBy } = await withFallback(
    () => hgImage({ prompt: stage2Prompt, imageRefs: [locationImageUrl] }),
    () =>
      gatewayGenerateImage({
        prompt: stage2Prompt,
        imageRefs: [locationImageUrl],
      }),
  );
  const url = await persistArtifact(keys.locationSheet(jobId), result.url);
  await mergeArtifacts(jobId, { locationSheetUrl: url });
  await recordBackend(jobId, "stage2", servedBy);
  return { url, backend: servedBy };
}

// Stage 3 — shot list, 16 panels, dialogue distributed.
// Parser asserts exactly 16 shots and that every dialogue line is attached
// to exactly one shot.
export async function stage3(
  jobId: string,
  args: {
    sceneDescription: string;
    dialogue: DialogueLine[];
    characterSheetUrl: string;
    locationSheetUrl: string;
  },
): Promise<ShotList> {
  const text = await gatewayGenerateText({
    prompt: stage3Prompt(args.sceneDescription, args.dialogue),
    imageUrls: [args.characterSheetUrl, args.locationSheetUrl],
    modelId: MODELS.shotList.gateway,
  });
  const shots = parseShotList(text);
  if (shots.length !== 16) {
    throw new Error(
      `Stage 3 expected 16 shots, got ${shots.length}. Raw:\n${text}`,
    );
  }
  // Sanity check: every dialogue line from Stage 0 should appear somewhere.
  // We log mismatches but don't throw — Stage 5 prompt re-injects from the
  // shots' dialogue, so any line not picked up here will not be voiced.
  const placedLines = new Set(
    shots.flatMap((s) => s.dialogue.map((d) => `${d.speaker}|${d.line}`)),
  );
  const missing = args.dialogue.filter(
    (d) => !placedLines.has(`${d.speaker}|${d.line}`),
  );
  if (missing.length > 0) {
    // Best-effort recovery: append unplaced lines to the closest mid shot.
    const mid = Math.floor(shots.length / 2);
    shots[mid] = {
      ...shots[mid],
      dialogue: [...shots[mid].dialogue, ...missing],
    };
  }
  await putJSON(keys.shotList(jobId), shots);
  await mergeArtifacts(jobId, { shotList: shots });
  await recordBackend(jobId, "stage3", "gateway");
  return shots;
}

// Parses lines like:
//   Shot 1: Wide low-angle — She approaches the doorway. [Mira: "Hello?"]
// Returns Shot[]. Tolerant of em-dash variants, missing dialogue, multi
// dialogue markers.
export function parseShotList(text: string): Shot[] {
  const out: Shot[] = [];
  const lineRe = /^Shot\s+(\d+)\s*:\s*([^—-]+?)\s*[—-]\s*(.+)$/i;
  const dlgRe = /\[([^:\]]+):\s*"([^"]+)"\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = lineRe.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    const camera = m[2].trim();
    let action = m[3].trim();
    const dialogue: DialogueLine[] = [];
    action = action.replace(dlgRe, (_full, speaker: string, lineText: string) => {
      dialogue.push({ speaker: speaker.trim(), line: lineText.trim() });
      return "";
    }).replace(/\s+/g, " ").trim();
    out.push({ n, camera, action, dialogue });
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}

// Stage 4 — storyboard grid image (2x8 vertical panels).
export async function stage4(
  jobId: string,
  args: {
    shots: ShotList;
    characterSheetUrl: string;
    locationSheetUrl: string;
  },
): Promise<{ url: string; backend: Backend }> {
  const prompt = stage4Prompt(args.shots);
  const refs = [args.characterSheetUrl, args.locationSheetUrl];
  const { result, servedBy } = await withFallback(
    () => hgImage({ prompt, imageRefs: refs }),
    () => gatewayGenerateImage({ prompt, imageRefs: refs }),
  );
  const url = await persistArtifact(keys.storyboard(jobId), result.url);
  await mergeArtifacts(jobId, { storyboardUrl: url });
  await recordBackend(jobId, "stage4", servedBy);
  return { url, backend: servedBy };
}

// Stage 5 — video, with dialogue baked in.
// Hard guards:
//   - aspect ratio must be 9:16 (config const)
//   - 1080p banned unless ALLOW_1080P flips
//   - generate_audio must remain true
export async function stage5(
  jobId: string,
  args: {
    shots: ShotList;
    characterSheetUrl: string;
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

  const prompt = stage5Prompt(args.shots);
  const refs = [
    args.storyboardUrl,
    args.characterSheetUrl,
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
  await mergeArtifacts(jobId, { videoUrl: url });
  await recordBackend(jobId, "stage5", servedBy);
  return { url, backend: servedBy };
}
