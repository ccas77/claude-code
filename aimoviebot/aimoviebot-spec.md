# AI Movie Bot — End-to-End Storyboard → Video Module Spec

**ORIENTATION: 9:16 VERTICAL ONLY.** Every framed stage in this pipeline — character sheet,
location sheet, storyboard grid, and final video — renders in 9:16 portrait. There is no
landscape path. `aspectRatio` is fixed to `"9:16"` in `config.ts` as a constant, not a
user option, and the video stage must throw if any other ratio reaches it. This is a hard
product requirement, not a default.

**DIALOGUE: SPOKEN, BAKED IN BY SEEDANCE.** The videos contain real spoken dialogue. There
is NO separate TTS stage and NO lip-sync stage — Seedance 2.0 generates the audio itself
(`generate_audio: true`) from the dialogue lines carried in the video prompt. This means
two things must hold end to end: (1) `generate_audio` is always `true`; (2) the actual
dialogue lines must survive from Stage 0 through the storyboard and into the Seedance
prompt, clearly attributed to each speaker. If the lines don't reach Seedance, the
characters won't say them.

A build spec for Claude Code. This module chains five generation stages into a single
job that turns a character image, a location image, and a scene description into a
finished video, reusing locked reference sheets at every stage for consistency.

Stack assumed: Next.js on Vercel, **Higgsfield MCP as the primary generation backend**,
**Vercel AI Gateway (AI SDK v6+) as the fallback backend**, Vercel Blob for storage.
This is a brand-new standalone app — nothing here assumes a pre-existing codebase.

---

## Two values to fill in before running

1. **Higgsfield MCP auth / connection** — the module calls Higgsfield through its MCP. Make
   sure the MCP is connected and authenticated in the deployment environment, and confirm
   the account plan tier covers Seedance 2.0 at the resolution/mode you want (`1080p`
   requires `std` mode and a sufficient tier; `fast` mode is cheaper but caps below 1080p).
2. **`INVOCATION_MODE`** — `"polling"` (user waits, frontend polls a status endpoint) or
   `"background"` (kicked off and forgotten, result delivered later). Default below is
   `"polling"`. If background, swap the inline orchestration for a queue/cron trigger and
   keep the same stage functions.

---

## Hard constraints (do not design around these — design *for* them)

- **Every image/video stage tries Higgsfield MCP first, falls back to the Gateway on
  failure.** Wrap each generation call in a `withFallback(primaryFn, fallbackFn)` helper
  that catches MCP errors/timeouts/tier-limits and retries on the Gateway, recording which
  backend served each artifact. One helper, used by stages 1, 2, 4, 5.
- **Video gen takes minutes.** Whichever backend serves it, the chain CANNOT be one
  serverless function call — it'll exceed function timeouts. Each stage persists its output
  and is independently re-runnable. On the *Gateway* fallback path specifically, Node's
  default Undici fetch times out at 5 min, so the fallback video call needs a custom
  gateway instance with an extended Undici `Agent` timeout.
- **Confirm Higgsfield plan tier covers Seedance 2.0** at your target resolution/mode.
  Default is the cheap tier: **720p + `fast` mode** (see cost defaults below). 1080p is
  guarded off. The same resolution cap must apply on BOTH backends — the Gateway fallback
  must not silently render at a higher (pricier) resolution than the Higgsfield primary.
  Pass the same capped resolution param to whichever backend runs.
- **Higgsfield needs `media_id`s, not URLs.** Import/confirm every reference image to a
  Higgsfield `media_id` before passing it to a Higgsfield generation call (see media flow
  above). The Gateway path takes URLs/base64 directly.
- **9:16 vertical is enforced in code, not just prompts.** `ASPECT_RATIO = "9:16"` is a
  single const in `config.ts`, passed to every framed stage (sheets, storyboard grid,
  video). The video stage throws if it ever receives anything other than `9:16`. Both
  backends (Higgsfield primary and Gateway fallback) must be passed `9:16` — neither may
  default to landscape. Image prompts say "9:16 vertical"; the storyboard sheet uses a
  2×8 layout of vertical panels, never a 4×4 of landscape cells.
- **Pass reference sheets as image inputs at every stage, never as re-described prose.**
  This is the entire consistency mechanism. Text descriptions of a character drift; image
  references don't.
- **Persist every intermediate artifact.** A bad storyboard must not cost a full re-run.

