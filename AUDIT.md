# App Audit & Consolidation Proposal

**Date:** 2026-07-10 (updated same day — second pass)
**Status: 12 of 24+ projects fully audited.** First pass covered the 6 projects in this repo; this second pass adds the 6 apps pulled from GitHub (slideshow-generator, slideshow-creator, tslides, aesthetic, tinkerboxxx, facebook-library). The slideshow head-to-head is now done for 3 of the 4 family members (bookslide's source is unreachable — see below).

Remaining blockers (details in [Blockers](#blockers--questions--need-answers-before-going-further)):

1. **`content-engine-architecture.md` is still missing** — destination columns below remain based on the summary in your instructions.
2. **8 private GitHub repos** (meme-maker, book-video-bot, inkwell, trialreels, siggy, dictabook, simplepostr, authorbids) are pending session access — the add-repo approval flow is flaky; one repo per user message ("add ccas77/NAME") is what worked for tslides and my-toolkit. **ccas77/bookshelf does not exist on GitHub** — the Vercel project (bookshelf.bookpulls.com) is CLI-deployed from the owner's machine, and the copy in this monorepo is the only auditable source.
3. **7 Vercel projects have no reachable source** — traced via Vercel deployment metadata: kinetic, quadrants, reposter, socialato (CLI-deployed from your local machine; source only there), bookslide (CLI-deployed by Codex, no git metadata), public (static shell), aimoviebot (misconfigured project pointed at this monorepo; every build errors — nothing to audit, candidate for deletion).

> ### ⚠️ URGENT SECURITY — rotate now
> **`slideshow-generator` is a PUBLIC GitHub repo and has a live production `CRON_SECRET` committed in `.claude/settings.local.json`** (appears ~20× in allow-listed curl commands, alongside the deployed URL `slideshow-generator-nine.vercel.app`). That token gates the cron AND admin routes (`clear-scheduled`, `migrate-configs`, …) — anyone on the internet can currently fire them. Actions: (1) rotate `CRON_SECRET` in Vercel, (2) delete the file and rewrite git history or make the repo private, (3) check Vercel logs for unexpected cron/admin hits. None of the other 11 audited repos have committed secrets.

---

## Inventory

### The 24 Vercel apps

| App | Where it is | Audited | Verdict |
|---|---|---|---|
| bookshelf | ✅ In this folder | ✅ | **KEEPER** (strongest single codebase) |
| slideshow-generator | ✅ cloned (public repo) | ✅ | **KEEPER (prompt IP + renderer)** — single-user original; superseded by creator for app shell |
| slideshow-creator | ✅ cloned (public repo) | ✅ | **KEEPER** — multi-user evolution of generator (bookpulls.com) |
| tslides | ✅ cloned (added to session) | ✅ | **KEEPER** — most production-mature; closest stack to target |
| aesthetic | ✅ cloned (public repo) | ✅ | **KEEPER** — quote-video renderer + prompt bank |
| tinkerboxxx | ✅ cloned (public repo) | ✅ | **KEEPER** — ops/fleet dashboard + Post Bridge verification |
| facebook-library | ✅ cloned (public repo) | ✅ | **KEEPER (data + ingest patterns)** — 999-post performance library |
| meme-maker | GitHub (private) — pending access | ❌ | pending |
| ai-ugc-pipeline | GitHub (private) — pending access | ❌ | pending |
| book-video-bot | GitHub (private) — pending access | ❌ | pending |
| inkwell | GitHub (private) — pending access | ❌ | pending |
| simplepostr | GitHub (private) — pending access | ❌ | pending |
| authorbids | GitHub (private) — pending access | ❌ | pending |
| my-toolkit | ✅ cloned (added to session) | ✅ | **KEEPER — the canonical shared-patterns library** (see audit below; contains the Inkwell v2 SPEC) |
| dictabook | GitHub (private) — pending access | ❌ | pending |
| siggy | GitHub (private) — pending access | ❌ | pending |
| trialreels | GitHub (private) — pending access | ❌ | pending |
| aimoviebot | Vercel project mislinked to this monorepo; all builds ERROR | n/a | **DELETE the Vercel project** — no codebase exists |
| kinetic | CLI-deployed from your machine (same local commit as quadrants) | ❌ | source only on your machine — push to GitHub to audit |
| quadrants | CLI-deployed from your machine | ❌ | source only on your machine |
| reposter | CLI-deployed from your machine (branch `master`, "PB" = Post Bridge) | ❌ | source only on your machine |
| socialato | CLI-deployed from your machine (has custom domain socialato.com) | ❌ | source only on your machine |
| bookslide | CLI-deployed by Codex, no git metadata (⚠️ slideshow family) | ❌ | source only on your machine |
| public | CLI-deployed static shell, no git metadata | ❌ | probably just hosted assets — confirm & likely delete |

### Other projects found in this folder (not on the Vercel list)

| Project | Verdict |
|---|---|
| book-social-media | **KEEPER** — complete Claude→Pillow→Post Bridge posting pipeline |
| pinfactory | **KEEPER** — best Python text-overlay renderer; anti-spam scheduler |
| storyforge | **KEEPER** — Gemini image gen w/ character consistency; ffmpeg video engine |
| tropesite | **KEEPER (partial)** — grounded-copy prompts + compliance audit only |
| thriller-concept-project | **NOT AN APP** — book-concept research package; nothing to extract |

### Other GitHub repos visible in your account (not on the list, not cloned)

`video-generator`, `book-boyfriend`, `book-writer-app`, `bookpulls-runbook`. Tell me if any should be in scope.

---

## Per-app audits — the 6 GitHub apps (second pass)

### slideshow-generator — KEEPER for its prompt IP + renderer (single-user original of the family)

- **Purpose:** turns book quotes/excerpts into 1080×1920 TikTok/IG slideshows and Top-N book-list videos — Gemini background images, censored text overlays, manual or cron posting via Post Bridge. Deployed at slideshow-generator-nine.vercel.app.
- **Stack:** Next.js 14, React 18, Tailwind 4. **Upstash Redis is the only database** (books, excerpts, configs, drafts, caches, locks, post-logs). sharp + resvg + ffmpeg-static; fonts embedded base64 and written to `/tmp` with a generated fontconfig (the serverless-fonts workaround). 3 Vercel crons.
- **External APIs** (all env; see security box for the committed CRON_SECRET): Gemini (`lib/gemini.ts`), Vercel AI Gateway (`lib/image-gen.ts` — failover `gemini-2.5-flash-image` → `imagen-4.0` → `dall-e-3`), Anthropic (`claude-sonnet-4-6`), Post Bridge (`lib/post-bridge.ts`), PublisherChamp analytics, Resend, Upstash, Apify (health-check only).
- **Crown jewels:**
  - `app/api/generate-slides/route.ts` — the **passage→beats slide-planning prompt** (Claude): ≤24 one-line slides, "DO NOT write chronologically", no character names ("Not 'Dante' — 'your mafia boss'"), **backloading** (punch word lands at end of each line), author dialogue is sacrosanct, second-person POV, "End on the Turn". Plus `tighten` (cut-only editor) and `truncate` (best ≤10 slides for IG) actions.
  - The **censorship engine** injected into that prompt: leetspeak map (`c0p, ja!l, d£ath, k!ss…`) + emoji substitutions (`😻 🐓 👅 💥 💦`) to dodge platform filters; user-extensible.
  - `lib/booktok-prompt.ts` + `topn-booktok` — the viral **Top-N BookTok copy generator** (titles/captions/imagePrompts, Punchline Rule, per-genre notes, 5-hashtag format, ephemeral prompt caching, server-side dedup).
  - `lib/render-slide.ts` — server text overlay via **sharp + Pango markup** (Inter Bold + NotoColorEmoji written to `/tmp`), gradient scrim, hand-rolled 48-layer outline stroke; `renderCoverSlide`, `renderTextOverlay` (transparent layer for video).
  - `lib/render-topn-slide.ts` — **TikTok safe-zone aware** layouts (SAFE_TOP=280 / SAFE_BOTTOM=480), boxed-text style.
  - `lib/render-video.ts` — slides→MP4 with per-slide durations, looped audio, optional Ken-Burns moving background.
  - `lib/post-bridge.ts` — hardened client: `POST /v1/posts` deliberately non-retryable (2026-05-08 duplicate-post incident), post-verification helpers that work around Post Bridge's silently-ignored `social_account_id` filter (2026-06/07 incident).
  - Every image prompt is wrapped in a **no-text guard** ("NO text, words, letters, or writing anywhere") because text is composited later — a rule the new module should keep.
- **State:** complete, production, actively maintained (incident comments dated through 2026-07-04; zero TODOs). Bugs: `generate-slides` auth gates on `process.env.PASSWORD` instead of `APP_PASSWORD` (route may be effectively open); client canvas preview renders differently from server output; legacy `app/api/generate` bypasses the gateway failover and the no-text guard.
- **Consolidation:** take the prompt library and renderers; leave Redis-only storage and the single shared `APP_PASSWORD`.

### slideshow-creator — KEEPER (multi-user evolution of generator; bookpulls.com)

- **Purpose/stack:** same product as generator, SaaS-ized: Google OAuth + JWT sessions + invite system + admin role + per-user Redis namespacing (`u:${userId}:…`), middleware auth gate. Still Upstash-Redis-only, no SQL.
- Mirrors generator's prompt IP, renderers, Post Bridge client, cron pipeline, stuck-detector, daily digest. Its single commit message literally says "mirroring slideshow-generator", and CLAUDE.md calls it "distinct from the single-user Generator app".
- **Extra:** `check-dupes.mjs` (Redis post-log duplicate checker), status reconciliation (planned/attempted/confirmed with `unconfirmed` list).
- **State:** complete, production-live. Rough edges: resvg declared but unused; three divergent Gemini model lists (one missing the no-text guard); CLAUDE.md says 30-min cron but vercel.json is hourly. Minor SSRF surface in `analyze-slide`/`describe-image`/`fetch-image-url` (fetch arbitrary user URLs server-side).
- **Consolidation:** of the two Redis siblings, creator is the shell with multi-user isolation and hardening; but the new engine replaces both shells anyway — what survives is the shared prompt/render IP (identical files; diff both repos for newest revisions before lifting).

### tslides — KEEPER (most production-mature; closest to the target stack)

- **Purpose:** end-to-end BookTok slideshow pipeline built around **competitive cloning**: mirror a TikTok account via Apify → Claude vision reverse-engineers each slide into a regenerable image prompt + reworded text + style hints → regenerate hook images → composite text → assemble carousel/MP4 → schedule via Post Bridge with full cron automation.
- **Stack: the closest of all 12 to the target** — Next.js 16, **Neon Postgres + Drizzle (20 migrations)**, Vercel Blob, two-phase Vercel cron automation, Resend alerts.
- **External APIs:** Anthropic (`claude-sonnet-4-6` vision + copy), Higgsfield via MCP OAuth (primary image gen, `gpt_image_2`), OpenAI (`gpt-image-2` fallback), **Gemini 2.5 Flash Image via AI Gateway as third fallback — chosen because its safety filter tolerates romance/dark-romance imagery OpenAI rejects** (key design insight for a Gemini-first module), Apify (TikTok scrape), Post Bridge, Resend.
- **Crown jewels:**
  - `lib/analyze.ts` — **vision-to-prompt reverse engineering**: produces `prompt` + 3 alt prompts, `extractedText` + 3 rewordings, and style hints (fontStyle/textColor/textPosition/textAlignment). "Always describe the scene as a candid photograph… NEVER use the words 'book cover', 'poster', 'typography'." Two alt-variant modes (broad vs superficial w/ identity preservation).
  - `lib/overlay.ts` — **fontconfig-free text overlay**: text rendered as SVG `<path>` glyphs via `text-to-svg` (bundled Inter-Bold.woff) composited by sharp — deliberately avoids canvas/satori/Pango so librsvg needs no fontconfig. 18-char greedy wrap, top/middle/bottom + alignment, hex fill + black stroke with `paint-order`.
  - 3-tier image fallback with `isContentRejection()` routing (`lib/slideshow.ts:296-386`, `lib/openai-image.ts`).
  - **LRU anti-repeat picker** (`pickFresh`) used for prompts/texts/books/covers/excerpts/audio — fixed a real "same audio 3 days running" bug.
  - `lib/automation.ts` — **two-phase cron dispatcher** (hourly enumerate → per-fire workers with own 300s budgets) + 5-min transient-retry sweep with a transient-vs-permanent error classifier.
  - Post Bridge client with `tiktok: {draft:false, is_aigc:false}` (suppresses the AI badge that tanks reach — honest caveat in comments).
  - Slide structure: fixed `[hook, …excerpts, cover]`, hook `generate`/`upload` modes, all slides normalized to 1080×1920 contain-fit.
- **State:** complete/production-grade; zero TODOs; ~25 operational diagnostic scripts; real accounts referenced. Security notes: `lib/crypto.ts` falls back to `DATABASE_URL` then a literal dev string if `TSLIDES_TOKEN_SECRET` unset (set it in prod); generated Blob assets are public-if-URL-known.
- **Consolidation:** its architecture (Drizzle schema, automation, blob layout) is the best structural template for Module #1; README points at `my-toolkit` (`patterns/apify-tiktok`, `patterns/postbridge`) as the canonical shared code — audit that repo next.

### aesthetic — KEEPER (quote-video renderer + prompt-bank pattern)

- **Purpose:** per-book "content factory" for ≤15s sepia-graded, beat-synced quote videos: captions + song + AI still-image bank → FFmpeg MP4 → Post Bridge autopost. The **video** sibling, distinct from the slideshow apps.
- **Stack:** Next.js 15.5; **no database** — JSON + media in Vercel Blob (books index, post queue, render manifests); ffmpeg-static on serverless.
- **External APIs:** Higgsfield via a **Clerk web-session cookie "unlimited mode"** client (`lib/higgsfield-clerk.ts` — 4-min cached single-flight JWT minting, 401 retry, cookie scrubbed from error paths; the cookie in env is a full account credential — handle accordingly); default model `nano-banana-2`. A dead legacy OAuth+MCP subsystem remains. Post Bridge (notably `is_aigc: true` here), Resend n/a.
- **Crown jewels:** `lib/render-server.ts` (sepia `eq`/`curves` grade + `drawtext` captions from textfile w/ custom font, 30-char wrap, concat-demuxer slideshow→video, center-crop 1080×1920); `lib/bank.ts` (shared STYLE preamble + 8 categorized subject prompts — the cleanest prompt-template pattern found); `lib/beat-detect.ts` (`cutIntervalMs(bpm)` 250-400ms cut sweet spot); `lib/render-planner.ts` (caption×song pair dedup round-robin); character-reference routing by `appearsIn` (male/female/both) to avoid feature leakage.
- **State:** deployed and working end-to-end, with dead-code baggage (whole OAuth/MCP layer) and two latent bugs (`generate-still` falsely gates on `ANTHROPIC_API_KEY`; `detectTempo` is browser-only).
- **Consolidation:** the unique asset is the FFmpeg grade+drawtext+beat-sync pipeline — a video module capability none of the slideshow apps have. Its Post Bridge client is self-described as "Ported from my-toolkit/patterns/postbridge".

### tinkerboxxx — KEEPER (the fleet control-plane prototype)

- **Purpose:** launchpad + ops dashboard over the whole app fleet: Manager (fans out to sibling apps' `/api/status` and cross-checks against Post Bridge), Apps launcher, Ideas store, Stats (PB analytics), and an image→prompt AI tool. **This is a mini prototype of the content engine's control plane.**
- **Stack:** React 18 + Vite SPA, Vercel serverless functions, **Supabase** (auth + Postgres + Storage) — the only audited app already on Supabase.
- **External APIs:** Supabase, Post Bridge, OpenAI (`gpt-image-1` icons, `gpt-4o-mini` vision), Resend, per-app `CRON_SECRET` bearer registry (`APP_REGISTRY` env).
- **Crown jewels:** `api/analytics.js` — production PB client with promise-chained ~8 req/s throttle, 429 retry via `rate_limit.reset_ms`, safe pagination; `api/aggregate.js` `crossCheckApp`/`diagnose` — reconciles app claims vs PB reality, classifying confirmed / queued / rejected / **missing-from-PB (silent failure)**; `api/cron/dead-account-check.js` — daily 0-views alerting (skips Facebook, PB doesn't sync it); `api/image-to-prompt.js` — a 60-120-word **nano-banana-tuned image→prompt** system prompt with strict "NO INTERPRETATION" rules; `api/generate-icon.js` — app-icon prompt. Its `CONN_LABEL` badge registry enumerates the exact integration roster of the fleet (Post Bridge, Apify, Higgsfield, OpenAI, Claude, Gemini, R2, Blob, Database, Resend, KV).
- **State:** complete, actively iterated (battle-scar comments about PB rate caps and deep-page 500s). README stale.
- **Consolidation:** absorb the Manager cross-check + analytics client as the new engine's ops/observability view rather than rebuilding it.

### my-toolkit — KEEPER (the canonical shared-patterns library; contains the only architecture spec found)

- **What it is:** a docs-first pattern library, not a runnable app — one 48 KB `CLAUDE.md` master runbook + `patterns/` with 12 reference patterns (~3,300 lines). This is the repo tslides and aesthetic cite as the canonical source of their Post Bridge/Apify code. **No hardcoded secrets.**
- **🔑 `patterns/inkwell-v2/SPEC.md` — the closest thing to the missing `content-engine-architecture.md`.** A full consolidation plan, but scoped to exactly TWO apps (slideshow-generator + slideshow-creator → one monorepo, "Inkwell"): Turborepo layout (`apps/web` + `packages/{db,rendering,postbridge,automation,types}`), a complete Postgres/Drizzle schema that **separates user-editable `automation_configs` from cron-managed `automation_state`** (fixes read-modify-write races), append-only audit logs, one generic `AutomationHandler` interface + single cron dispatcher replacing 5 duplicated cron files, and a feature-parity migration checklist. It predates the fleet-wide content-engine framing (no Inngest, no workspace asset library, no Gemini module) — a seed for the real spec, not the spec itself. It also carries a "NEVER start building without EXPLICIT permission" guard.
- **The 12 patterns:** postbridge (canonical typed client), postbridge-analytics (the **most hardened** PB networking anywhere in the fleet: ~8 req/s promise-chain self-throttle, 429 retry driven by the response's `rate_limit.reset_ms`, deep-page-500 graceful degradation, MAX_PAGES ceiling, the analytics→username join), apify-tiktok (canonical scraper client + the three slideshow-data traps + "use `clockworks~tiktok-profile-scraper` to dodge the $0.50 minimum charge"), higgsfield-mcp (full OAuth 2.1/DCR/PKCE with the serverless PKCE-cookie trick), ai-riffed-captions (Gemini caption prompt + 5 proven prompt-design rules), caption-overlay (Claude caption bank, doc-only, removed from ai-ugc-pipeline 2026-06-20), word-timed-captions (Whisper→ASS→libass runbook: **`@ffmpeg-installer/ffmpeg`, NOT `ffmpeg-static`** — static lacks drawtext/libass), chroma-key, automation-overview (bulk-endpoint-over-N-fetches rule for 50+ accounts), account-health-chip, plus schema sketches.
- **Decision-changing findings:**
  - **Post Bridge has NO workspace isolation** (CLAUDE.md:190) — one key sees every connected account across all apps. The multi-user engine MUST enforce its own per-user `allowedAccountIds` allow-list (default deny). Hard architectural constraint.
  - **PB feature gaps:** no first-comment, no comment/DM automation, no per-platform `scheduled_at` — anything needing IG first-comment must call the native API post-publish.
  - **ffmpeg contradiction to resolve:** the SPEC recommends `ffmpeg-static`, but the captions pattern proves it can't burn captions. Standardize on `@ffmpeg-installer/ffmpeg`.
  - **Doc drift:** the richest guidance (Apify cursor model, PB platform-config tables) lives only in CLAUDE.md, not the `.ts` files — apps that copied just the code are missing hardening. Treat my-toolkit's CLAUDE.md as source of truth when consolidating.
  - The new engine's PB client should be **analytics.js's fetch core + post-bridge.ts's typed surface**, not either alone.

### facebook-library — KEEPER for data + ingest patterns

- **Purpose:** browse/sort/search/OCR the top 999 posts scraped (via Apify) from the "My Dark Romantasy" Facebook page, with one-click "rewrite for another genre" handoff to Claude.
- **Stack:** Next.js 14, no backend/DB — `posts.json` bundled at build; tesseract.js OCR in-browser; Edge image proxy that defeats FB's referrer block (host-allowlisted to fbcdn).
- **Crown jewels:** `posts.json` — a **performance-ranked content library** (999 posts, rank/date/type/likes/comments/shares/views/engagement; ~50/50 photo "quote cards" vs reels; range 2025-12→2026-05) — a goldmine of proven hooks for the asset library's "what worked" view; the genre-rewrite prompt (`openRewrite`: "keep the same emotional hook, format, and tone, but swap genre references… Give me 3 variations") — exactly the cross-account repurposing workflow the engine needs, currently manual, should become a server-side Claude call; OCR batch pipeline w/ cache + CSV export.
- **State:** complete for its scope, but **data is time-bombed**: the fbcdn URLs are signed and expiring, and the `ocr` field was never populated. **Migrate now**: download/re-host the images and run OCR at ingest (the real hook text lives in the images; captions are mostly emoji/hashtags). No secrets, no PII beyond public page/post ids.

---

## Per-app audits — the 6 local projects (first pass)

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

### pinfactory — KEEPER (best Python text-overlay renderer)

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

Market-research/concept package for a thriller series produced by an earlier multi-agent session. Locally only `README.md` and `07-governance/decision-log.md` exist. Nothing to extract into the engine codebase. Excluded from the extraction map.

---

## Slideshow head-to-head (3 of 4 audited; bookslide unreachable)

**Lineage:** slideshow-generator (single-user original) → slideshow-creator (multi-user SaaS mirror, bookpulls.com). tslides is a separate, more advanced concept (clone-a-competitor pipeline). bookslide's source exists only on your machine (Codex CLI deploy) — its Vercel domain (`i-would-like-to-build-an.vercel.app`) suggests an early prompt-built prototype; likely superseded, but unverified.

| Dimension | slideshow-generator / creator | tslides |
|---|---|---|
| Slide *text* planning | ★ **Best prompt IP**: passage→beats GUIDE prompt (backloading, tropes-not-names, dialogue-sacrosanct, censorship engine), tighten/truncate actions, Top-N BookTok copy generator | None — text comes from reverse-engineering competitor slides + reword variants |
| Image prompting | No-text guard wrapper; image→prompt describers | ★ **Best**: full vision-to-prompt reverse engineering w/ style hints + identity-preserving variants |
| Image generation | Gateway failover (Gemini→Imagen→DALL-E) | 3-tier w/ content-rejection routing (Higgsfield→OpenAI→**Gemini for NSFW tolerance**) |
| Text overlay | sharp+Pango (emoji support via Noto, Pango wrapping, safe-zone Top-N renderer) | ★ Simplest/most robust: SVG-glyph-paths via text-to-svg (no fontconfig at all) |
| Storage/stack | Upstash Redis only — must be replaced | ★ Drizzle + Neon + Blob — nearly the target stack already |
| Automation | 30-min/hourly cron phases, stuck-detector, digest | ★ Two-phase dispatcher + transient-retry classifier + LRU anti-repeat |
| Posting | Hardened PB client (non-retryable POST, verification workarounds) | Same client family + `is_aigc:false` handling |

**Recommendation for Module #1:** structure and schema from **tslides**; slide-planning + censorship + Top-N prompt IP from **generator/creator** (diff the two for newest revisions); text overlay — pick between tslides' SVG-path approach (simplest) and generator's Pango approach (emoji + auto-wrap); keep generator's universal no-text image guard; theming from **pinfactory**; QA gates from **bookshelf/storyforge**. If bookslide surfaces, check it before locking the plan, but the bar is now high.

---

## Extraction map (provisional — destinations assume the architecture summary; re-check against the real spec)

| What | Source | Lands in |
|---|---|---|
| Post Bridge client (upload, create, analytics, idempotency guard) | bookshelf `src/lib/posting/postbridge.ts`; cross-check generator/tslides variants + `my-toolkit/patterns/postbridge` (pending) | `src/services/posting/` |
| PB rate-limited analytics client + pagination hazards | tinkerboxxx `api/analytics.js` | `src/services/posting/analytics` |
| Post verification / silent-failure cross-check | tinkerboxxx `api/aggregate.js` (`crossCheckApp`, `diagnose`); generator `verifyPostScheduled` | `src/services/posting/` (post-publish verification step) |
| Post Bridge stagger/interleave batch logic | book-social-media `publisher.py:158-215` | `src/services/posting/` (as Inngest scheduling input) |
| Posting-window scheduler (windows, caps, round-robin, DST-safe) | bookshelf `src/lib/automation/scheduler.ts` | `src/services/scheduling/` (ported to Inngest) |
| Two-phase cron dispatcher + transient-retry classifier | tslides `lib/automation.ts` | `src/services/scheduling/` (Inngest shape) |
| Anti-spam rules (rolling caps, URL spacing, quarantine, circuit breaker) | pinfactory `pinfactory/scheduler.py` | `src/services/scheduling/` |
| LRU anti-repeat content picker | tslides `lib/slideshow.ts` (`pickFresh`) | `src/services/scheduling/` or content selection util |
| Dead-account / zero-views alerting | tinkerboxxx `api/cron/dead-account-check.js` | `src/services/observability/` |
| Fleet status cross-check dashboard | tinkerboxxx Manager + `api/aggregate.js` | ops/observability view of new app |
| Slide-planning prompt (passage→beats, tighten, truncate) + censorship engine | slideshow-generator/creator `app/api/generate-slides/route.ts` | `src/modules/slideshow/` prompts |
| Top-N BookTok copy generator | generator/creator `lib/booktok-prompt.ts` | `src/services/ai/prompts/` |
| Vision-to-prompt reverse engineering + variant prompts | tslides `lib/analyze.ts`, `app/api/text-variants/route.ts`; tinkerboxxx `api/image-to-prompt.js` (nano-banana-tuned); creator `analyze-slide` | `src/services/ai/prompts/` (one parameterized service) |
| No-text image-gen guard wrapper | generator/creator `lib/image-gen.ts:34` | `src/services/ai/` image gen |
| Image-gen fallback chain w/ content-rejection routing | tslides `lib/slideshow.ts` + `lib/openai-image.ts`; generator `lib/image-gen.ts` | `src/services/ai/` image gen |
| Text overlay: SVG-glyph-path renderer | tslides `lib/overlay.ts` | `src/services/rendering/` (candidate A) |
| Text overlay: sharp+Pango renderer + TikTok safe zones | generator `lib/render-slide.ts`, `lib/render-topn-slide.ts` | `src/services/rendering/` (candidate B) |
| Text-overlay engine (auto-fit, wrap, tracking, scrim) — Python reference | pinfactory `pinfactory/images.py` | `src/services/rendering/` (port ideas to TS) |
| Semantic theme system (palette + font roles + deep-merge defaults) | pinfactory `themes.yaml`, `pinfactory/themes.py` | `src/services/rendering/themes` + workspace brand kits |
| Slide template set (headline, quote, checklist, comp, stats, trope-hook) | pinfactory `images.py:410-691` | `src/modules/slideshow/templates/` |
| Card renderer variants + platform canvas sizes | book-social-media `image_generator.py` | `src/modules/slideshow/templates/` (merge) |
| Slides→MP4 (per-slide durations, audio loop, moving background) | generator `lib/render-video.ts`; tslides `lib/video.ts` | `src/services/rendering/video` |
| Quote-video pipeline (sepia grade, drawtext, beat-sync cuts) | aesthetic `lib/render-server.ts`, `lib/beat-detect.ts` | `src/modules/video/` (quote-video type) |
| Prompt bank pattern (STYLE preamble + subject categories) | aesthetic `lib/bank.ts` | `src/services/ai/prompts/` + asset library |
| Cover-fidelity image prompt | bookshelf `src/lib/render/prompt.ts` | `src/services/ai/prompts/` |
| Visual QA gate (transcribe-and-vote cover check) | bookshelf `src/lib/render/cover-check.ts` | `src/services/ai/qa/` |
| Style-recipe distillation (brand kit from reference images) | bookshelf `src/lib/recipe/prompt.ts`, `vision.ts` | `src/services/ai/` + asset library |
| Character-consistency injection + drift QC retry | storyforge `stages/images.py`, `stages/cast.py`, `backends/qc.py`; aesthetic `appearsIn` routing | `src/services/ai/` (image gen) |
| Scene-decomposition prompt + JSON validator | storyforge `backends/llm.py` | `src/services/ai/prompts/` |
| Kinetic ASS caption generator (10 effects) | bookshelf `src/lib/render/ass.ts` | `src/services/rendering/captions` |
| Karaoke caption cues + TTS word-timestamp handling | storyforge `captions.py`, `backends/tts.py` | `src/services/rendering/captions` (merge) |
| ffmpeg still→video (Ken Burns + burned captions) | bookshelf `src/lib/render/ffmpeg.ts` | `src/services/rendering/video` |
| ffmpeg assembly extras (xfade, ducking, loudnorm) | storyforge `ffmpeg.py` | `src/services/rendering/video` (port features in) |
| Timeline logic (durations, zoom alternation, cut-vs-fade) | storyforge `stages/timeline.py` | `src/modules/` (video/slideshow) |
| Book-marketing post prompt + platform guidelines + 10 content types | book-social-media `post_generator.py:36-113` | `src/services/ai/prompts/` |
| BookTok caption prompt (hook + 5 hashtags) | bookshelf `src/lib/captions/generate.ts` | `src/services/ai/prompts/` |
| Genre-rewrite / cross-account adaptation prompt | facebook-library `app/page.tsx:164-178` | `src/services/ai/prompts/` (server-side Claude call) |
| Pinterest SEO copy prompt + per-template angles | pinfactory `copy_gen.py` | `src/services/ai/prompts/` |
| Grounded no-fabrication copy prompt + JSON repair/backfill | tropesite `src/content-engine.mjs` | `src/services/ai/prompts/` + LLM-JSON hardening util |
| LLM JSON fence-strip/repair | book-social-media `post_generator.py:116-143` | same hardening util |
| DB schema patterns (cards state machine, event_log, automation_configs, encrypted tokens) | bookshelf `src/lib/db/schema.ts`; tslides schema (20 migrations) | Drizzle schema in new app |
| Quote extraction from manuscripts | book-social-media `book_reader.py:128-155` | `src/services/ai/` (source-text ingestion) |
| Performance-ranked content library (999 FB posts) + OCR-at-ingest + FB media proxy | facebook-library `posts.json`, `app/page.tsx` OCR, `app/api/img/route.ts` | asset library seed data + ingest service (**migrate now — URLs expiring**) |
| Board/collection targeting strategy | pinfactory `boards.py` | `src/services/posting/` (platform metadata) |
| Approval-gate lifecycle (draft→approved→published) + review gallery UX | pinfactory, storyforge `review.py`, tropesite comps flow | core content model + review UI |
| OFL fonts + role documentation | pinfactory `fonts/*.ttf`, `FONTS.md` | asset library upload (workspace-shared) |
| Compliance audit engine + JSON-LD + AI-crawler robots | tropesite `src/audit.mjs`, `jsonld.mjs`, `robots.mjs` | only if an SEO-site module makes the cut |

Explicitly **not** carried: the Redis-only storage layers (generator/creator), single-`APP_PASSWORD` auth, pinfactory's Pinterest v5 client, bookshelf's pg-boss/cron plumbing, aesthetic's dead OAuth/MCP subsystem, tslides' Apify mirroring UI (unless competitive cloning becomes a module — spec question), tropesite's SQLite/static-deploy machinery, facebook-library's client-side OCR (redo at ingest), all Python CLI scaffolding.

---

## Consolidated external APIs / keys the new app will need

| Service | Used for | Seen in |
|---|---|---|
| **Post Bridge** | all posting + analytics | bookshelf, book-social-media, generator, creator, tslides, aesthetic, tinkerboxxx (⚠️ bookshelf has owner+shared keys; PB rate cap ~10 req/s; `social_account_id` filter silently ignored; deep pagination 500s) |
| **Anthropic** | copy/script/vision (claude-sonnet-4-6 everywhere) | 10 of 12 audited apps |
| **Google Gemini** | image gen + vision QA (direct + via AI Gateway) | storyforge, bookshelf, generator, creator, tslides (as NSFW-tolerant fallback) |
| **Vercel AI Gateway** | model routing/failover (`AI_GATEWAY_API_KEY` / OIDC) | generator, creator, tslides, bookshelf |
| **OpenAI** | gpt-image-1/2 image gen, Whisper, gpt-4o-mini vision | bookshelf, tslides, tinkerboxxx |
| **Higgsfield** | primary image gen — two integration styles: MCP OAuth (bookshelf, tslides) vs Clerk-cookie "unlimited" (aesthetic) | bookshelf, tslides, aesthetic |
| **Apify** | TikTok/FB scraping | tslides (`APIFY_TOKEN`), facebook-library (data source) |
| **Upstash Redis** | KV store (legacy — being replaced) | generator, creator |
| **Supabase** | DB/auth/storage (target stack; already live in one app) | tinkerboxxx |
| **Replicate** | Demucs vocal separation | bookshelf |
| **ElevenLabs** | TTS narration | storyforge |
| **Resend** | failure/alert email | bookshelf, generator, creator, tslides, tinkerboxxx |
| **PublisherChamp** | analytics | generator, creator |
| **Google OAuth** | user auth | creator (tinkerboxxx uses Supabase auth) |
| **Pinterest v5 OAuth** | direct pinning (reference only) | pinfactory |
| **Amazon Associates** | affiliate links (SEO module only) | tropesite |
| Internal secrets | `CRON_SECRET` (→ Inngest signing key), `TOKEN_ENCRYPTION_KEY`/`TSLIDES_TOKEN_SECRET` (keep the AES-GCM pattern, avoid tslides' weak fallback) | several |

**Security findings across all 12 audited apps:**
1. 🔴 **slideshow-generator: live `CRON_SECRET` committed in a public repo** (see box at top). Rotate now.
2. 🟡 generator `generate-slides` route gates on `process.env.PASSWORD` instead of `APP_PASSWORD` — likely unauthenticated in prod.
3. 🟡 tslides `lib/crypto.ts` token-encryption key silently falls back to `DATABASE_URL` → literal dev string; set `TSLIDES_TOKEN_SECRET`.
4. 🟡 aesthetic's Higgsfield Clerk cookie is a full account credential in env (by design; ToS-gray "unlimited mode" — decide if the consolidated app keeps this or the sanctioned MCP path).
5. 🟡 creator's `analyze-slide`/`describe-image`/`fetch-image-url` fetch arbitrary user URLs server-side (SSRF surface) — the new engine needs allowlisting.
6. ⚪ tslides/aesthetic Blob assets are public-if-URL-known; fine for posts, not for private workspace assets.

---

## Things the architecture summary doesn't mention that the audit surfaced

1. **Editorial approval gates.** pinfactory, storyforge, tropesite independently converged on draft→approve/reject→publish. First-class state machine in the core content model.
2. **A theming/brand-kit system.** pinfactory's semantic palette/font-roles + bookshelf's AI style recipes + aesthetic's STYLE-preamble prompt bank are three parts of one feature: workspace brand kits.
3. **Multi-pen-name support.** pinfactory and the fleet at large model multiple author brands; decide pen-name = workspace vs sub-entity.
4. **Anti-spam/platform-safety rules** as a shared scheduling concern (pinfactory caps/quarantine + tslides LRU anti-repeat + generator dedup keys).
5. **Automated visual QA** (bookshelf cover-check, storyforge drift QC) — the image service should own generate→verify→retry.
6. **Platform-filter evasion is core product IP** (generator's leetspeak/emoji censorship engine; tslides' NSFW-tolerant model routing; `is_aigc:false`). The spec should own an explicit policy here — it's load-bearing for reach but carries platform-ToS risk.
7. **Posting verification / silent-failure detection** (tinkerboxxx cross-check, generator verify helpers) — posting isn't done until confirmed by Post Bridge.
8. **Competitive-cloning ingest** (tslides Apify mirror → analyze → regenerate) — decide if this is a module; it's tslides' whole front end.
9. **Performance-ranked content libraries** (facebook-library) — the asset library should store engagement metrics with assets ("what worked" view); migrate the 999-post dataset before its URLs expire.
10. **Deterministic regeneration** (seeded variants, content-hash dedup, incremental regen) — cheap to keep.
11. **Ops/fleet observability** (tinkerboxxx Manager) — the new app should ship a status/cross-check dashboard from day one.
12. **Post Bridge operational hazards** — rate cap, ignored filters, deep-pagination 500s, shared-key cross-contamination: encode as client-level defenses.

---

## Recommended build order (updated)

1. **Rotate the leaked CRON_SECRET** (before anything else).
2. **Core scaffold:** Supabase + Drizzle schema seeded from bookshelf's `cards`/`event_log`/`automation_configs` + tslides' slideshow/book tables; Inngest wiring; workspace/user model.
3. **Posting service:** bookshelf `postbridge.ts` as the base + tinkerboxxx's rate limiter/paginator + generator's non-retryable-POST rule and verification helpers; per-workspace keys.
4. **Scheduling service:** bookshelf windows/caps + tslides two-phase dispatcher/retry classifier + pinfactory anti-spam + LRU anti-repeat, as Inngest functions.
5. **Asset library:** storage buckets + brand kits (pinfactory fonts/palettes, bookshelf style recipes, aesthetic prompt bank) + performance-metrics-on-assets; **import facebook-library's 999 posts now** (re-host images, OCR at ingest).
6. **Slideshow module (Module #1):** per the head-to-head above — tslides structure, generator/creator prompt IP, one of the two proven overlay renderers, no-text guard, fallback chain w/ content-rejection routing, QA gate.
7. **Copy/caption service:** merged prompt library + LLM-JSON hardening.
8. **Approval/review UI** across content types.
9. **Ops dashboard:** absorb tinkerboxxx Manager cross-check.
10. Later modules per spec (quote-videos from aesthetic, narrated video from storyforge/bookshelf, memes, SEO site…) once remaining audits land.

---

## Blockers & questions — need answers before going further

1. **Where is `content-engine-architecture.md`?** Not in this repo, and my-toolkit's audit confirms it doesn't exist there either. The nearest artifact is **my-toolkit `patterns/inkwell-v2/SPEC.md`** (2-app consolidation spec — a strong seed to widen into the real fleet-wide spec). Decide: widen that SPEC, or write the content-engine spec fresh with it as input.
2. **8 private repos pending:** meme-maker, book-video-bot, inkwell, trialreels, siggy, dictabook, simplepostr, authorbids. The add-repo approval flow only works one repo per user-typed message (`add ccas77/NAME`). Note: the `inkwell` repo is a Sudowrite clone (AI fiction-writing tool) — unrelated to my-toolkit's "Inkwell v2" slideshow-consolidation SPEC despite the shared name. As a writing tool it may sit outside the content-engine scope entirely (owner to decide whether it's even in the 24-app consolidation).
3. **7 apps with local-only source:** kinetic, quadrants, reposter, socialato, bookslide, public — push those folders to GitHub (private is fine) and I'll audit them. aimoviebot needs no push — its Vercel project just needs deleting or relinking.
4. **Is the local `bookshelf` folder the same code as the Vercel project + the private `ccas77/bookshelf` repo?** Adding the repo will answer this.
5. **Scope check:** should `video-generator`, `book-boyfriend`, `book-writer-app`, `bookpulls-runbook` be considered?
6. **Policy questions surfaced by the audit:** keep the censorship/`is_aigc:false` evasion features? Keep aesthetic's Clerk-cookie Higgsfield bypass or standardize on the MCP path? Is competitive cloning (tslides) a module?
