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

// Model catalog. Primary = Higgsfield via MCP-over-HTTP (OAuth); fallback =
// Vercel AI Gateway. Stage 0 + Stage 3 are text-only, Gateway-direct.
//
// Higgsfield model IDs are the underscored ones the MCP `generate_image`/
// `generate_video` tools accept in `params.model`. Gateway slugs are
// verified live against ai-gateway.vercel.sh/v1/models.
export const MODELS = {
  concept: { gateway: "anthropic/claude-sonnet-4.6" },
  image: {
    higgsfield: "nano_banana_pro",
    gateway: "google/gemini-3-pro-image",
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
