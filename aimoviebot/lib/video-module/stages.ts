import {
  ALLOW_1080P,
  ASPECT_RATIO,
  GENERATE_AUDIO,
  MODELS,
  VIDEO_CHUNKS,
  VIDEO_DEFAULTS,
  chunkCountForDuration,
  resolveJobChunkCount,
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
  keys,
  mergeArtifacts,
  persistArtifact,
  readJob,
  recordBackend,
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

// head() the given blob key; returns the public URL on hit, null on miss.
// Used by Stage 4 / Stage 5 / repair to reconstruct artifact arrays from
// deterministic Blob keys when the job state snapshot is stale.
async function tryHead(blobKey: string): Promise<string | null> {
  try {
    const { head } = await import("@vercel/blob");
    const meta = await head(blobKey);
    return meta.url;
  } catch {
    return null;
  }
}

// Reconstructs the characterSheets array. Two fallback layers:
//   1. Per-job blob (jobs/{jobId}/stage1-character-{slug}.png) — only
//      exists if the sheet was freshly generated for this job.
//   2. Library sheet cache (library/sheets/character/{hash}.json) —
//      always exists if a previous render generated a sheet for this
//      character's source upload URL. Critical when the character was
//      a cache hit (no per-job blob was ever written).
export async function rebuildCharacterSheetsFromBlob(
  jobId: string,
  characters: Character[],
): Promise<CharacterSheet[]> {
  const { readSheetCache } = await import("./sheet-cache");
  const checked = await Promise.all(
    characters.map(async (c) => {
      const perJob = await tryHead(keys.characterSheet(jobId, c.name));
      if (perJob) return { name: c.name, url: perJob };
      const cached = await readSheetCache("character", c.imageUrl);
      if (cached) return { name: c.name, url: cached.sheetUrl };
      return null;
    }),
  );
  return checked.filter((x): x is CharacterSheet => Boolean(x));
}

// Reconstructs locationSheetUrl with the same per-job → library-cache
// fallback chain as character sheets. Returns null if neither has it.
export async function rebuildLocationSheetUrlFromBlob(
  jobId: string,
  sourceLocationImageUrl: string,
): Promise<string | null> {
  const perJob = await tryHead(keys.locationSheet(jobId));
  if (perJob) return perJob;
  const { readSheetCache } = await import("./sheet-cache");
  const cached = await readSheetCache("location", sourceLocationImageUrl);
  return cached?.sheetUrl ?? null;
}

// Reconstructs the storyboardUrls array by checking each deterministic
// stage4-storyboard-{i}.png blob. If any chunk is missing, that index
// is dropped — Stage 5's chunkShots match check catches the size diff.
export async function rebuildStoryboardUrlsFromBlob(
  jobId: string,
  expectedChunkCount: number,
): Promise<string[]> {
  const checked = await Promise.all(
    Array.from({ length: expectedChunkCount }, (_, i) =>
      tryHead(keys.storyboardChunk(jobId, i + 1)),
    ),
  );
  return checked.filter((u): u is string => Boolean(u));
}

// Inspect a chunk's shots and return the set of character names that
// actually appear (in dialogue speakers OR action/performance text).
// Used by stage5 to send Higgsfield ONLY the relevant character sheets
// for a chunk — extra sheets are noise that confuses Seedance.
function pickNamesInChunk(
  chunkShots: ShotList,
  cast: Character[],
): Set<string> {
  const named = new Set<string>();
  for (const shot of chunkShots) {
    for (const d of shot.dialogue) {
      if (d.speaker) named.add(d.speaker);
    }
    const haystack = `${shot.action ?? ""} ${shot.performance ?? ""}`.toLowerCase();
    for (const c of cast) {
      if (haystack.includes(c.name.toLowerCase())) named.add(c.name);
    }
  }
  // Defensive: if a chunk somehow has no detectable names, fall back to
  // the full cast so the clip doesn't render anonymous figures.
  if (named.size === 0) for (const c of cast) named.add(c.name);
  return named;
}

// Reconstructs the clipUrls array by checking each per-chunk video blob.
export async function rebuildClipUrlsFromBlob(
  jobId: string,
  expectedChunkCount: number,
): Promise<string[]> {
  const checked = await Promise.all(
    Array.from({ length: expectedChunkCount }, (_, i) =>
      tryHead(keys.videoClip(jobId, i + 1)),
    ),
  );
  return checked.filter((u): u is string => Boolean(u));
}

// Stage 1: one character sheet per character. Generates via Higgsfield
// gpt-image-2 (model configurable in MODELS.image.higgsfield). Persists
// to BOTH a per-job blob (for traceability) AND the library cache (so
// future renders skip regeneration).
//
// Idempotency: if a cached sheet already exists for this character's
// source upload URL AND the user hasn't opted to regenerate, the cached
// URL is returned with zero Higgsfield spend.
async function loadImageModelOverride(jobId: string): Promise<string | undefined> {
  const job = await readJob(jobId);
  return job?.imageModelOverride;
}

async function shouldForceRegenerate(
  jobId: string,
  marker: string,
): Promise<boolean> {
  const job = await readJob(jobId);
  return Boolean(job?.forceRegenerateSheets?.includes(marker));
}

export async function stage1(
  jobId: string,
  character: Character,
): Promise<{ name: string; url: string; backend: Backend; reusedFromCache: boolean }> {
  const { readSheetCache, writeSheetCache } = await import("./sheet-cache");

  // 1. Cache lookup (unless user said regenerate-fresh for this name).
  const forceRegen = await shouldForceRegenerate(
    jobId,
    `character:${character.name}`,
  );
  if (!forceRegen) {
    const cached = await readSheetCache("character", character.imageUrl);
    if (cached) {
      return {
        name: character.name,
        url: cached.sheetUrl,
        backend: "higgsfield",
        reusedFromCache: true,
      };
    }
  }

  // 2. Per-job idempotency: if a previous step already wrote this
  //    character's sheet to job state, reuse the URL.
  const perJobKey = keys.characterSheet(jobId, character.name);
  const job = await readJob(jobId);
  const alreadySet = job?.artifacts.characterSheets?.find(
    (s) => s.name === character.name,
  );
  if (alreadySet) {
    return {
      name: character.name,
      url: alreadySet.url,
      backend: "higgsfield",
      reusedFromCache: false,
    };
  }

  const prompt = await renderStage1(character.name);
  const modelOverride = await loadImageModelOverride(jobId);
  const result = await hgImage({
    prompt,
    imageRefs: [character.imageUrl],
    modelOverride,
    inflight: {
      jobId,
      stage: "stage1",
      label: `Character: ${character.name}`,
    },
  });
  const url = await persistArtifact(perJobKey, result.url);

  // 3. Write to cache so the NEXT render with the same source reuses.
  await writeSheetCache({
    kind: "character",
    sourceUrl: character.imageUrl,
    generatedSheetUrl: url,
    label: character.name,
  });

  return { name: character.name, url, backend: "higgsfield", reusedFromCache: false };
}

// Stage 2: location sheet. Same caching shape as stage1.
export async function stage2(
  jobId: string,
  locationImageUrl: string,
): Promise<{ url: string; backend: Backend; reusedFromCache: boolean }> {
  const { readSheetCache, writeSheetCache } = await import("./sheet-cache");

  const forceRegen = await shouldForceRegenerate(jobId, "location");
  if (!forceRegen) {
    const cached = await readSheetCache("location", locationImageUrl);
    if (cached) {
      return { url: cached.sheetUrl, backend: "higgsfield", reusedFromCache: true };
    }
  }

  const perJobKey = keys.locationSheet(jobId);
  const job = await readJob(jobId);
  if (job?.artifacts.locationSheetUrl) {
    return {
      url: job.artifacts.locationSheetUrl,
      backend: "higgsfield",
      reusedFromCache: false,
    };
  }

  const prompt = await renderStage2();
  const modelOverride = await loadImageModelOverride(jobId);
  const result = await hgImage({
    prompt,
    imageRefs: [locationImageUrl],
    modelOverride,
    inflight: { jobId, stage: "stage2", label: "Location" },
  });
  const url = await persistArtifact(perJobKey, result.url);

  await writeSheetCache({
    kind: "location",
    sourceUrl: locationImageUrl,
    generatedSheetUrl: url,
  });

  return { url, backend: "higgsfield", reusedFromCache: false };
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
    locationImageUrl: string;
    // Per-job chunk count drives the shot count the prompt asks for.
    chunkCount: number;
  },
): Promise<ShotList> {
  const prompt = await renderStage3({
    sceneDescription: args.sceneDescription,
    dialogue: args.dialogue,
    characters: args.characters,
    chunkCount: args.chunkCount,
  });
  const { gatewayGenerateJSON } = await import("./backends/gateway");
  const raw = await gatewayGenerateJSON<unknown>({
    prompt,
    imageUrls: [
      ...args.characters.map((c) => c.imageUrl),
      args.locationImageUrl,
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
  // Accept 4..16 shots. The prompt asks for 8, but accommodate models
  // that come back with slightly more or fewer. Below 4, the downstream
  // pipeline can't fill 4 chunks; above 16, the user has too much to
  // edit comfortably.
  // Generous bound — the per-job count check happens at the approve
  // endpoint (where we know chunkCount). Here we just reject totally
  // wrong outputs (LLM hallucinating 50 shots, etc.).
  if (raw.length < 1 || raw.length > 32) {
    throw new Error(
      `Stage 3: expected 1..32 shots, got ${raw.length}`,
    );
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

// Stage 4 ONE-STORYBOARD renderer (per chunk). Idempotent — if the
// chunk's storyboard blob already exists, returns the existing URL with
// zero Higgsfield calls. Reads everything it needs (shotList, sheets,
// characters) from job state. The workflow drives one of these per
// chunk in parallel; a crash on chunk N leaves chunks 1..N-1 saved.
export async function stage4OneStoryboard(
  jobId: string,
  chunkIndex: number,
  opts: { force?: boolean } = {},
): Promise<{ url: string; backend: Backend }> {
  // Idempotency comes from job state (KV — strongly consistent). Skipped
  // when force=true (per-asset regenerate path). Asset URLs are now
  // content-addressed, so a regen produces a NEW URL and the browser
  // refetches automatically.
  const existing = await readJob(jobId);
  if (!opts.force && existing?.artifacts.storyboardUrls?.[chunkIndex]) {
    return {
      url: existing.artifacts.storyboardUrls[chunkIndex],
      backend: "higgsfield",
    };
  }

  const job = existing;
  if (!job) throw new Error(`Job ${jobId} not found`);
  const shots = job.artifacts.shotList;
  // Same staleness-resilience pattern as stage5OneClip: try the job
  // snapshot's array, fall back to head() on deterministic blob keys.
  let characterSheets = job.artifacts.characterSheets;
  if (!characterSheets || characterSheets.length === 0) {
    characterSheets = await rebuildCharacterSheetsFromBlob(
      jobId,
      job.characters,
    );
  }
  let locationSheetUrl = job.artifacts.locationSheetUrl;
  if (!locationSheetUrl) {
    locationSheetUrl =
      (await rebuildLocationSheetUrlFromBlob(jobId, job.locationImageUrl)) ??
      undefined;
  }
  if (
    !shots ||
    !characterSheets ||
    characterSheets.length === 0 ||
    !locationSheetUrl
  ) {
    const missing: string[] = [];
    if (!shots) missing.push("shotList");
    if (!characterSheets || characterSheets.length === 0)
      missing.push("characterSheets");
    if (!locationSheetUrl) missing.push("locationSheet");
    throw new Error(
      `Stage 4 storyboard ${chunkIndex + 1}: missing upstream artifacts (${missing.join(", ")})`,
    );
  }
  const chunks = chunkShots(shots, resolveJobChunkCount(job));
  if (chunkIndex < 0 || chunkIndex >= chunks.length) {
    throw new Error(
      `Stage 4: chunk index ${chunkIndex} out of range 0..${chunks.length - 1}`,
    );
  }
  const total = chunks.length;
  const chunkShotList = chunks[chunkIndex];
  const refs = [locationSheetUrl, ...characterSheets.map((s) => s.url)];
  const prompt = await renderStage4({
    shots: chunkShotList,
    characters: job.characters,
  });
  const modelOverride = await loadImageModelOverride(jobId);
  const r = await tryWithNsfwFallback(modelOverride, async (model) =>
    hgImage({
      prompt,
      imageRefs: refs,
      modelOverride: model,
      inflight: {
        jobId,
        stage: "stage4",
        label: `Storyboard ${chunkIndex + 1}/${total}`,
      },
    }),
  );
  const url = await persistArtifact(keys.storyboardChunk(jobId, chunkIndex + 1), r.url);
  return { url, backend: "higgsfield" };
}

// Stage 4: storyboard grid image (legacy, batched). The workflow now
// uses stage4OneStoryboard per chunk so a sibling crash doesn't lose
// persisted storyboards. Kept for non-workflow callers.
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
  // Legacy batched stage4 — chunk count derived from the shot list
  // length / 4 (4 shots per chunk), capped at maxCount.
  const inferred = Math.max(1, Math.min(VIDEO_CHUNKS.maxCount, Math.ceil(args.shots.length / 4)));
  const chunks = chunkShots(args.shots, inferred);
  const total = chunks.length;
  const results = await Promise.all(
    chunks.map(async (chunkShots, i) => {
      const prompt = await renderStage4({
        shots: chunkShots,
        characters: args.characters,
      });
      const r = await tryWithNsfwFallback(modelOverride, async (model) =>
        hgImage({
          prompt,
          imageRefs: refs,
          modelOverride: model,
          inflight: {
            jobId,
            stage: "stage4",
            label: `Storyboard ${i + 1}/${total}`,
          },
        }),
      );
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

// Helper for chunked render: splits a flat shot list into EXACTLY N
// chunks, distributing shots as evenly as possible. The first
// (shots % n) chunks get one extra shot. This guarantees the downstream
// pipeline always renders N storyboards + N video clips regardless of
// whether the user deleted shots — there's always one chunk per clip.
//
// Caller must ensure shots.length >= n (each chunk needs at least one
// shot). Validation lives at the approve endpoint.
function chunkShots(shots: ShotList, n: number): ShotList[] {
  if (n <= 1) return [shots];
  if (shots.length < n) {
    throw new Error(
      `chunkShots: need at least ${n} shots for ${n} chunks, got ${shots.length}`,
    );
  }
  const base = Math.floor(shots.length / n);
  const remainder = shots.length % n;
  const out: ShotList[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < remainder ? 1 : 0);
    out.push(shots.slice(cursor, cursor + size));
    cursor += size;
  }
  return out;
}

// gpt_image_2 trips Higgsfield's NSFW moderation more aggressively than
// nano_banana_pro (especially on stylized character art with implied
// contact). If a single chunk fails with status=nsfw we retry just that
// chunk with nano_banana_pro instead of failing the whole stage. The
// other chunks (which may have succeeded already with gpt_image_2) keep
// their default-model results.
async function tryWithNsfwFallback<T>(
  preferredOverride: string | undefined,
  call: (model: string | undefined) => Promise<T>,
): Promise<T> {
  try {
    return await call(preferredOverride);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isNsfwOrIp = /\bnsfw\b|ip_detected/i.test(msg);
    // If the user explicitly chose a model and it failed for moderation,
    // honor that choice — don't silently switch.
    if (!isNsfwOrIp || preferredOverride) {
      throw e;
    }
    return await call("nano_banana_pro");
  }
}

// Stage 5 ONE-CLIP renderer. Idempotent: if the chunk's video already
// exists in Blob at its deterministic key, returns the existing URL with
// zero Higgsfield / Seedance calls. This is what the workflow calls per
// chunk so a crash on clip N leaves clips 1..N-1 saved durably.
//
// Reads everything it needs (shotList, characters, sheets, storyboards)
// from job state so the workflow VM doesn't have to thread args through
// from the orchestrator.
export async function stage5OneClip(
  jobId: string,
  chunkIndex: number,
  opts: { force?: boolean } = {},
): Promise<{ url: string; backend: Backend }> {
  // 1. Idempotency: if job state already has the clip URL, reuse it. A
  //    workflow retry of this step (after a sibling clip's step crashed)
  //    must NOT re-submit Seedance. Skipped when force=true (regen).
  const existing = await readJob(jobId);
  if (!opts.force && existing?.artifacts.clipUrls?.[chunkIndex]) {
    return {
      url: existing.artifacts.clipUrls[chunkIndex],
      backend: "higgsfield",
    };
  }

  const job = existing;
  if (!job) throw new Error(`Job ${jobId} not found`);
  const shots = job.artifacts.shotList;
  // Vercel Blob's list() is occasionally stale, so the job snapshot
  // this step reads may be missing artifact arrays that ARE persisted
  // at their deterministic blob keys. Reconstruct from Blob head() before
  // failing — that's what saves us from the "Job X: missing storyboardUrls"
  // race when another step's parallel write nukes the visible ordering.
  let characterSheets = job.artifacts.characterSheets;
  if (!characterSheets || characterSheets.length === 0) {
    characterSheets = await rebuildCharacterSheetsFromBlob(jobId, job.characters);
  }
  let locationSheetUrl = job.artifacts.locationSheetUrl;
  if (!locationSheetUrl) {
    locationSheetUrl =
      (await rebuildLocationSheetUrlFromBlob(jobId, job.locationImageUrl)) ??
      undefined;
  }
  let storyboardUrls = job.artifacts.storyboardUrls;
  if (!storyboardUrls || storyboardUrls.length === 0) {
    storyboardUrls = await rebuildStoryboardUrlsFromBlob(
      jobId,
      resolveJobChunkCount(job),
    );
  }
  if (
    !shots ||
    !characterSheets ||
    characterSheets.length === 0 ||
    !locationSheetUrl ||
    !storyboardUrls ||
    storyboardUrls.length === 0
  ) {
    const missing: string[] = [];
    if (!shots) missing.push("shotList");
    if (!characterSheets || characterSheets.length === 0)
      missing.push("characterSheets");
    if (!locationSheetUrl) missing.push("locationSheet");
    if (!storyboardUrls || storyboardUrls.length === 0)
      missing.push("storyboardUrls");
    throw new Error(
      `Stage 5 clip ${chunkIndex + 1}: missing upstream artifacts (${missing.join(", ")})`,
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
  // Per-chunk duration: each chunk can be 4/8/12/15s. Default 4. Reads
  // job.artifacts.chunkDurations[chunkIndex] if set, falls back to 4s.
  // Seedance's hard range is 4-15s, so we clamp.
  const requestedDur =
    job.artifacts.chunkDurations?.[chunkIndex] ?? VIDEO_CHUNKS.secondsPerChunk;
  const secondsPerChunk = Math.max(4, Math.min(15, requestedDur));

  const chunks = chunkShots(shots, resolveJobChunkCount(job));
  if (chunkIndex < 0 || chunkIndex >= chunks.length) {
    throw new Error(
      `Stage 5: chunk index ${chunkIndex} out of range 0..${chunks.length - 1}`,
    );
  }
  if (chunks.length !== storyboardUrls.length) {
    throw new Error(
      `Stage 5 refused: ${chunks.length} shot chunks but ${storyboardUrls.length} storyboards.`,
    );
  }

  const chunkShotList = chunks[chunkIndex];
  const storyboardUrl = storyboardUrls[chunkIndex];
  const chunkPrompt = await renderStage5({
    shots: chunkShotList,
    characters: job.characters,
  });
  // Pass ONLY what this clip needs:
  //   - the storyboard for THIS chunk (as start_image — the seed frame
  //     for Seedance), NOT also as a duplicate image ref
  //   - character sheets ONLY for the characters that actually appear
  //     in this chunk's shots (extra sheets are noise that misleads
  //     Seedance into mixing identities)
  //   - the location sheet (always relevant to the environment)
  const namesInChunk = pickNamesInChunk(chunkShotList, job.characters);
  const relevantCharacterSheets = characterSheets.filter((s) =>
    namesInChunk.has(s.name),
  );
  const refs = [
    ...relevantCharacterSheets.map((s) => s.url),
    locationSheetUrl,
  ];
  const total = chunks.length;
  const resolution = VIDEO_DEFAULTS.resolution;
  const mode = VIDEO_DEFAULTS.mode;

  const { result, servedBy } = await withFallback(
    () =>
      hgVideo({
        prompt: chunkPrompt,
        imageRefs: refs,
        resolution,
        mode,
        duration: secondsPerChunk,
        startImageUrl: storyboardUrl,
        inflight: {
          jobId,
          stage: "stage5",
          label: `Video clip ${chunkIndex + 1}/${total}`,
        },
      }),
    () =>
      gatewayGenerateVideo({
        prompt: chunkPrompt,
        imageRefs: refs,
        resolution,
        mode,
        duration: secondsPerChunk,
        startImageUrl: storyboardUrl,
      }),
  );

  // 2. Persist immediately. The persistArtifact write is what survives
  //    a sibling clip's failure — once this returns, the head() check
  //    above will short-circuit any future retry.
  const persistedUrl = await persistArtifact(
    keys.videoClip(jobId, chunkIndex + 1),
    result.url,
    "video/mp4",
  );
  return { url: persistedUrl, backend: servedBy };
}

// Stage 5: multi-clip video render. Splits the 16 shots into N chunks,
// renders each as its OWN short Seedance call (against its own
// mini-storyboard from stage 4) in parallel, then persists the raw clip
// URLs. Stage 6 concatenates and burns captions.
// Hard guards:
//   - aspect ratio must be 9:16 (config const)
//   - 1080p banned unless ALLOW_1080P flips
//   - generate_audio must remain true
//
// Kept for the legacy single-step path. The workflow now uses
// stage5OneClip per chunk so a partial failure doesn't lose persisted
// siblings; this batched wrapper survives only for non-workflow callers
// that want to render all clips inline.
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

  // Legacy batched stage5 — match the chunk count to the supplied
  // storyboards so the shot/storyboard zip always lines up.
  const chunks = chunkShots(args.shots, args.storyboardUrls.length);
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
            inflight: {
              jobId,
              stage: "stage5",
              label: `Video clip ${i + 1}/${total}`,
            },
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
  //    cue distribution if no OPENAI_API_KEY is set. Total seconds = sum
  //    of per-chunk durations (default 4 each, but a chunk may be 8/12/15).
  const job = await readJob(jobId);
  const durations = job?.artifacts.chunkDurations ?? [];
  const totalSeconds = args.clipUrls.reduce(
    (sum, _u, i) => sum + (durations[i] ?? VIDEO_CHUNKS.secondsPerChunk),
    0,
  );
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