---

## Models — Higgsfield primary, Gateway fallback

Every generation stage calls Higgsfield via MCP first. On failure (error, timeout, tier
limit), it falls back to the equivalent Vercel AI Gateway model. Put both in one `MODELS`
config so a swap is one line.

| Stage | Purpose | Primary (Higgsfield MCP) | Fallback (Gateway) |
|-------|---------|--------------------------|--------------------|
| 0 | Concept text (modes A/B/C) | — | `anthropic/claude-sonnet-4-6` (vision-capable; runs on Gateway directly, no MCP equivalent needed) |
| 1, 2, 4 | Image gen (sheets + storyboard grid), image-to-image with reference | Higgsfield `nano_banana_pro` | `google/gemini-3-pro-image` |
| 3 | Storyboard text (16-shot list) | — | `anthropic/claude-sonnet-4-6` |
| 5 | Video (image-to-video, multi-reference) | Higgsfield `seedance_2_0` | `bytedance/seedance` (verify exact Gateway slug) |

Notes for CC:
- **`nano_banana_pro`** chosen over Higgsfield `soul_2`: Soul is tuned for realistic human
  UGC/portraits and uses a Soul-ID *training* flow, wrong for arbitrary stylized character
  art. Nano Banana Pro takes a reference image directly (roles: `image`), supports up to 4k,
  and needs no training step.
- **`seedance_2_0`** params (real, from the catalog): `resolution` 480p/720p/1080p,
  `mode` std/fast, `genre` auto/action/horror/comedy/noir/drama/epic, `generate_audio`
  bool, duration 4–15s. **Aspect ratio is locked to `9:16` (vertical) — do not pass any
  other ratio; the model also supports 16:9/21:9/etc. but AI Movie Bot must not use them.**
  Media roles: `image`,
  `start_image`, `end_image`, `video`, `audio`. Pass the storyboard sheet + character +
  location sheets as `image` references; optionally a `start_image` for the opening frame.
- **COST DEFAULTS — do not exceed without a deliberate override.** Default the video to
  `resolution: "720p"`, `mode: "fast"`. **Duration: 4s is the cheap TEST default only;
  production renders step up within Seedance's 4–15s range so a 16-shot story doesn't feel
  like a flipbook.** **`generate_audio` MUST be `true` — this is non-negotiable for AI Movie
  Bot. The spoken dialogue is baked in by Seedance itself; audio is not an optional cost
  toggle here, it carries the dialogue. Do NOT set it false to save money.** **1080p is
  banned by default:** put a hard guard in `config.ts` (e.g. `ALLOW_1080P = false`) and have
  the video stage throw if anything requests 1080p while the flag is off. Stepping to
  `720p` + `std` is the one allowed quality bump; reserve it for final renders.
- Stages 0 and 3 are text and have **no Higgsfield primary** — they run on the Gateway
  directly. Only the image/video stages have the MCP-primary/Gateway-fallback split.

### Higgsfield media flow (important)
Higgsfield generation does NOT accept raw external URLs as media inputs. For any reference
image (the user's character/location uploads, and each generated sheet feeding a later
stage), first call `media_import_url` (or upload + `media_confirm`) to get a Higgsfield
`media_id`, then pass that `media_id` as the media input. Build one helper that takes a
Blob URL and returns a confirmed Higgsfield `media_id`, and route every reference through
it. The Gateway fallback path uses URLs/base64 directly and does not need this step — so
the two backends need slightly different input handling per stage.

---

## Pipeline

```
Input: characterImage, locationImage, + ONE of three concept inputs (see Stage 0)
  │
  ├─ Stage 0  concept input (mode A/B/C)             → sceneDescription     (text gen)
  │           ↳ ALWAYS returns to user for edit/approval before locking
  ├─ Stage 1  characterImage                         → characterSheet.png   (image gen)
  ├─ Stage 2  locationImage                          → locationSheet.png    (image gen)
  ├─ Stage 3  [charSheet, locSheet] + sceneDesc      → shotList (16 shots)  (text gen)
  ├─ Stage 4  [charSheet, locSheet] + shotList       → storyboardSheet.png  (image gen)
  └─ Stage 5  [all sheets + storyboard]              → output.mp4           (video gen)
Output: video URL + every intermediate artifact URL
```

