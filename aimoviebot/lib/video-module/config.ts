// Hard product constants. Read these as load-bearing: changing any of them
// changes what AI Movie Bot IS, not how it's tuned.

// 9:16 vertical is the only allowed ratio. The video stage throws on anything
// else. Both backends are passed this verbatim.
export const ASPECT_RATIO = "9:16" as const;
export type AspectRatio = typeof ASPECT_RATIO;

// 1080p is structurally banned by default. The video stage throws if a render
// requests 1080p while this is false. fast mode also cannot do 1080p.
export const ALLOW_1080P = false;

// generate_audio is ALWAYS true. Seedance bakes the spoken dialogue into the
// MP4 itself; this is the entire dialogue delivery mechanism and is not an
// optional cost toggle.
export const GENERATE_AUDIO = true;

// Cost defaults. duration is overridable per render (Seedance 4-15s); 4s is
// the cheap-iteration default to keep test renders short. Production renders
// step up so a 16-shot story doesn't feel like a flipbook.
export const VIDEO_DEFAULTS = {
  resolution: "720p" as const,
  mode: "fast" as const,
  duration: 4 as number, // seconds; override at call site for production renders
  genre: "auto" as const,
};

// Multi-clip rendering. Seedance degrades quality at the upper end of its
// 4-15s range (character drift, weird motion, dropped lip-sync), so every
// clip is fixed at the cheapest 4s — total video length = chunkCount × 4s.
// chunkCount is per-job (derived from the user's videoDurationSec choice
// at Gate 1 approve) and stored on Job.chunkCount; this is just the fallback
// + the floor/ceiling.
export const VIDEO_CHUNKS = {
  defaultCount: 4,
  minCount: 1,
  maxCount: 8,
  secondsPerChunk: 4,
};

// Map a requested total duration (seconds) to a chunk count. Floors to
// 4s steps. Clamped to VIDEO_CHUNKS [min, max].
export function chunkCountForDuration(secs: number | undefined): number {
  const n = Math.round((secs ?? VIDEO_CHUNKS.defaultCount * VIDEO_CHUNKS.secondsPerChunk) / VIDEO_CHUNKS.secondsPerChunk);
  return Math.max(VIDEO_CHUNKS.minCount, Math.min(VIDEO_CHUNKS.maxCount, n));
}

// Resolve the per-job chunk count from whatever the job actually has,
// in priority order:
//   1. explicit job.chunkCount (set at Gate-1 approve in current code)
//   2. existing storyboards array length (jobs that ran stage 4 under
//      the previous workflow may have a count that differs from what
//      videoDurationSec would now imply — respect what was rendered)
//   3. existing clips array length (same logic for jobs further along)
//   4. duration-derived (covers brand-new jobs that just got approved)
//   5. defaultCount (last resort)
export function resolveJobChunkCount(job: {
  chunkCount?: number;
  videoDurationSec?: number;
  artifacts?: { storyboardUrls?: string[]; clipUrls?: string[] };
}): number {
  if (typeof job.chunkCount === "number" && job.chunkCount > 0) return job.chunkCount;
  const sbLen = job.artifacts?.storyboardUrls?.length ?? 0;
  if (sbLen > 0) return sbLen;
  const clipLen = job.artifacts?.clipUrls?.length ?? 0;
  if (clipLen > 0) return clipLen;
  if (typeof job.videoDurationSec === "number") {
    return chunkCountForDuration(job.videoDurationSec);
  }
  return VIDEO_CHUNKS.defaultCount;
}

// Model catalog. Stage 0 + Stage 3 are text-only via Gateway. Images route
// through Higgsfield with model=gpt_image_2 (single backend, uses the
// existing OAuth connection, no extra auth surface). Video uses Seedance
// (Higgsfield primary, Gateway fallback) because Seedance bakes the spoken
// dialogue into the MP4, which is non-negotiable.
export const MODELS = {
  concept: { gateway: "anthropic/claude-sonnet-4.6" },
  image: {
    // gpt-image-2 via Higgsfield's MCP. Faithful to reference photos:
    // preserves character identity, uses the supplied location as the
    // literal setting, not as inspiration. If the slug name is wrong,
    // Higgsfield will tell us with a clear error.
    higgsfield: "gpt_image_2",
    // Same model family via Vercel AI Gateway. Used as a fallback when
    // Higgsfield's MCP server is unreachable so storyboard regen still
    // works during their outages.
    gateway: "openai/gpt-image-2",
  },
  shotList: { gateway: "anthropic/claude-sonnet-4.6" },
  video: {
    higgsfield: "seedance_2_0",
    // The "-fast" Gateway variant matches our default mode: "fast".
    gateway: "bytedance/seedance-2.0-fast",
  },
} as const;

// Gateway fetch needs an Undici Agent with an extended timeout for the video
// call. Node's default is 5 min and Seedance can take longer. 10 min headroom.
export const GATEWAY_VIDEO_TIMEOUT_MS = 10 * 60 * 1000;

// Workflow approval hook token convention. Deterministic so /approve can
// resume the right hook by jobId alone.
export const approvalToken = (jobId: string) => `approve:${jobId}`;
