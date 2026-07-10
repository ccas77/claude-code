# App Audit & Consolidation Proposal — PRELIMINARY

**Date:** 2026-07-10
**Status: PARTIAL.** Two blockers prevented a complete audit (details in [Blockers](#blockers)):

1. **`content-engine-architecture.md` is not in this folder** (searched the whole repo — no copy, no reference). The extraction-map "destination" column below is therefore based only on the architecture summary in your instructions (Supabase all-in-one, Drizzle, Inngest, Post Bridge, workspace asset library with per-user private content, `src/services/` + `src/modules/`, slideshow = Module #1). It must be re-checked against the real spec.
2. **23 of the 24 Vercel apps are not cloned into this folder.** Only `bookshelf` is here. 16 of the missing ones exist in your GitHub account and can be pulled into this session as soon as you say so; 7 I could not find at all. The head-to-head slideshow-family comparison (slideshow-generator vs slideshow-creator vs tslides vs bookslide) **could not be done** — none of those four repos are available locally.

What this document *does* contain: full audits of the 6 projects that are in this folder (5 of them are keepers with directly relevant code), a consolidated key/API list from those apps, a provisional extraction map, and the questions I need answered.

---

## Inventory

### The 24 Vercel apps

| App | Where it is | Audited | Verdict |
|---|---|---|---|
| bookshelf | ✅ In this folder | ✅ Yes | **KEEPER** (strongest single codebase — see below) |
| slideshow-generator | GitHub `ccas77/slideshow-generator` — not cloned | ❌ | pending |
| slideshow-creator | GitHub `ccas77/slideshow-creator` — not cloned | ❌ | pending |
| tslides | GitHub `ccas77/tslides` — not cloned | ❌ | pending |
| tinkerboxxx | GitHub `ccas77/tinkerboxxx` — not cloned | ❌ | pending |
| meme-maker | GitHub `ccas77/meme-maker` — not cloned | ❌ | pending |
| ai-ugc-pipeline | GitHub `ccas77/ai-ugc-pipeline` — not cloned | ❌ | pending |
| aesthetic | GitHub `ccas77/aesthetic` — not cloned | ❌ | pending |
| book-video-bot | GitHub `ccas77/book-video-bot` — not cloned | ❌ | pending |
| inkwell | GitHub `ccas77/inkwell` — not cloned | ❌ | pending |
| simplepostr | GitHub `ccas77/simplepostr` — not cloned | ❌ | pending |
| authorbids | GitHub `ccas77/authorbids` — not cloned | ❌ | pending |
| my-toolkit | GitHub `ccas77/my-toolkit` — not cloned | ❌ | pending |
| dictabook | GitHub `ccas77/dictabook` — not cloned | ❌ | pending |
| siggy | GitHub `ccas77/Siggy` — not cloned | ❌ | pending |
| trialreels | GitHub `ccas77/trialreels` — not cloned | ❌ | pending |
| facebook-library | GitHub `ccas77/facebook-library` — not cloned | ❌ | pending |
| **aimoviebot** | **MISSING — not local, not in your visible GitHub repos** | ❌ | unknown |
| **kinetic** | **MISSING** | ❌ | unknown |
| **quadrants** | **MISSING** | ❌ | unknown |
| **reposter** | **MISSING** | ❌ | unknown |
| **socialato** | **MISSING** | ❌ | unknown |
| **bookslide** | **MISSING** (⚠️ part of the slideshow family) | ❌ | unknown |
| **public** | **MISSING** | ❌ | unknown |

Per your instructions I have not guessed at what any missing app does.

### Other projects found in this folder (not on the Vercel list)

These were built in earlier Claude sessions inside this repo (per git history). Four of the five contain code highly relevant to the content engine, so I audited them fully:

| Project | Verdict |
|---|---|
| book-social-media | **KEEPER** — complete Claude→Pillow→Post Bridge posting pipeline |
| pinfactory | **KEEPER** — best text-overlay renderer found so far; anti-spam scheduler |
| storyforge | **KEEPER** — Gemini image gen w/ character consistency; ffmpeg video engine |
| tropesite | **KEEPER (partial)** — grounded-copy prompts + compliance audit only |
| thriller-concept-project | **NOT AN APP** — book-concept research package; only its README + decision log survive locally. Nothing to extract into the engine (its outputs are book-marketing *content*, not code). |

### Other GitHub repos visible in your account (not on the list, not cloned)

`video-generator`, `book-boyfriend`, `book-writer-app`, `bookpulls-runbook`. Tell me if any of these should be in scope.

---

## Per-app audits (the 6 local projects)

### bookshelf — KEEPER (production-grade; closest existing code to the target architecture)

- **Purpose:** An automated BookTok video factory: takes a book cover, generates a styled AI scene image that keeps the real cover pixel-faithful, burns kinetic word-level captions (from a transcribed music clip) over it with ffmpeg, then auto-schedules and posts the 9:16 MP4 via Post Bridge. Not a static bookshelf.
- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript on Vercel; Neon Postgres + **Drizzle** (schema `src/lib/db/schema.ts`, migrations `src/lib/db/migrations/`); pg-boss job queue; next-auth v5; Vercel Blob storage; Vercel AI SDK v6 via AI Gateway; 4 Vercel crons as the clock (`vercel.json`).
- **External APIs / key references** (all via env, validated in `src/lib/config.ts`; **no hardcoded secrets found**):
  - Post Bridge — `src/lib/posting/postbridge.ts` (`POSTBRIDGE_API_KEY`, `POSTBRIDGE_API_KEY_SHARED`)
  - Higgsfield image gen — MCP OAuth path `src/lib/render/higgsfield-mcp.ts` + `src/lib/higgsfield/oauth.ts` (tokens AES-256-GCM encrypted, `TOKEN_ENCRYPTION_KEY` in `src/lib/higgsfield/crypto.ts`); legacy HTTP key path `src/lib/render/image.ts`
  - OpenAI (gpt-image-1 fallback, Whisper) — `src/lib/render/image.ts`, `src/lib/transcription/whisper.ts`
  - Gemini / Claude via AI Gateway OIDC (direct keys optional) — captions, recipe vision, cover verification
  - Replicate (Demucs vocal separation; legacy video) — `src/lib/transcription/demucs.ts`
  - Resend (failure emails) — `src/lib/notify/email.ts`
  - Vercel Blob (`BLOB_READ_WRITE_TOKEN`), `CRON_SECRET`
- **Valuable parts:**
  - `src/lib/render/cover-check.ts` — Gemini-2.5-Pro visual QA gate (transcribe-then-vote, 3× majority) that verifies the generated image preserved the real cover. Generalizes to any brand/product-fidelity pipeline.
  - `src/lib/render/ass.ts` — word-timestamp → ASS kinetic captions (10 named effects, speech-paced cue grouping).
  - `src/lib/render/ffmpeg.ts` — local ffmpeg still→9:16 video with Ken Burns drift + burned libass captions; zero hosted-compute cost.
  - `src/lib/render/prompt.ts` — cover-fidelity image prompt ("Pixel-copy what you see… Cover fidelity beats every other instruction").
  - `src/lib/recipe/prompt.ts` + `src/lib/recipe/vision.ts` — "style recipe" distillation from reference images → basis for workspace brand kits.
  - `src/lib/automation/scheduler.ts` — per-account posting windows (DST-safe), daily caps, round-robin content pointers, priority music matching.
  - `src/lib/posting/postbridge.ts` + `run.ts` — Post Bridge client (presigned upload, per-platform config incl. TikTok `is_aigc`, analytics paging) with an idempotency guard against double-posting.
  - `src/lib/db/schema.ts` — `cards` post state machine, `automation_configs`, `event_log` audit table, encrypted `mcp_tokens`.
- **State:** complete / production-grade. Dead code: `src/lib/render/animate.ts`, `composite.ts`, `srt.ts` (superseded Replicate path — drop).
- **Notes for the consolidation:** pg-boss + cron clocks must be ported to Inngest; Neon→Supabase is a connection-string swap for Drizzle; the dual-key (owner/shared) Post Bridge logic and its documented pagination hazards (`/v1/post-results` 500s on deep offsets; shared key pulls other apps' posts) matter for the multi-user design.

### book-social-media — KEEPER

- **Purpose:** Python CLI that reads your book files (.txt/.md/.pdf/.epub), has Claude generate platform-tailored posts (IG/FB/TikTok/Pinterest), renders branded quote/trivia/CTA cards with Pillow, and schedules/publishes via Post Bridge on a staggered calendar.
- **Stack:** Python 3 CLI; `anthropic`, `Pillow`, `schedule`, `requests`, `PyPDF2`, `ebooklib`.
- **External APIs / key references** (all env via `config.py`; **no hardcoded secrets**): Anthropic (`config.py:23`), Post Bridge (`config.py:27-39`, client `publisher.py`) incl. per-platform account IDs and `PINTEREST_BOARD_ID`.
- **Valuable parts:**
  - `post_generator.py:77-113` — book-marketing post-generation prompt with strict JSON contract; `PLATFORM_GUIDELINES` (:36-61) and the 10-type content taxonomy `POST_TYPES` (:63-74) — quote, chapter_teaser, character_spotlight, theme_exploration, behind_the_scenes, reader_question, book_trivia, emotional_hook, review_prompt, reading_motivation.
  - `image_generator.py` — 5 card renderers (quote/gradient/question/trivia/minimal), auto-scaling wrapped text (:145,196-204), per-platform canvas sizes incl. 1080×1920 (:21-26).
  - `publisher.py` — Post Bridge client (media upload :54, create_post :68) + platform-interleaved stagger scheduling (:158-215).
  - `book_reader.py:128-155` — quote-extraction heuristic (seed for auto-pulling shareable lines).
- **State:** complete and coherent (needs user-supplied book files; `books/`, `templates/` ship empty). Known wart: `save_publishing_plan` duplicates the stagger loop; gradient renderer is per-pixel slow.
- **Notes:** Claude already generates an unused `image_prompt` per post — a ready hook for real AI image gen in the new app.

### pinfactory — KEEPER (best text-overlay renderer found so far)

- **Purpose:** Local-first Pinterest engine for pen names: renders branded 1000×1500 pins from a book catalogue (Pillow, 6 layout templates), writes Pinterest-SEO copy via Anthropic, gates everything through a local approval gallery, publishes to Pinterest v5 on an anti-spam schedule.
- **Stack:** Python 3; Pillow, PyYAML, anthropic, requests; SQLite; stdlib HTTP review gallery.
- **External APIs / key references** (**no hardcoded secrets**; `.env` gitignored): Anthropic (`pinfactory/copy_gen.py:311`, `config.py:148-168`); Pinterest v5 OAuth (`pinfactory/cli.py:261-288`, `pinfactory/pinterest.py`).
- **Valuable parts:**
  - `pinfactory/images.py` — the overlay engine: `fit_text` auto-fit within width AND height (:195-209), greedy `wrap_to_width`, letter-tracking, drop shadows, `scrim` gradient + vignette for text legibility over imagery (:118), rounded-corner cover compositing, deterministic SHA-seeded variants + content-hash "never publish the same image twice" dedup (:370-377).
  - Six slide-worthy templates (:410-691): headline, trope_hook, quote_card, comp_card ("if you love X"), tropes_checklist, stats_card.
  - `themes.yaml` + `pinfactory/themes.py:50-102` — semantic palette (bg_top/scrim/headline/accent…) + font-role map with deep-merge defaults. **The single most reusable theming pattern for the new app.**
  - `pinfactory/copy_gen.py` — Pinterest-SEO system prompt (:66-79, keyword-first, no invented facts), per-template angle guidance (:32-39), JSON-schema output, offline MockBackend. ⚠️ the `output_config` param on `messages.create` is non-standard for the Anthropic SDK — verify before reuse.
  - `pinfactory/scheduler.py` — anti-spam engine: rolling 7-day caps, min-hours-per-URL spacing, pen-name round-robin with priority, re-save after N days, failure quarantine + circuit breaker. Maps directly onto Inngest.
  - `pinfactory/boards.py` — board proposal + best-board scoring per pin.
  - `fonts/` — 12 OFL-licensed .ttf (Gloock, Crimson Pro, Lora, Work Sans, Outfit, Italiana, Nothing You Could Do) with role documentation in `FONTS.md` → upload to the shared asset library.
- **State:** complete (all 3 components wired; 18 rendered demo pins prove the render path). No test suite.
- **Notes:** the draft→approve/reject gallery + keyword bank (approved/suggested/rejected) is a strong editorial-gating model for the new app. Pinterest v5 client is reference-only since Post Bridge is the posting layer.

### storyforge — KEEPER

- **Purpose:** Python pipeline turning a `story.yaml` (premise/style/characters) into a narrated, captioned, illustrated Ken Burns story video — Claude script → Gemini images with character consistency → ElevenLabs TTS → ffmpeg assembly; runs fully offline via stub backends.
- **Stack:** Python 3.10+; PyYAML, Pillow, imageio-ffmpeg; optional anthropic / google-genai / elevenlabs / insightface; stdlib web UI.
- **External APIs / key references** (**no hardcoded secrets**): Anthropic (`storyforge/backends/llm.py`), Gemini image (`storyforge/backends/image.py`, `GEMINI_API_KEY`), ElevenLabs (`storyforge/backends/tts.py`), InsightFace local QC (`storyforge/backends/qc.py`).
- **Valuable parts:**
  - `storyforge/backends/llm.py` (~147-162) — scene-decomposition prompt with strict JSON schema + `_validate()` normalizer (enum clamping, renumbering).
  - Character-consistency system — locked description string + reference images injected into every image prompt (`storyforge/stages/images.py` `_assemble_prompt`, `stages/cast.py`). Core reusable IP for recurring characters / brand consistency.
  - Drift QC + best-of-N retry loop (`stages/images.py` + `backends/qc.py`) — generate→score→regenerate→flag-for-review gate.
  - `storyforge/ffmpeg.py` — zoompan Ken Burns with 2× upscale anti-jitter, xfade chaining, music sidechain ducking under narration, `loudnorm I=-14`.
  - `storyforge/captions.py` — word timestamps → karaoke-style ASS cues.
  - `storyforge/stages/timeline.py` — deterministic durations, alternating zooms, mood-driven cut-vs-crossfade. Pure computation, portable.
  - Review/regenerate storyboard UI pattern (`storyforge/review.py`, `storyforge/web/`).
- **State:** complete and offline-runnable end-to-end; real-provider paths unverified (no tests), default model strings need checking.
- **Notes:** aspect table already covers 9:16 / 1:1 / 4:5. Its stage-cache/"regenerate one unit" model maps naturally onto Inngest steps. Overlaps bookshelf on captions/ffmpeg — bookshelf's TS versions fit the new stack; storyforge's ducking/loudnorm/crossfade features should be folded in.

### tropesite — KEEPER (extract content-generation + compliance logic only)

- **Purpose:** Zero-dependency Node CLI that turns a SQLite catalogue of your books + approved comparable titles into a static SEO/AI-search-optimized recommendation site (trope hubs, "books like X", per-book pages) with Amazon affiliate links.
- **Stack:** Node ≥22.5 ESM, zero third-party deps (`node:sqlite`, `node:http`, `fetch`); static HTML out; deploys via wrangler/vercel CLIs.
- **External APIs / key references** (**no hardcoded secrets**): Anthropic (`src/config.mjs:68`, used in `src/content-engine.mjs:28-42`); Amazon Associates tags (`src/config.mjs:53-64`, `src/amazon.mjs`); optional email-capture endpoint.
- **Valuable parts:**
  - `src/content-engine.mjs:12-24` — grounded-marketing-copy system prompt ("Use ONLY the facts provided… Never invent plot points… never prices/ratings") + per-page-type JSON prompt builders (:136-175) + LLM-output normalization/backfill (:328-352) + seeded deterministic fallback composer (:177-320).
  - `src/audit.mjs` — compliance audit gate (affiliate disclosure, link compliance, canonical/OG/JSON-LD, thin content) that blocks deploy.
  - `src/jsonld.mjs` — schema.org Book/ItemList/FAQPage builders; `src/robots.mjs:17-27` — AI-crawler allowlist.
  - Incremental regeneration via source hashing (`src/generate.mjs` `--changed`).
- **State:** complete MVP on sample data (unit tests for the compliance-critical functions). Cover images via PA-API documented but not implemented.
- **Notes:** its `src/content-engine.mjs` is a coincidental name — it is NOT the new app and contains no spec. Human-approval workflow for comps (proposed→approved/rejected) is another vote for editorial gating as a first-class concept.

### thriller-concept-project — NOT AN APP

Market-research/concept package for a thriller series produced by an earlier multi-agent session. Locally only `README.md` and `07-governance/decision-log.md` exist (the README references ~20 deliverables that aren't in this folder). Nothing to extract into the engine codebase; its *outputs* (positioning, blurbs) would be content you upload, not code. Excluded from the extraction map.

---

## Slideshow recommendation — BLOCKED, with a provisional finding

The four slideshow apps (slideshow-generator, slideshow-creator, tslides, bookslide) are not in this folder, so the head-to-head prompt/renderer comparison cannot be done yet. bookslide isn't in your visible GitHub repos at all.

What the local audit already shows, to be tested against that family once available:

- **Best text-overlay renderer so far: pinfactory** (`pinfactory/images.py` + `themes.yaml`) — auto-fit within width and height, scrim/vignette legibility, semantic theming, deterministic seeds + content-hash dedup, and six ready slide-template families.
- **Best Gemini-image generation patterns so far: storyforge** (strict scene JSON + character-consistency injection + QC retry) combined with **bookshelf** (cover-fidelity prompt + automated cover-check QA gate).
- So the provisional shape of Module #1 is already "a combination": Gemini generation with storyforge/bookshelf's fidelity+QC patterns, overlay/theming from pinfactory (ported to the new stack — e.g. satori/canvas/sharp in TS, to be decided by the spec), slide templates seeded from pinfactory's six variants. **The four dedicated slideshow apps may beat any of this — they must be compared before committing.**

---

## Extraction map (provisional — destinations assume the architecture summary; re-check against the real spec)

| What | Source | Lands in |
|---|---|---|
| Post Bridge client (upload, create, analytics, idempotency guard) | bookshelf `src/lib/posting/postbridge.ts`, `run.ts` | `src/services/posting/` |
| Post Bridge stagger/interleave batch logic | book-social-media `publisher.py:158-215` | `src/services/posting/` (as Inngest scheduling input) |
| Posting-window scheduler (windows, caps, round-robin, DST-safe) | bookshelf `src/lib/automation/scheduler.ts` | `src/services/scheduling/` (ported to Inngest) |
| Anti-spam rules (rolling caps, URL spacing, quarantine, circuit breaker) | pinfactory `pinfactory/scheduler.py` | `src/services/scheduling/` |
| Text-overlay engine (auto-fit, wrap, tracking, scrim, compositing) | pinfactory `pinfactory/images.py` | `src/services/rendering/` (port to TS) |
| Semantic theme system (palette + font roles + deep-merge defaults) | pinfactory `themes.yaml`, `pinfactory/themes.py` | `src/services/rendering/themes` + workspace brand kits |
| Slide template set (headline, quote, checklist, comp, stats, trope-hook) | pinfactory `images.py:410-691` | `src/modules/slideshow/templates/` |
| Card renderer variants + platform canvas sizes | book-social-media `image_generator.py` | `src/modules/slideshow/templates/` (merge with above) |
| Cover-fidelity image prompt | bookshelf `src/lib/render/prompt.ts` | `src/services/ai/prompts/` |
| Visual QA gate (transcribe-and-vote cover check) | bookshelf `src/lib/render/cover-check.ts` | `src/services/ai/qa/` |
| Style-recipe distillation (brand kit from reference images) | bookshelf `src/lib/recipe/prompt.ts`, `vision.ts` | `src/services/ai/` + asset library |
| Character-consistency injection + drift QC retry | storyforge `stages/images.py`, `stages/cast.py`, `backends/qc.py` | `src/services/ai/` (image gen) |
| Scene-decomposition prompt + JSON validator | storyforge `backends/llm.py` | `src/services/ai/prompts/` |
| Kinetic ASS caption generator (10 effects) | bookshelf `src/lib/render/ass.ts` | `src/services/rendering/captions` |
| Karaoke caption cues + TTS word-timestamp handling | storyforge `captions.py`, `backends/tts.py` | `src/services/rendering/captions` (merge) |
| ffmpeg still→video (Ken Burns + burned captions) | bookshelf `src/lib/render/ffmpeg.ts` | `src/services/rendering/video` |
| ffmpeg assembly extras (xfade, ducking, loudnorm) | storyforge `ffmpeg.py` | `src/services/rendering/video` (port features in) |
| Timeline logic (durations, zoom alternation, cut-vs-fade) | storyforge `stages/timeline.py` | `src/modules/` (video/slideshow) |
| Book-marketing post prompt + platform guidelines + 10 content types | book-social-media `post_generator.py:36-113` | `src/services/ai/prompts/` |
| BookTok caption prompt (hook + 5 hashtags) | bookshelf `src/lib/captions/generate.ts` | `src/services/ai/prompts/` |
| Pinterest SEO copy prompt + per-template angles | pinfactory `copy_gen.py` | `src/services/ai/prompts/` |
| Grounded no-fabrication copy prompt + JSON repair/backfill | tropesite `src/content-engine.mjs` | `src/services/ai/prompts/` + LLM-JSON hardening util |
| LLM JSON fence-strip/repair | book-social-media `post_generator.py:116-143` | same hardening util |
| DB schema patterns (cards state machine, event_log, automation_configs, encrypted mcp_tokens) | bookshelf `src/lib/db/schema.ts` | Drizzle schema in new app |
| Quote extraction from manuscripts | book-social-media `book_reader.py:128-155` | `src/services/ai/` (source-text ingestion) |
| Board/collection targeting strategy | pinfactory `boards.py` | `src/services/posting/` (platform metadata) |
| Approval-gate lifecycle (draft→approved→published) + review gallery UX | pinfactory `review.py` / `copy_gen` statuses; storyforge `review.py`; tropesite comps flow | core content model + review UI of new app |
| OFL fonts + role documentation | pinfactory `fonts/*.ttf`, `FONTS.md` | asset library upload (workspace-shared) |
| Compliance audit engine + JSON-LD + AI-crawler robots | tropesite `src/audit.mjs`, `jsonld.mjs`, `robots.mjs` | only if an SEO-site module makes the cut (spec question) |

Explicitly **not** carried: pinfactory's Pinterest v5 client (Post Bridge covers it; keep as reference for OAuth refresh/backoff), bookshelf's pg-boss/cron plumbing (replaced by Inngest), tropesite's SQLite/static-deploy machinery, bookshelf's dead Replicate render path, all Python CLI scaffolding.

---

## Consolidated external APIs / keys the new app will need (from audited apps only — will grow as the other 18 are audited)

| Service | Used for | Seen in |
|---|---|---|
| **Post Bridge** | all posting + analytics | bookshelf, book-social-media (⚠️ bookshelf has TWO keys: owner + shared) |
| **Anthropic** | copy/script generation | all five keepers |
| **Google Gemini** | image gen (slideshow), captions, vision QA | storyforge, bookshelf (partly via Vercel AI Gateway OIDC) |
| **OpenAI** | gpt-image-1 fallback, Whisper transcription | bookshelf |
| **Higgsfield** | primary image gen (MCP OAuth + legacy key) | bookshelf |
| **Replicate** | Demucs vocal separation | bookshelf |
| **ElevenLabs** | TTS narration | storyforge |
| **Resend** | failure notification email | bookshelf |
| **Supabase** (replaces Neon Postgres + Vercel Blob + next-auth) | DB/auth/storage | target stack |
| **Pinterest v5 OAuth** | only if direct pinning is kept alongside Post Bridge | pinfactory |
| **Amazon Associates tags** | affiliate links (SEO-site module only) | tropesite |
| Internal secrets | `CRON_SECRET` (→ Inngest signing key), `TOKEN_ENCRYPTION_KEY` (keep this pattern) | bookshelf |

**Security:** no hardcoded keys were found in any of the six audited projects — everything reads from env, `.env` files are gitignored, examples contain placeholders only. Nothing to rotate from these repos. (The 18 unaudited apps still need the same check.)

---

## Things the architecture summary doesn't mention that the audit surfaced

1. **Editorial approval gates.** Three apps independently converged on draft→approve/reject→publish with a review gallery (pinfactory, storyforge, tropesite). This should be a first-class state machine in the core content model, not a module afterthought.
2. **A theming/brand-kit system.** pinfactory's semantic-palette + font-role YAML and bookshelf's AI "style recipes" are two halves of one feature: workspace brand kits in the asset library that both renderers and image-gen prompts consume.
3. **Multi-pen-name support.** pinfactory models multiple author brands with per-brand theme/voice; the multi-user workspace design should decide whether "pen name" = workspace or a sub-entity within one.
4. **Anti-spam/platform-safety rules** (rolling caps, per-URL spacing, quarantine, circuit breakers) as a shared scheduling concern, not per-module logic.
5. **Automated visual QA** (bookshelf's cover-check, storyforge's face-drift QC) — a generate→verify→retry loop the image service should own.
6. **Content types not in an obvious module list:** narrated long-form video (storyforge), music-transcription kinetic-caption videos (bookshelf), SEO/affiliate static sites (tropesite), manuscript ingestion → quote mining (book-social-media). Which of these become modules vs get dropped is a spec decision.
7. **Deterministic regeneration** (seeded variants, content-hash dedup, hash-based incremental regen) — cheap to keep, prevents duplicate-content posting.
8. **Post Bridge shared-key hazards** — bookshelf documents `/v1/post-results` failing on deep pagination and a shared key returning other apps' posts. The multi-user engine needs per-workspace keys or defensive filtering.

---

## Recommended build order (preliminary — finalize after the other 18 audits + real spec)

1. **Core scaffold:** Supabase (auth/DB/storage) + Drizzle schema seeded from bookshelf's `cards`/`event_log`/`automation_configs` patterns + Inngest wiring + workspace/user model.
2. **Posting service:** port bookshelf `postbridge.ts` (it's already TS and battle-tested) with the idempotency guard; per-workspace key handling.
3. **Scheduling service:** bookshelf windows/caps/round-robin + pinfactory anti-spam rules as Inngest functions.
4. **Asset library:** storage buckets + brand kits (fonts from pinfactory, palettes/font-roles, style recipes), workspace-shared vs per-user-private.
5. **Slideshow module (Module #1):** Gemini image gen (character/cover fidelity + QA gate) + ported overlay renderer + template set. **Gate: compare against the four dedicated slideshow apps first.**
6. **Copy/caption service:** merged prompt library (platform guidelines, content-type taxonomy, grounded-copy rules) + LLM-JSON hardening.
7. **Approval/review UI** across all content types.
8. Later modules per spec priority (video/captions, memes, SEO site, …) once the remaining audits say what exists.

---

## Blockers & questions — need answers before going further

1. **Where is `content-engine-architecture.md`?** It is not in this folder or anywhere in this repo. Paste it, commit it, or tell me which repo it lives in.
2. **May I add the 16 GitHub repos to this session and clone them?** They're all in your account (`ccas77/…`): slideshow-generator, slideshow-creator, tslides, tinkerboxxx, meme-maker, ai-ugc-pipeline, aesthetic, book-video-bot, inkwell, simplepostr, authorbids, my-toolkit, dictabook, Siggy, trialreels, facebook-library. This unblocks the slideshow head-to-head (3 of the 4 family members are there) and the rest of the inventory.
3. **The 7 I can't find anywhere:** aimoviebot, kinetic, quadrants, reposter, socialato, **bookslide** (slideshow family!), public. Give me URLs, or say skip.
4. **Is the local `bookshelf` folder the same code as the Vercel project `bookshelf`?** It matches the name and is clearly one of your apps, but confirm it's current.
5. **Scope check:** should `video-generator`, `book-boyfriend`, `book-writer-app`, `bookpulls-runbook` (in your GitHub) or the four extra local projects' *products* be considered for the module list?