Each stage reads the prior stage's persisted artifact(s) from Blob and writes its own.
Stages 1 and 2 are independent and can run in parallel. Stage 0 gates the whole chain:
nothing downstream runs until the user approves the `sceneDescription`.

---

## Stage 0 — Concept (the front half that makes this end-to-end)

The rest of the chain consumes a single artifact: a clean `sceneDescription` string sized
to fit a 16-shot sequence. Stage 0 produces that artifact from one of three input modes.
All three converge on the **same output shape** and all three pass through a **mandatory
user edit/approve step** before the scene locks and Stages 1–5 fire.

```
Mode A ─┐
Mode B ─┼─→ normalize → draft sceneDescription → [USER EDITS] → approved → lock
Mode C ─┘
```

### Mode A — Direct write
User types the scene themselves, optionally with snatches of dialogue.
- Input: freeform text.
- Action: light normalization only — clean it into the Stage-3-ready shape (a single
  coherent action paragraph; dialogue preserved but clearly marked). Do **not** invent
  plot the user didn't write.
- **Dialogue:** preserve every spoken line the user wrote, VERBATIM, into the `dialogue`
  array with its speaker. Do not paraphrase or "improve" their lines. If they wrote no
  dialogue, leave it empty — don't fabricate any in Mode A.
- This is the lowest-intervention path; the model is an editor, not an author.

### Mode B — Adapt a book excerpt
User pastes a passage from a book; the model turns prose into a shootable scene.
- Input: prose excerpt (can be long, descriptive, internal-monologue-heavy).
- Action: extract the *visualizable* beats — who does what, where, in what order — and
  discard what can't be filmed (interiority, backstory, authorial aside). Compress to a
  single scene that fits 16 shots. Flag if the excerpt contains more than one scene's
  worth of action and offer to split.
- **Dialogue:** pull the spoken lines out of the prose into the `dialogue` array with
  speakers. Use the book's actual quoted dialogue where it exists; trim long speeches to
  speakable length and note in `notes` if you cut anything. Don't invent lines the passage
  doesn't support.
- Output must read as a *scene to film*, not a summary of the passage.

### Mode C — Brainstorm from blurb/title
User gives only a book blurb or title; the model proposes a scene from near-nothing.
- Input: blurb, title, or a one-line hint.
- Action: generate a logline + a short scene premise that suits the supplied character
  and location images. **Return 2–3 alternates** so the user has something to choose
  between, not a single take-it-or-leave-it.
- **Dialogue:** this is the one mode that authors dialogue from scratch — write short,
  punchy spoken lines that fit the premise and the characters, into the `dialogue` array
  with speakers. Keep it sparse; a few strong lines beat a wall of talk in a 4–15s clip.
- Highest-intervention path; the model is authoring. Lean on the character/location
  images as creative constraints so the premise actually fits what will be rendered.

### Shared output contract (all modes)
```ts
type DialogueLine = { speaker: string; line: string };

type ConceptResult = {
  mode: "A" | "B" | "C";
  sceneDescription: string;      // the draft action, Stage-3-ready
  dialogue: DialogueLine[];      // ordered spoken lines, attributed to a speaker;
                                 // [] only if the scene is genuinely wordless
  alternates?: string[];         // Mode C: the other candidates
  notes?: string;                // e.g. "excerpt had 2 scenes, used the first"
};
```
The `dialogue` array is first-class output, not an afterthought. It must be ordered to
match the scene's action so it can be distributed across the 16 shots in sequence, and
each line must name its speaker so Seedance voices the right character. Keep lines short
and speakable — these get spoken aloud in a 4–15s clip, so trim anything that won't fit.

### The edit step is not optional
Whatever the mode, the draft goes back to the UI for the user to edit freely before
approval. Only the **approved, possibly-edited** string is persisted as the locked
`sceneDescription` and passed to Stage 3. Modes B and C will get details wrong; the edit
step is how the user corrects them cheaply, *before* any expensive generation runs.

### Vision matters for B and C
Modes B and C should receive the character and location images as input alongside the
text, so the proposed scene fits the actual cast and set. (Mode A can too, as a sanity
nudge, but shouldn't override what the user explicitly wrote.) Use a vision-capable text
model for Stage 0.

---

## Prompts (lifted from the source workflow — keep verbatim, they're tuned)

Store these as exported template strings in `prompts.ts`. The originals are long; the
operative instructions per stage:

- **Stage 1 (character sheet):** "Character design reference sheet based entirely on the
  provided input character image. 9:16 vertical. NO text/labels anywhere. Preserve exact
  face,
  hair, proportions, clothing, accessories, colors with maximum fidelity — input image is
  the sole source of truth. Front/side/back large views + facial close-ups + isolated
  prop/accessory breakouts. White/neutral background. Studio turnaround quality."
- **Stage 2 (location sheet):** "Environment turnaround based entirely on the provided
  location image. 9:16 vertical. NO text. Four opposing views (front/rear/left/right) like
  a
  character turnaround, plus 45° angles, top-down, ground-level. Each panel reveals new
  info; no duplicate angles. Reconstruct a full 360° understanding. Provided image is sole
  source of truth."
- **Stage 3 (shot list):** "Convert SCENE DESCRIPTION into exactly 16 storyboard panels.
  Use the uploaded character + location sheets as sole sources of truth. **All shots are
  composed for 9:16 VERTICAL framing — favor compositions that read well tall: full-body
  and medium verticals, stacked foreground/background depth, low and high angles, close-ups;
  use sparing wide shots that still work in portrait rather than sprawling landscape vistas.**
  Varied shot sizes (EWS→ECU) and angles (eye/low/high/OTS/POV/tracking). Structure: shots
  1–3 establish, 4–7 build, 8–11 reveal/twist, 12–14 escalate, 15–16 resolve. Output
  `Shot N: [Camera] —
  [Action]`." Inject `sceneDescription` AND the `dialogue` array. **Distribute the dialogue
  lines across the shots in order — attach `[Speaker: "line"]` to the shots where each line
  is spoken, tying spoken words to specific moments.** **Parse the output into a 16-item
  array**, each item carrying its action and any dialogue on that shot — don't pass raw
  text downstream.
- **Stage 4 (storyboard grid):** "Professional storyboard sheet in **9:16 vertical
  format**. 16 panels, **each individual panel framed 9:16 vertical** (portrait shots —
  this is what the video inherits, so panels must compose for vertical). Use a **2 columns
  × 8 rows** layout so portrait panels aren't squashed (NOT a 4×4 grid of landscape cells).
  Thin black borders, bold frame number top-left of each panel, short caption under each.
  Character + location sheets are sole sources of truth. Insert the 16 shots below: …"
  Inject the Stage-3 array. The whole sheet AND every panel inside it are vertical.
- **Stage 5 (video):** "Use the storyboard sheet as primary source of truth. Character
  sheet for character consistency, location sheet for environment. Follow the storyboard's
  sequence, angles, compositions, actions. Consistent design/clothing/proportions and
  consistent environment throughout. High-end cinematic animation, smooth motion, natural
  camera movement. **The characters SPEAK the following dialogue aloud, in order, matched to
  the shots indicated: [inject the per-shot `[Speaker: "line"]` dialogue from Stage 3]. The
  spoken words must be audible in the video.**" Pass all sheets as image references, set
  `generate_audio: true`, and `aspectRatio: "9:16"`. The dialogue text in the prompt is what
  Seedance voices — if it's missing or vague, the characters won't speak the right lines.

---

## File layout

```
/lib/video-module/
  config.ts        # MODELS (primary+fallback pairs), INVOCATION_MODE, timeouts;
                   #   ASPECT_RATIO = "9:16" (const, the only allowed ratio);
                   #   ALLOW_1080P = false (cost guard)
  prompts.ts       # the five stage templates + the three Stage-0 mode templates
  concept.ts       # Stage 0: mode A/B/C → ConceptResult; vision input for B/C
  backends/
    higgsfield.ts  # MCP calls: generate image/video, + importMedia(blobUrl)->media_id
    gateway.ts     # AI SDK calls: image/video/text; long-timeout instance for video
    withFallback.ts# wraps primary→fallback, records which backend served each artifact
  storage.ts       # Blob put/get helpers; deterministic keys per job+stage
  stages.ts        # stage1..stage5, each: (jobId, inputs) -> artifact URL, via withFallback
  orchestrator.ts  # runs the chain post-approval, writes status, resumable
  types.ts         # Job, JobStatus, StageResult, Artifacts, ConceptResult, Backend
/app/api/video/
  concept/route.ts # POST: run Stage 0 -> draft scene, park at awaiting_approval
  approve/route.ts # POST: lock approved scene -> start Stages 1–5
  route.ts         # GET ?jobId= -> status + artifacts
  retry/route.ts   # POST: re-run one stage forward
```

## Job state machine

`queued → concept → awaiting_approval → char_sheet → loc_sheet → shot_list → storyboard
→ video → done`
(plus `failed` with the failing stage + error recorded).

`awaiting_approval` is a real halt state, not a transient one: the job stops there and
waits for the user's approved scene. The expensive stages (1–5) must not begin until the
user approves. Persist status to Blob (or your DB) after each stage so a retry resumes
from the last good artifact instead of restarting.

## API contract

Stage 0 splits job creation into two calls — generate a concept, then approve it. The
expensive chain only starts on approval.

- `POST /api/video/concept` body `{ mode: "A"|"B"|"C", conceptInput, characterImageUrl,
  locationImageUrl }`
  → `{ jobId, sceneDescription, alternates?, notes? }`. Runs Stage 0; job parks at
  `awaiting_approval`.
- `POST /api/video/approve` body `{ jobId, sceneDescription }` (the edited/chosen string)
  → `{ jobId }`. Locks the scene and kicks off Stages 1–5.
- `GET /api/video?jobId=…`
  → `{ status, artifacts: { sceneDescription?, characterSheet?, locationSheet?, shotList?,
  storyboard?, video? }, error? }`.
- `POST /api/video/retry` body `{ jobId, fromStage }` — re-run a single stage forward
  using existing upstream artifacts. (Re-running Stage 0 returns to `awaiting_approval`.)

---

## Call shapes (for CC to implement against)

Each image/video stage = `withFallback(higgsfieldFn, gatewayFn)`.

**Higgsfield (primary):**
- Import refs first: `media_import_url({ url: blobUrl })` → confirm → `media_id`.
- Image: Higgsfield `generate_image`-style call, model `nano_banana_pro`, medias = the
  confirmed `media_id`(s), role `image`, plus the stage prompt + aspect ratio (**9:16**).
- Video: model `seedance_2_0`, medias = storyboard + character + location `media_id`s as
  role `image` (optional `start_image`), params `resolution`/`mode`/`genre`/duration,
  **`generate_audio: true` (always), `aspectRatio: "9:16"`, and the per-shot dialogue
  injected into the prompt** so the characters speak it. Save the returned video to Blob.

**Gateway (fallback):**
- Images: `experimental_generateImage`, `model: gateway.imageModel('google/gemini-3-pro-image')`,
  prompt + image input(s) as URL/base64. Save to Blob.
- Video: `experimental_generateVideo`, Seedance Gateway slug, prompt + image refs, on the
  **long-timeout gateway instance**. Save to Blob. Don't assume Veo's param names — check
  the model page.

**Text (Gateway only, no fallback needed):**
- Stage 0 concept + Stage 3 shot list: `generateText`, `anthropic/claude-sonnet-4-6`,
  vision input (images) for concept modes B/C and for the shot list. Stage 3 output →
  parser asserting exactly 16 items.

---

## Build order for CC

1. `config.ts` + `types.ts`.
2. `backends/higgsfield.ts` (incl. `importMedia` URL→media_id helper),
   `backends/gateway.ts` (incl. extended-timeout video instance), then
   `backends/withFallback.ts`. Test the Higgsfield image call and its Gateway fallback in
   isolation on a throwaway prompt before touching the pipeline.
3. `storage.ts` with deterministic `jobId/stage` keys.
4. `concept.ts` — modes A/B/C + `ConceptResult`. Test each mode standalone; verify the
   approval gate parks the job and nothing downstream fires.
5. `stages.ts` — stages 1–2 (cheap, fast), each via `withFallback`.
6. `stage3` + the shot-list parser (assert exactly 16 items).
7. `stage4`, then `stage5` last (slowest/most expensive). Verify the Higgsfield media
   import → seedance_2_0 path AND the Gateway fallback path each independently.
8. `concept`/`approve`/`retry`/status routes.
9. Only after stages pass individually: wire the full post-approval chain.

Test each stage standalone before chaining. Get Stage 0 + the approval gate + the
fallback helper right first — they're cheap and they're the steering wheel and the safety
net for everything expensive downstream. The video stage is the costly one — get 0–4
solid before you ever run 5 end to end.
