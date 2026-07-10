# App Audit & Consolidation Proposal

**Date:** 2026-07-10 (updated same day — third pass)
**Status: 25 of 24+ projects fully audited — every reachable app is now covered.** First pass covered the 6 local projects; second pass added 6 GitHub-cloned apps + my-toolkit; this third pass adds the 13 remaining apps that were previously "source only on your machine" or "private GitHub" but exist locally (meme-maker, book-video-bot, ai-ugc-pipeline, inkwell, trialreels, siggy, dictabook, simplepostr, authorbids, kinetic, quadrants, reposter, socialato).

Remaining blockers (details in [Blockers](#blockers--questions--need-answers-before-going-further)):

1. **`content-engine-architecture.md` is still missing** — destination columns below remain based on the summary in your instructions.
2. **2 Vercel projects still have no reachable source:** `bookslide` (CLI-deployed by Codex, no git metadata, not present locally) and `public` (static shell, not present locally). `aimoviebot` remains a candidate for Vercel-project deletion.
3. **`ccas77/bookshelf` does not exist on GitHub** — the Vercel project (bookshelf.bookpulls.com) is CLI-deployed from the owner's machine, and the copy in this monorepo is the only auditable source (already covered in the first-pass audit).

> ### ⚠️ URGENT SECURITY — rotate now
> **`slideshow-generator` is a PUBLIC GitHub repo and has a live production `CRON_SECRET` committed in `.claude/settings.local.json`** (appears ~20× in allow-listed curl commands, alongside the deployed URL `slideshow-generator-nine.vercel.app`). That token gates the cron AND admin routes (`clear-scheduled`, `migrate-configs`, …) — anyone on the internet can currently fire them. Actions: (1) rotate `CRON_SECRET` in Vercel, (2) delete the file and rewrite git history or make the repo private, (3) check Vercel logs for unexpected cron/admin hits.
>
> **No new committed-secret leaks found in the 13 third-pass apps.** `.env.local` / `.env.check` files exist on your dev machine for many of them but every one is properly `.gitignore`'d — verified with `git ls-files` in each per-app repo. The only tracked env files are `.env.example` / `.env.local.example` variants. `kinetic` has no `.git` directory at all (never committed anywhere), so nothing can leak from it via GitHub.
>
> **Non-leak security issues to fix at the code level (not commit history):**
> - 🟡 **siggy** — `app/api/claude/route.ts:6` accepts an `_apiKey` field in the POST body and falls back to `process.env.OPENAI_API_KEY`. The client-side pattern that fills that field puts the key in browser DevTools + network logs. Plus the route name lies (uses OpenAI, not Claude), the Redis KV store has no auth, and 500 error bodies leak the full system prompt. **Recommend: delete the Vercel deployment; do not port.**
> - 🟡 **authorbids** — Amazon Ads LWA OAuth is intentionally scoped to sandbox only (`advertising::test:create_account`); production scope switch is a Phase-4 action not yet taken. Not a leak, just a live-write gate to keep in place.

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
| meme-maker | ✅ In this folder (own git repo) | ✅ | **KEEPER** — deterministic combo-rotation scheduler + Remotion WebGL chroma-key renderer |
| ai-ugc-pipeline | ✅ In this folder (own git repo) | ✅ | **KEEPER** — checkpoint-enforcement state machine for Higgsfield Seedance UGC batches |
| book-video-bot | ✅ In this folder (own git repo) | ✅ | **KEEPER (partial)** — HITL 6-screen BookTok pipeline; strong ffmpeg wobble+drift renderer |
| inkwell | ✅ In this folder (own git repo) | ✅ | **KEEPER (partial)** — Phase-1 skeleton of a Sudowrite-style novelist writing tool; unrelated to my-toolkit's slideshow-consolidation SPEC |
| simplepostr | ✅ In this folder (own git repo) | ✅ | **KEEPER (foundation only)** — multi-tenant SaaS skeleton (workspaces, entitlements, envelope-encrypted credentials); Meta vertical slice pending |
| authorbids | ✅ In this folder (own git repo) | ✅ | **KEEPER (defer)** — Phase-1 Amazon Ads read-only mirror; NOT in content-engine scope |
| my-toolkit | ✅ cloned (added to session) | ✅ | **KEEPER — the canonical shared-patterns library** (see audit below; contains the slideshow-consolidation SPEC) |
| dictabook | ✅ In this folder (own git repo) | ✅ | **KEEPER (out of scope)** — Whisper dictation w/ 25MB re-encode fallback; not a posting app |
| siggy | ✅ In this folder (own git repo) | ✅ | **DELETE** — insecure single-JSX prototype; API key in request body, unauthenticated Redis, hardcoded to one pen name |
| trialreels | ✅ In this folder (own git repo) | ✅ | **KEEPER (partial, Layers 3–5 unfinished)** — hook-generator + Pexels mood board; Layers 3–5 schema only |
| aimoviebot | Vercel project mislinked to this monorepo; all builds ERROR | n/a | **DELETE the Vercel project** — no codebase exists |
| kinetic | ✅ In this folder (NO git — never committed) | ✅ | **DELETE / rebuild** — static HTML + stubbed API endpoints, no working app |
| quadrants | ✅ In this folder (own dir, no `.git`) | ✅ | **KEEPER** — 6-step BookTok carousel factory; few-shot caption prompt + 2×2 quadrant renderer |
| reposter | ✅ In this folder (own git repo) | ✅ | **KEEPER** — most hardened PB client in fleet; TikTok scrape → R2 → staggered re-post; winners module |
| socialato | ✅ In this folder (own git repo) | ✅ | **PROTOTYPE (gated)** — Phase-0 vision-ranked shortlist; do not proceed until user's Phase-0 sign-off |
| bookslide | CLI-deployed by Codex, no git metadata (⚠️ slideshow family) | ❌ | source only on your machine — **not present locally either** |
| public | CLI-deployed static shell, no git metadata | ❌ | source only on your machine — **not present locally either** |

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
- **🔑 `patterns/slideshow-consolidation-spec/SPEC.md` — the closest thing to the missing `content-engine-architecture.md`.** A full consolidation plan, but scoped to exactly TWO apps (slideshow-generator + slideshow-creator → one monorepo): Turborepo layout (`apps/web` + `packages/{db,rendering,postbridge,automation,types}`), a complete Postgres/Drizzle schema that **separates user-editable `automation_configs` from cron-managed `automation_state`** (fixes read-modify-write races), append-only audit logs, one generic `AutomationHandler` interface + single cron dispatcher replacing 5 duplicated cron files, and a feature-parity migration checklist. It predates the fleet-wide content-engine framing (no Inngest, no workspace asset library, no Gemini module) — a seed for the real spec, not the spec itself. It also carries a "NEVER start building without EXPLICIT permission" guard.
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

## Per-app audits — the 13 local apps (third pass)

### meme-maker — KEEPER

- **Purpose:** Zero-duplicate branded short-form video scheduler built around template × product (book) × account rotation. Upload a green-screen clip, configure text-overlay variants and background prompts, and the deterministic scheduler queues posts across TikTok/IG/Facebook/Pinterest so no `(text variant, background prompt)` combo ever repeats on the same account.
- **Stack:** Next.js 16 on Vercel; **Neon Postgres accessed via raw SQL (no ORM)**; Vercel Blob for uploads; Remotion 4 for WebGL chroma-key rendering in an external worker (Fly.io); Gemini Imagen-4 for backgrounds; Post Bridge for publishing.
- **External APIs / key references** (env-only; **no committed secrets** — `.env.local` is gitignored, only `.env.example` is tracked):
  - Post Bridge — `lib/post-bridge.ts` (`POST_BRIDGE_API_KEY`; accounts, post-results, analytics, delete; 5-page pagination cap with retry)
  - Gemini / Imagen via Google AI (`GEMINI_API_KEY`)
  - Vercel Blob for the raw green-screen uploads (`BLOB_READ_WRITE_TOKEN`)
  - Postgres (`POSTGRES_URL`)
- **Crown jewels:**
  - `lib/scheduler.ts` — **deterministic combo-rotation**: combos are `(textVariantIdx, bgPromptIdx)` pairs, and each account's next combo is `(postCount % totalCombos)`. Guarantees no two posts of the same product/template repeat the same words-and-background pair. Novel anti-repeat pattern the fleet doesn't have elsewhere.
  - `state/schema.sql` — `rotation_state` per `(account, product, template)` with `last_used_at`; `posting_windows_json` supports per-account windows + `posts_per_day` auto-refill; **sibling-account spacing** enforces a 30-min minimum gap between any two posts from the same author.
  - Remotion + WebGL chroma-key pipeline is a novel option vs. the ffmpeg-based renderers in bookshelf/tslides/book-video-bot.
- **State:** complete, actively maintained (last commit 2026-07-02); no TODOs; clean web-app-plus-render-worker split.
- **Consolidation:** lift the combo-rotation scheduler and the sibling-spacing rule into `src/services/scheduling/`; the Remotion chroma-key path is worth keeping as a fourth renderer alongside the sharp/text-to-svg/Pango options. Raw SQL → Drizzle; cron loop → Inngest.

### book-video-bot — KEEPER (partial — HITL pipeline; renderer is the reusable asset)

- **Purpose:** Human-in-the-loop BookTok video builder with an approval gate at every stage: seed title → Claude finds traits + candidate books → user approves traits → user picks books → render preview → review → caption + hashtags → confirm accounts (danger dialog) → nothing publishes until "PUBLISH" is typed. Six screens, and a pull-back (delete) button for already-published videos.
- **Stack:** Next.js 16 on Vercel; Neon Postgres via raw migrations in `migrations/`; Vercel Blob; **`@ffmpeg-installer/ffmpeg` + `fluent-ffmpeg`** (aligned with my-toolkit's captions runbook, not `ffmpeg-static`); Claude + Gemini for book sourcing; Apify for Goodreads cover scraping.
- **External APIs / key references** (env-only; **no committed secrets**):
  - Anthropic (`lib/claude.js`) — web-search + trait generation
  - Gemini (`lib/gemini.js`) — image descriptions
  - Post Bridge (`lib/postBridge.js`) — 3× exponential backoff on 429, explicit `accountIds` required (no default fan-out), per-platform upload + AAC audio
  - Apify (`lib/assets.js`) — Goodreads cover scraper + fallback search
  - Vercel Blob for MP4 + background images
- **Crown jewels:**
  - `lib/video.js` — **filter-complex builder with a handheld-camera wobble via crop oscillation** + per-book fade-in/out with timed title/author/rating overlays, Ken Burns zoom on the music track, TikTok safe-zone aware `y=1320` baseline for titles. This is a distinctive rendering effect none of the other apps have.
  - `lib/postBridge.js` — a compact but hardened PB client; parallel to bookshelf's variant.
  - The **PUBLISH-typed danger dialog + per-account checkbox + pull-back delete** pattern encodes the fleet's editorial-gate feel end-to-end.
  - Schema (`drafts` w/ JSON `status`, `posts` w/ `platform_urls`) is a good approval-state-machine template.
- **State:** complete, production-live; one latent bug — `lib/settings.ts` does not hard-fail on missing `APP_SECRET`; concurrent `traits`/`analyse` calls race between Claude and Gemini paths.
- **Consolidation:** the ffmpeg wobble+drift renderer is the module-1 addition; the "typed-PUBLISH + explicit account checkbox" flow becomes the shared publish-confirm UX for one-shot posting surfaces. Raw SQL → Drizzle; DIY scheduler → Inngest.

### ai-ugc-pipeline — KEEPER

- **Purpose:** Deterministic batch UGC video pipeline built around a **checkpoint-enforcement state machine** so LLMs cannot silently drift a 30-item batch. Character + niche seed → Initiation Prompt + caption spec (Claude) → Higgsfield Seedance 2.0 base videos → **human review checkpoint** → ffmpeg compose (captions + audio) → Blob output.
- **Stack:** Next.js 15 on Vercel Pro (Fluid Compute for ffmpeg); **Vercel KV (Upstash Redis) for run persistence** (no SQL); Blob for assets; Higgsfield via MCP OAuth; `@ffmpeg-installer/ffmpeg` (ffmpeg 4.x — see below).
- **External APIs / key references** (env-only; **no committed secrets**):
  - Higgsfield MCP — `lib/higgsfield/mcp-client.ts` (JSON-RPC over Bearer), `lib/higgsfield/oauth.ts` (Authorization Code + PKCE + refresh). ⚠️ **This app calls the banned `soul_2` model as well as `seedance_2_0`** — in violation of the "no `soul_*` / no `marketing_studio_*`" hard rule. Decide whether the pipeline can be reworked around Seedance only or whether the whole approach retires.
  - Anthropic (`lib/captions/generate.ts`) — single-shot, no-memory caption batch
  - Vercel KV — run state
- **Crown jewels:**
  - `lib/pipeline/state-machine.ts` — **`HUMAN_CHECKPOINTS`** enforces manual advancement out of `inputs_locked` and `base_videos_ready`; any auto-transition throws `CheckpointError`. Exactly the drift-prevention pattern the storyforge/pinfactory/tropesite audits converged on.
  - `lib/pipeline/prompt-builder.ts` — parameterized Initiation Prompt + caption-spec batch contract.
  - `lib/ffmpeg/compose.ts` — TikTok Sans Bold, white + 4px black border, centered at `y=340`, 0.5s audio fade in/out, libass-ready for future kinetic captions.
  - `lib/render/greenscreen.ts` + `lib/render/ass.ts` — the Bookshelf-style kinetic caption renderer already ported in, currently unused.
  - Explicit negative-prompt hardening on the Seedance side ("no smiling, happy, cheerful, playful, exaggerated makeup…") to fight the default UGC-model style.
- **State:** core pipeline complete; README's own caveat is that the MCP OAuth from-backend flow "can't be fully validated without live token round-trip." **ffmpeg is 4.x** (per my auto-memory) — the compose module uses per-line drawtext workarounds instead of the 6.1-only `text_align`, which is correct.
- **Consolidation:** the state machine is the flagship IP — it becomes the shared pipeline runtime once ported to Inngest (Inngest steps map naturally onto stages, and human checkpoints become explicit `waitForEvent` calls). KV → Postgres for multi-workspace. **Blocker to resolve first:** replace `soul_2` before this can go into the engine.

### inkwell — KEEPER (partial — Phase 1 skeleton; a Sudowrite-style writing tool)

- **Purpose scope:** this repo is a **Sudowrite-style AI fiction-writing tool** — orthogonal to the slideshow-consolidation SPEC in `my-toolkit/patterns/slideshow-consolidation-spec/SPEC.md`. Nothing here is meant to feed the SPEC's `apps/web` + `packages/{db,rendering,postbridge,automation,types}` layout; they are unrelated products.
- **Purpose:** Self-hosted AI writing tool for series-fiction novelists: extract and anchor voice + world-canon so every generation respects both. Owner-only (Phase 1). See `/spec.md` in the repo for phases 1–9.
- **Stack:** Next.js 16 + React 19 on Vercel; **Supabase Postgres + pgcrypto** (server-side symmetric encryption of the Anthropic API key so it never crosses to the browser); Tiptap rich-text editor; RLS-per-user isolation.
- **External APIs / key references** (env-only; **no committed secrets**):
  - Anthropic (`lib/engine/anthropic.ts`) — claude-opus-4-7 / sonnet-4-6 / haiku-4-5, SSE streaming
  - Supabase — auth + Postgres + pgcrypto
  - Deterministic test mode via `/api/engine/mock-recordings` (snapshot-driven)
- **Crown jewels:**
  - `lib/crypto/api-key.ts` + `supabase/migrations/0001_init.sql` — **pgcrypto AES-GCM at rest for the user's Anthropic key**; decrypted server-side on demand. The cleanest multi-user LLM-key pattern in the fleet — better than bookshelf's `TOKEN_ENCRYPTION_KEY`-based approach because it uses Postgres primitives.
  - Schema: `projects`, `chapters`, `fingerprints` (editable style), `bible_entries` (world canon), `mcp_tokens`, `event_log`, RLS policies. Model-worthy for the engine's per-user isolation layer.
  - `lib/engine/stream.ts` — Anthropic streaming → SSE normalizer with error redaction that scrubs the API key from thrown errors.
  - `tests/phase1/run.ts` — phase-gated harness driven by `INKWELL_PHASE` env; mock-recording fixture engine; custom tsconfig aliases `server-only` to a no-op stub for CI.
- **State:** Phase 1 (auth + CRUD + editor) done and deployed; Phases 2+ (fingerprint extraction, bible parsing, generation pipeline) scaffolded but not implemented. Deliberately gated: Phase 1 exists to validate Supabase + Anthropic integration before generation code lands. Zero TODOs.
- **Consolidation:** absorb the **pgcrypto per-user API-key pattern**, the RLS policy shape, and the `event_log` audit table into the engine's core schema. The generation endpoints (continue, describe, rewrite, brainstorm, style-extract) are series-fiction-specific — leave them in inkwell unless a "long-form writing" module makes the cut. Do not merge as a whole until Phase 2+ lands; the current repo has no shippable generation surface.

### trialreels — KEEPER (partial — Layer 2B live, Layers 3–5 schema only)

- **Purpose:** Five-layer romance-marketing studio: books/scenes catalog → hook-pattern generator (Claude + synonym swap) → visual-mood browser (Pexels) → production/render queue (schema only) → metrics feedback loop (schema only). Layers 1–2B live; Layer 3 UI, Layer 4 render worker integration, and Layer 5 metrics are still ahead.
- **Stack:** Next.js 14.2 App Router on Vercel; **Supabase Postgres + Google OAuth with an `allowlist` table for gating**; Pexels API; a Render.com Node worker (`/worker/`) polling a Supabase queue table and writing outputs to Supabase Storage.
- **External APIs / key references** (env-only; **no committed secrets** — `.env.local` is gitignored):
  - Anthropic (`app/api/hooks/generate/route.ts`) — claude-sonnet-4-6 for hook generation + synonym swaps; degrades gracefully if the key is missing
  - Pexels (`app/api/pexels/*.ts`) — preview / search / backfill / health checks (200 req/hr free tier)
  - Supabase — Postgres + auth + Storage
- **Crown jewels:**
  - `lib/hook-prompt.ts` + `lib/hookTransforms.ts` — **specificity-scored hook generator** with a 10-register taxonomy (fear, desire, grief, revenge, …) and per-register pattern matches; `buildSceneContextLines()` distils scene synopses into AI-usable context. Romance-specific but the register-scored approach generalises.
  - `app/api/ai/{analyse-scene,analyse-book,extract-scenes}.ts` — Claude-vision scene/book distillers → teasers, chapter structure, character beats.
  - `supabase/migrations/` — three idempotent DDL files defining books, scenes, hooks, visual_moods, production queue tables. The queue-table + external-worker pattern is a clean alternative to Inngest for isolated pipelines.
  - `render.yaml` + `/worker/` — Render.com blueprint + polling worker; the closest thing in the fleet to a shippable durable-worker pattern that isn't Inngest.
- **State:** Layers 1–2B production-live; Layer 3 has schema without UI; Layer 4 worker exists but integration is untested; Layer 5 is schema only. README is up to date.
- **Consolidation:** the register-scored hook prompt goes into `src/services/ai/prompts/` (mark as romance-specific); the queue-table + external-worker pattern is a fallback option for the scheduling layer if Inngest is later rejected. Google OAuth + email `allowlist` is a good pattern for the friends-multi-user gate on bookshelf. Do not port Layers 3–5 until they're built out in-place.

### siggy — DELETE (insecure prototype; no reusable IP)

- **Purpose:** Chapter-writing assistant hardcoded to one paranormal-romance pen name; a single JSX component wraps an OpenAI call and stores drafts in Upstash.
- **Stack:** Next.js 16 App Router; React 19; Tailwind 4; **Upstash Redis (no Postgres, no auth, no user model)**; raw OpenAI GPT-4o via `fetch` (not the SDK, no streaming).
- **External APIs / key references** (env-only for now; **runtime security is the problem**):
  - OpenAI (`app/api/claude/route.ts:6` — route name lies; it proxies OpenAI). Accepts `_apiKey` in the POST body OR falls back to `process.env.OPENAI_API_KEY`.
  - Upstash Redis (`app/api/storage/route.ts`) — unauthenticated read/write of any key with the `siggy:` prefix.
- **Crown jewels:** the system prompt in `components/SiggyApp.jsx` (lines 13–100) hardcodes the author's voice, creature-type taxonomy, and three hard content rules. It **is** the IP, but it's welded to one author with no abstraction layer — you'd have to lift the prompt as text and rebuild everything else.
- **State:** **Live but insecure.** No auth. API key in request body → visible in DevTools + network logs. 500 error bodies leak the system prompt. Route name mismatches provider. No rate limiting. No audit trail.
- **Consolidation:** **delete the Vercel deployment.** If a "personal writing AI" module is ever wanted, rebuild on the inkwell foundation (pgcrypto-encrypted per-user key, Supabase auth, Anthropic SDK, RLS-isolated draft table). Do not port anything code-level.

### dictabook — KEEPER (out of scope for the content engine)

- **Purpose:** Mobile-first audio dictation + transcription tool for fiction authors: record chapters on mobile, transcripts via Whisper, chapter-level cleanup via Claude, EPUB/TXT export. Includes Stripe usage billing by audio-minute.
- **Stack:** Next.js 16 on Vercel; **Supabase** (auth + Postgres + Storage) via Vercel Marketplace auto-injection; Stripe; **`@ffmpeg-installer/ffmpeg`** for server-side re-encode of >25 MB audio; Whisper via OpenAI; Sentry.
- **External APIs / key references** (env-only; **no committed secrets**):
  - OpenAI Whisper — `app/api/transcribe/route.ts` (`OPENAI_API_KEY`, direct HTTP to `/v1/audio/transcriptions`)
  - Supabase — auth, DB, Storage
  - Stripe (`lib/stripe.ts`) — per-minute billing
  - Sentry
- **Crown jewels:**
  - `app/api/transcribe/route.ts` — Whisper client with a **25 MB oversize detector that re-encodes to opus mono 24 kbps via ffmpeg before upload**, so 2 h+ recordings fit in one submission.
  - `lib/cleanup-prompt.ts` + `lib/cleanup.ts` — Claude tidy-prose prompt + diff-and-apply back to local chapter state.
  - `lib/audio-buffer.ts` — IndexedDB audio ring buffer that batches local recording before the cloud ACK (handles offline / flaky-network capture).
  - `lib/usage.ts` — per-event usage row (event + audio_seconds + `cost_cents`) — a good template if the engine ever needs per-workspace metered features.
  - `lib/allowlist.ts` — owner-email allowlist for settings admin.
- **State:** feature-complete and production-live; owner-locked; no TODOs.
- **Consolidation:** **not a content-engine app.** The Whisper oversize-re-encode client and the audio ring buffer are reusable in isolation if a future dictation or audio-hook feature ever ships. Otherwise leave it as its own product (it's the only fleet app on the "author-workflow" side rather than the posting side).

### simplepostr — KEEPER (foundation only — multi-tenant SaaS skeleton)

- **Purpose:** Multi-tenant social publishing & scheduling SaaS. Foundation shipped: users, workspaces, memberships, entitlement tiers, resumable Blob uploads, post + `posts_targets` model, envelope-encrypted social credentials, audit log. The Meta vertical slice + publication worker are the next stage (matches auto-memory: "Meta vertical slice is next; three manual setup steps pending"). Deployed at simplepostr.vercel.app.
- **Stack:** Next.js 16 App Router on Vercel; **Neon Postgres + Drizzle (20+ migrations)** — the target stack in miniature; Vercel Blob (resumable client multipart); Vercel Queues + Cron for workers; Resend; argon2id passwords; **AES-256-GCM envelope encryption for at-rest credentials** with the DEK env-var-supplied (swappable for KMS later).
- **External APIs / key references** (env-only; **no committed secrets** — `.env.local`, `.env.check` are gitignored, only `.env.example` tracked; the sub-agent's "committed" flag was a false positive I verified with `git ls-files`):
  - Meta OAuth (dev-mode stubs) — `lib/providers/meta/*`, callbacks under `app/api/callbacks/meta/`
  - Stripe test-mode only (`lib/billing/stripe.ts`) — client refuses non-`sk_test_` keys
  - Resend (`lib/email.ts`) — silent-fails without `RESEND_API_KEY` (matches the "3 manual setup steps still pending" note)
  - Bluesky provider — experimental scaffold in `lib/providers/bluesky/`, not UI-wired
  - TikTok — sandbox stubs; CLAUDE.md explicitly forbids live publishing
- **Crown jewels:**
  - `lib/db/tenant.ts` + `lib/db/` schema — **the multi-tenant workspace model**: `workspaces`, `memberships`, `media`, `posts`, `posts_targets`, `audit_logs`, `notifications`, `entitlements`, `quota_reservations`, `social_accounts`, `apple_credentials`. Every query goes through a workspace filter. This is the **best foundation for the engine's multi-tenant layer** — the closest match to the fleet-wide target we already have running.
  - `lib/entitlements.ts` — plan tiers + monthly-post / collaborator / GB quotas + `quota_reservations` for atomic pre-scheduling enforcement.
  - `lib/auth/session.ts` — argon2id + email verification + 30-day session cookies; production-shape auth (not just Google OAuth).
  - `lib/crypto/envelope.ts` — AES-256-GCM envelope, DEK-in-env now, KMS later; social-credential encryption at rest.
  - `lib/providers/contract.ts` — abstract provider interface; matches the "Post Bridge is the posting layer, but providers are pluggable" architecture principle.
  - `docs/spec.md` (~75 KB) — the closest thing in the fleet to a written product spec; source-of-truth for tenancy, entitlements, endpoints.
- **State:** foundation shipped; per DEPLOY.md three manual browser-side setup steps remain (Resend terms, Stripe real key, Meta app credentials). CLAUDE.md hard rule: no live publishing to real accounts outside test accounts. No TODOs beyond those.
- **Consolidation:** **absorb simplepostr's schema and encryption pattern as the tenancy backbone of the engine** — this is the strongest structural match to the target architecture besides tslides. Do NOT bring in the Meta OAuth stack (Post Bridge is the posting layer for the engine). Keep `docs/spec.md` as an input alongside `patterns/slideshow-consolidation-spec/SPEC.md` when the real `content-engine-architecture.md` is drafted.

### authorbids — KEEPER (defer — out of content-engine scope but well-architected)

- **Purpose:** Profit-aware Amazon Ads bid automation for indie KDP authors. Phase 1 (live): LWA OAuth + one-way mirror of campaigns/ad-groups/product-ads/targets into a local schema. Phase 2 (planned): Publisher Champ profitability feed. Phase 3 (planned): rule engine, dry-run only. Phase 4 (deferred): guardrail-checked bid writes.
- **Stack:** Next.js 15 App Router on Vercel; **Neon Postgres + Drizzle**; AES-256-GCM for refresh-token encryption (`src/lib/crypto.ts`); Amazon Ads API v3 + Reporting API v3.
- **External APIs / key references** (env-only; **no committed secrets**):
  - Amazon Ads LWA — `src/lib/amazon/oauth.ts` (`LWA_CLIENT_ID`, `LWA_CLIENT_SECRET`, `AMAZON_ADS_SANDBOX="true"`, `LWA_SCOPE = "advertising::test:create_account"` — sandbox only by design)
  - Amazon Ads Reporting (async request → poll → gzipped JSON, planned for Phase 2)
  - Publisher Champ (planned; schema provisional in `specs/schema.md §4`)
  - `ENCRYPTION_KEY` — 32-byte base64 AES-GCM key
- **Crown jewels:**
  - `specs/schema.md` v1.1, `specs/rules-engine.md`, `specs/executor.md` — three cleanly separated spec documents covering data model, evaluation cycle, and executor lifecycle. Uncommon rigour; worth reading as a template for how the content-engine spec should be structured.
  - `src/lib/amazon/client.ts` — **Phase-1 hard rule is enforced in code**: only GET + POST-list-pagination paths exposed, with a top-of-file gate blocking write helpers until the executor lands. Prevents accidental live writes by construction.
  - `src/db/schema.ts` — Drizzle schema for campaigns / adGroups / productAds / targets + `amazonCredentials` (encrypted refresh token) + `actionLog` (audit trail scaffolded for Phase 3+).
- **State:** Phase 1 complete and production-safe; Phase 2–4 are docs, not code.
- **Consolidation:** **out of scope for the content engine.** Amazon Ads is a different domain (spend, not content). The phase-gating pattern (Phase 1 with a code-level no-write rule, spec docs before implementation) is worth adopting for any risky module in the engine. If a future "recommend which post to promote" feature emerges, it becomes the integration point; not today.

### kinetic — DELETE / rebuild (never committed anywhere; not a working app)

- **Purpose:** Nominally a "kinetic video FX" prototype. The folder contains four `.md` design briefs, one 28 KB `index.html` wireframe, three stub API files (`api/assets.js`, `api/clips.js`, `api/upload-token.js`), a `package.json`, and an `.env.local`. No app router, no real business logic.
- **Stack:** static HTML + minimal JavaScript. Vercel Blob was intended as storage. No database. No auth.
- **External APIs / key references:** `.env.local` on disk holds `BLOB_READ_WRITE_TOKEN` + `VERCEL_OIDC_TOKEN`. **This directory has no `.git` at all — nothing has ever been committed from it**, so there is no repo leak; but treat the tokens as local-only and rotate them if the folder is shared.
- **Crown jewels:** none. The briefs are prose; the HTML is a mockup.
- **State:** never actually built.
- **Consolidation:** delete the Vercel project (or repoint the deploy). If the "kinetic FX" concept is still wanted, restart from the ai-ugc-pipeline foundation.

### quadrants — KEEPER (BookTok carousel factory)

- **Purpose:** Six-step BookTok production pipeline: book metadata → premise + characters → calibration captions (few-shot exemplars) → LLM-generated caption candidates → scene/asset tagging → 2×2 image quadrant (1080×1080 JPG) with serif overlays. Produces manual-carousel-ready assets.
- **Stack:** Next.js 16 App Router + React 19 on Vercel; **Neon Postgres + Drizzle** (migrations tracked); Vercel Blob; Anthropic `claude-opus-4-7` via AI SDK; Tailwind v4; sharp for composition. Legacy Python CLI preserved in `./cli/` but not deployed. Password-gated deployment. (No `.git` in the folder — the deploy history lives on the machine, not GitHub.)
- **External APIs / key references** (env-only; **no committed secrets**):
  - Anthropic — `src/lib/captions.ts`
  - Higgsfield via MCP OAuth — `src/lib/higgsfield-oauth.ts`, `src/lib/higgsfield.ts`, model `gpt_image_2`; token AES-encrypted in Postgres. **Uses the sanctioned MCP path** (contrast with aesthetic's Clerk-cookie path); no banned `soul_*` or `marketing_studio_*` model use.
  - OpenAI fallback — `src/lib/openai-image.ts` (`gpt-image-1`)
  - Post Bridge — `src/lib/post-bridge.ts`
- **Crown jewels:**
  - `src/lib/captions.ts` — **the few-shot caption prompt with calibration examples as in-context learning**, plus four documented formulas: **Parallel Cast Intro, Context Inversion, Decree + Unexpected Agent, Surface + Real Motive**. Voice rule: "trope-loaded role descriptors, never character names" — mirrors the generator's "not 'Dante' — 'your mafia boss'" rule.
  - `src/lib/formulas.ts` — formula-schema validation (2-slide structures with typed slots).
  - `src/lib/grid-renderer.ts` — Satori render of the 2×2 quadrant layout with EB Garamond / Cormorant Garamond serif overlays.
  - `src/db/schema.ts` — books, characters, calibration_captions, scenes, captions (draft/approved/posted state), assets (uploaded vs. generated, tagged by character/slot/scene).
- **State:** end-to-end working; all six UI steps functional. Rough edges: dual-key PB logic not exercised; scene image prompts are somewhat generic.
- **Consolidation:** the caption-formula system + calibration-example few-shot pattern go into `src/services/ai/prompts/`; the 2×2 quadrant renderer is a new template type for the slideshow module (alongside pinfactory's six templates); the Higgsfield MCP OAuth code is a second reference implementation to line up next to bookshelf's and tslides'.

### reposter — KEEPER (the fleet's most hardened Post Bridge client + a winners module)

- **Purpose:** TikTok competitive-cloning engine: Apify scrapes a target profile → captions/metadata extracted → videos stored in R2 → a dashboard lets you tag/filter/review → manual or scheduled re-posting to your own accounts via Post Bridge on a stagger. A separate "winners" module ranks by engagement and prioritises the winners. **Authorized connectors are Apify + R2 + Post Bridge only** (per project memory); nothing else without explicit approval.
- **Stack:** Next.js 15 + React 19; Tailwind v3; **Upstash Redis** (KV store for automation index + state); **Cloudflare R2** via `@aws-sdk/client-s3`; Radix UI; Papa Parse + xlsx for import/export.
- **External APIs / key references** (env-only; **no committed secrets** — `.env.local` is gitignored):
  - Apify — `lib/apify.ts` (`APIFY_TOKEN`; `clockworks~tiktok-profile-scraper` — the exact actor my-toolkit recommends to dodge the $0.50 minimum charge); `getApifyUsage()` tracks credit burn
  - Post Bridge — `lib/post-bridge.ts`
  - R2 — `lib/r2.ts` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`)
  - Upstash Redis KV (`KV_REST_API_URL`, `KV_REST_API_TOKEN`)
- **Crown jewels:**
  - `lib/post-bridge.ts` — **the most hardened PB client in the fleet.** Jittered backoff on `create-upload-url` 500s, full retry loop on pagination, per-platform `platform_configurations` matrix, idempotency, multi-media carousel support via `r2Keys[]`. Should be the base of the engine's PB service, ahead of bookshelf's variant.
  - `lib/store.ts` — VideoSource schema (scraper vs. upload), origin-account provenance, cycle-based rotation state.
  - `lib/recycler.ts` — staggered re-poster: per-account cycle rotation with retry-on-failure and per-account targeting.
  - `lib/winners/` — engagement-ranked re-posting; UI dashboard on top.
  - `WINNERS_MODULE_PLAN.md` + `SAAS_PLAN.md` — architectural notes for the multi-tenant SaaS evolution (per-tenant KV key prefix `t:{tenantId}:*`, per-tenant PB keys, encrypted credential storage). Useful input alongside simplepostr's schema.
- **State:** single-tenant MVP; all core flows wired. Known-good ceiling: no first-comment, no per-platform scheduled delays (matches the my-toolkit PB gap notes). Upstash KV is not the target stack.
- **Consolidation:** **`lib/post-bridge.ts` becomes the base of `src/services/posting/`** — merge with tinkerboxxx's rate-limited paginator (already flagged in the extraction map). The winners module goes into `src/modules/` as its own content type. Migrate Upstash → Postgres. Do NOT reach for Higgsfield/OpenAI/email inside this module without explicit sign-off (per the "authorized connectors" rule).

### socialato — PROTOTYPE (gated — do not proceed past Phase 0 without sign-off)

- **Purpose:** Media-curation assistant: upload a photo/video dump ("bucket") → run vision (Claude Opus) to score each item's relevance to a stated intent → surface a ~15-item shortlist → approve/reject → assemble an Instagram carousel + caption. Phase 0 gates on a vision-reliability test; Phase 1 is the carousel output; Phase 2 is video remixing with rambles; Phase 3 is direct publishing.
- **Stack:** Next.js 16 + React 19; **Anthropic `claude-opus-4-7` via AI SDK**; AWS S3 for media ingest (file is misnamed `lib/r2.ts` — actually S3 SDK; the naming should be corrected). Vercel Blob for preview cache. **No database yet** — the Phase 1 spec calls for Postgres + pgvector.
- **External APIs / key references** (env-only; **no committed secrets**):
  - Anthropic — `lib/anthropic.ts` (`ANTHROPIC_API_KEY`, per-item `costUSD()` tracking — separates Opus input/output/cache tokens)
  - AWS S3 — `lib/r2.ts` (should be renamed)
  - Vercel Blob — preview cache
- **Crown jewels:**
  - `lib/anthropic.ts` — **per-item Opus cost tracking** (input / output / cache priced separately). If cost transparency ever becomes a feature, this is the pattern.
  - `app/api/analyze/[slug]/route.ts` — vision-tagging pipeline; the Phase 1 spec wants frame extraction + tags + postability score + per-item embeddings.
  - `app/api/shortlist/[slug]/route.ts` — semantic retrieval + ranking stub.
  - `CLAUDE.md` — the authoritative build spec with **hard gates** ("Gate 1: vision-reliability test must pass before Phase 1"). This is the strongest example in the fleet of a codebase gating its own scope creep — worth adopting fleet-wide.
- **State:** early prototype; API routes stubbed; no embedding storage or semantic retrieval yet. Phase 0 not signed off.
- **Consolidation:** **do not integrate until Phase 0 is signed off.** The cost-tracking pattern and the hard-gate spec discipline are portable ideas rather than portable code. When Phase 1 lands, the vision-tag-and-shortlist pipeline is a candidate for the engine's asset-ingest surface (goes with facebook-library's "performance-ranked" idea).

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

Explicitly **not** carried: the Redis-only storage layers (generator/creator, siggy, reposter's KV, ai-ugc-pipeline's KV, meme-maker's raw SQL layer), single-`APP_PASSWORD` auth, pinfactory's Pinterest v5 client, bookshelf's pg-boss/cron plumbing, aesthetic's dead OAuth/MCP subsystem, tslides' Apify mirroring UI (unless competitive cloning becomes a module — spec question), tropesite's SQLite/static-deploy machinery, facebook-library's client-side OCR (redo at ingest), all Python CLI scaffolding, siggy entirely, kinetic entirely, book-video-bot's DIY scheduler, simplepostr's Meta OAuth stack (Post Bridge is the posting layer), dictabook's Stripe billing (out of scope), authorbids in full (out of scope), ai-ugc-pipeline's use of the banned `soul_2` Higgsfield model.

**New extractions from the third pass** (drop into the extraction map at the natural rows above):
| What | Source | Lands in |
|---|---|---|
| Multi-tenant tenancy schema (workspaces, memberships, entitlements, quota reservations, audit_logs, encrypted social_accounts) | simplepostr `lib/db/` | core schema of the new engine |
| Envelope AES-256-GCM encryption for at-rest credentials (DEK-in-env, KMS-swappable) | simplepostr `lib/crypto/envelope.ts` | `src/lib/crypto/` |
| pgcrypto AES-GCM per-user LLM-key pattern + RLS policies + `event_log` | inkwell `lib/crypto/api-key.ts`, `supabase/migrations/0001_init.sql` | core schema + Supabase RLS layer |
| argon2id passwords + email verification + 30-day session cookies | simplepostr `lib/auth/session.ts` | `src/lib/auth/` |
| Hardened Post Bridge client (jittered 500-retry on `create-upload-url`, per-platform config matrix, multi-media carousel) | reposter `lib/post-bridge.ts` | base of `src/services/posting/` (merge with tinkerboxxx's rate-limited paginator) |
| Checkpoint-enforcement state machine (human gates prevent LLM drift) | ai-ugc-pipeline `lib/pipeline/state-machine.ts` | `src/services/pipeline/` (map onto Inngest steps + `waitForEvent`) |
| Combo-rotation scheduler (`(textVariant, bgPrompt)` mod postCount) + sibling-account 30-min spacing | meme-maker `lib/scheduler.ts`, `state/schema.sql` | `src/services/scheduling/` |
| Remotion WebGL chroma-key rendering pipeline | meme-maker (`Remotion 4` worker) | `src/services/rendering/video` (fourth renderer alongside sharp / text-to-svg / Pango) |
| Ffmpeg handheld-wobble + Ken Burns + safe-zone title renderer | book-video-bot `lib/video.js` | `src/services/rendering/video` |
| Typed-PUBLISH danger-dialog + per-account checkbox + pull-back delete UX | book-video-bot `app/publish/*` | shared publish-confirm surface |
| Register-scored hook generator (10-register taxonomy + pattern library) | trialreels `lib/hook-prompt.ts` | `src/services/ai/prompts/` (romance-specific) |
| Claude-vision scene / book distillers | trialreels `app/api/ai/{analyse-scene,analyse-book,extract-scenes}.ts` | `src/services/ai/prompts/` |
| Few-shot calibration-example caption prompt + four documented formulas | quadrants `src/lib/captions.ts`, `formulas.ts` | `src/services/ai/prompts/` |
| 2×2 quadrant Satori renderer + serif overlay templates | quadrants `src/lib/grid-renderer.ts` | `src/modules/slideshow/templates/` |
| Winners module (engagement-ranked re-posting) | reposter `lib/winners/` | `src/modules/winners/` |
| Whisper 25 MB oversize-detect + ffmpeg re-encode | dictabook `app/api/transcribe/route.ts` | `src/services/ai/whisper/` (only if audio ever ships) |
| Per-item Opus cost tracking (input/output/cache split) | socialato `lib/anthropic.ts` | `src/lib/observability/cost.ts` |
| Phase-gate discipline (no-write executor, spec-before-code, hard-gates in CLAUDE.md) | authorbids `specs/*.md` + `src/lib/amazon/client.ts`; socialato `CLAUDE.md` Gate 1; ai-ugc-pipeline `HUMAN_CHECKPOINTS` | fleet-wide engineering norm — bake into the engine's own spec |

---

## Consolidated external APIs / keys the new app will need

| Service | Used for | Seen in |
|---|---|---|
| **Post Bridge** | all posting + analytics | bookshelf, book-social-media, generator, creator, tslides, aesthetic, tinkerboxxx, meme-maker, book-video-bot, reposter, quadrants (⚠️ bookshelf has owner+shared keys; PB rate cap ~10 req/s; `social_account_id` filter silently ignored; deep pagination 500s) |
| **Anthropic** | copy/script/vision (claude-sonnet-4-6 / opus-4-7 everywhere) | 18 of 25 audited apps |
| **Google Gemini** | image gen + vision QA (direct + via AI Gateway) | storyforge, bookshelf, generator, creator, tslides (as NSFW-tolerant fallback), meme-maker, book-video-bot |
| **Vercel AI Gateway** | model routing/failover (`AI_GATEWAY_API_KEY` / OIDC) | generator, creator, tslides, bookshelf |
| **OpenAI** | gpt-image-1/2 image gen, Whisper, gpt-4o-mini vision | bookshelf, tslides, tinkerboxxx, quadrants (fallback), dictabook (Whisper), siggy (raw fetch — insecure) |
| **Higgsfield** | primary image gen — MCP OAuth (bookshelf, tslides, ai-ugc-pipeline, quadrants) vs Clerk-cookie "unlimited" (aesthetic). ⚠️ ai-ugc-pipeline calls the banned `soul_2` model | bookshelf, tslides, aesthetic, ai-ugc-pipeline, quadrants |
| **Apify** | TikTok/FB scraping | tslides (`APIFY_TOKEN`), facebook-library (data source), reposter, book-video-bot (Goodreads) |
| **Upstash Redis** | KV store (legacy — being replaced) | generator, creator, siggy, reposter, ai-ugc-pipeline |
| **Neon Postgres + Drizzle** | target relational stack | tslides, bookshelf, simplepostr, authorbids, quadrants, meme-maker (raw SQL), book-video-bot (raw SQL) |
| **Supabase** | DB/auth/storage (target stack; already live in several apps) | tinkerboxxx, inkwell, trialreels, dictabook |
| **Cloudflare R2** | S3-compatible video store | reposter |
| **Replicate** | Demucs vocal separation | bookshelf |
| **ElevenLabs** | TTS narration | storyforge |
| **Resend** | failure/alert email | bookshelf, generator, creator, tslides, tinkerboxxx, simplepostr |
| **PublisherChamp** | analytics | generator, creator |
| **Google OAuth** | user auth | creator, inkwell (Supabase-mediated), trialreels (+ email allowlist gate), dictabook |
| **Stripe** | usage / plan billing | dictabook (per-audio-minute), simplepostr (test-mode only) |
| **Pexels** | free-tier image search | trialreels |
| **Sentry** | error tracking | dictabook |
| **Remotion** | WebGL video rendering (worker) | meme-maker |
| **Pinterest v5 OAuth** | direct pinning (reference only) | pinfactory |
| **Amazon Ads (LWA OAuth)** | ad-management API (out of engine scope) | authorbids |
| **Amazon Associates** | affiliate links (SEO module only) | tropesite |
| Internal secrets | `CRON_SECRET` (→ Inngest signing key), `TOKEN_ENCRYPTION_KEY`/`TSLIDES_TOKEN_SECRET`/`ENCRYPTION_KEY`/`ENVELOPE_DEK` (keep the AES-GCM pattern; simplepostr's envelope + inkwell's pgcrypto are the two best per-user models — avoid tslides' weak `DATABASE_URL` fallback) | several |

**Security findings across all 25 audited apps:**
1. 🔴 **slideshow-generator: live `CRON_SECRET` committed in a public repo** (see box at top). Rotate now. Still the only committed-secret leak found.
2. 🟡 **siggy**: `app/api/claude/route.ts:6` accepts an `_apiKey` field in the POST body, leaks the system prompt in 500-error bodies, and the Redis KV store is unauthenticated. **Recommend: delete the deployment**; do not port.
3. 🟡 **ai-ugc-pipeline** calls the banned Higgsfield `soul_2` model in violation of the fleet-wide hard rule. Rework around Seedance only before this can go into the engine.
4. 🟡 generator `generate-slides` route gates on `process.env.PASSWORD` instead of `APP_PASSWORD` — likely unauthenticated in prod.
5. 🟡 tslides `lib/crypto.ts` token-encryption key silently falls back to `DATABASE_URL` → literal dev string; set `TSLIDES_TOKEN_SECRET`.
6. 🟡 aesthetic's Higgsfield Clerk cookie is a full account credential in env (by design; ToS-gray "unlimited mode" — decide if the consolidated app keeps this or the sanctioned MCP path).
7. 🟡 creator's `analyze-slide`/`describe-image`/`fetch-image-url` fetch arbitrary user URLs server-side (SSRF surface) — the new engine needs allowlisting.
8. ⚪ tslides/aesthetic/reposter Blob/R2 assets are public-if-URL-known; fine for posts, not for private workspace assets.
9. ⚪ **False alarms verified and dismissed** (via `git ls-files` in each per-app repo): the flags on `meme-maker`, `trialreels`, `simplepostr`, `reposter`, and `kinetic`'s `.env.local` / `.env.check` files. Every one of those is properly gitignored. Only `.env.example` / `.env.local.example` variants are tracked. `kinetic` has no `.git` directory at all. On-disk env values on your dev machine are private, not committed.

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
2. **Core scaffold:** target Postgres (Neon or Supabase) + Drizzle. Seed the **tenancy schema from simplepostr** (workspaces, memberships, entitlements, quota_reservations, audit_logs, encrypted social_accounts) — it's already the closest match to the target and is in production. Layer **inkwell's pgcrypto per-user LLM-key pattern + RLS policies + event_log** on top. Add bookshelf's `cards` state machine + tslides' slideshow/book tables. Inngest wiring; envelope encryption (simplepostr) for at-rest social credentials.
3. **Posting service:** **reposter `lib/post-bridge.ts` is the new base** — most hardened in fleet — merged with tinkerboxxx's rate-limited paginator and generator's non-retryable-POST rule + verification helpers; per-workspace keys and default-deny allow-list of `allowedAccountIds` (my-toolkit finding: PB has no workspace isolation).
4. **Scheduling service:** bookshelf windows/caps + tslides two-phase dispatcher/retry classifier + pinfactory anti-spam + LRU anti-repeat + **meme-maker's deterministic combo-rotation + sibling-account 30-min spacing**, as Inngest functions.
5. **Pipeline runtime:** port **ai-ugc-pipeline's checkpoint-enforcement state machine** onto Inngest (`waitForEvent` for `HUMAN_CHECKPOINTS`) — makes drift-prevention native to every module. **Fix first: replace `soul_2`** so this can be lifted.
6. **Asset library:** storage buckets + brand kits (pinfactory fonts/palettes, bookshelf style recipes, aesthetic prompt bank) + performance-metrics-on-assets; **import facebook-library's 999 posts now** (re-host images, OCR at ingest).
7. **Slideshow module (Module #1):** per the head-to-head — tslides structure, generator/creator prompt IP, one of the two proven overlay renderers, no-text guard, fallback chain w/ content-rejection routing, QA gate. Add **quadrants' few-shot calibration-caption formula system** and the 2×2 quadrant template.
8. **Copy/caption service:** merged prompt library + LLM-JSON hardening; per-item **Opus cost tracking from socialato**.
9. **Approval/review UI** across content types — adopt **book-video-bot's typed-PUBLISH + per-account checkbox** as the standard publish-confirm surface.
10. **Ops dashboard:** absorb tinkerboxxx Manager cross-check.
11. **Video renderers** as they become needed: bookshelf ffmpeg + kinetic-captions engine (primary); aesthetic sepia-grade + drawtext + beat-sync (quote video); book-video-bot handheld-wobble + Ken Burns (BookTok); meme-maker Remotion WebGL chroma-key (green-screen memes).
12. Later modules per spec (winners re-poster from reposter, competitive cloning from tslides, narrated video from storyforge/bookshelf, SEO site from tropesite) subject to the real `content-engine-architecture.md`.

---

## Blockers & questions — need answers before going further

1. **Where is `content-engine-architecture.md`?** Still not in this repo. The three seed artefacts we now have: **my-toolkit `patterns/slideshow-consolidation-spec/SPEC.md`** (2-app slideshow consolidation), **simplepostr `docs/spec.md`** (multi-tenant SaaS shape already shipped), and **authorbids `specs/{schema,rules-engine,executor}.md`** (phase-gating discipline). Decide: widen the slideshow-consolidation SPEC into the fleet-wide spec, or write the content-engine spec fresh with all three as input.
2. **inkwell scope check:** the `ccas77/inkwell` repo is a **Sudowrite-style AI fiction-writing tool**, orthogonal to the slideshow-consolidation SPEC. As a writing tool it may sit outside the content-engine consolidation scope entirely — owner to decide whether it belongs in the 24-app roll-up.
3. **Remaining unreachable sources (down from 7 to 2):** `bookslide` and `public` — neither is present locally either. `aimoviebot` remains a Vercel-project-deletion candidate. `kinetic` is present locally but has no `.git` at all — treat as never-shipped prototype, decide keep-or-delete.
4. **Is the local `bookshelf` folder the same code as the Vercel project + the private `ccas77/bookshelf` repo?** Still open — `ccas77/bookshelf` doesn't exist on GitHub.
5. **Scope check:** should `video-generator`, `book-boyfriend`, `book-writer-app`, `bookpulls-runbook` be considered? (All present locally; not yet audited.)
6. **Policy questions surfaced by the audit** — now four:
   - Keep the censorship / `is_aigc:false` platform-evasion features?
   - Keep aesthetic's Clerk-cookie Higgsfield bypass or standardize on the MCP path (bookshelf/tslides/quadrants/ai-ugc-pipeline)?
   - Is competitive cloning (tslides) a module? Is the winners re-poster (reposter) a module?
   - **NEW: replace `soul_2` in ai-ugc-pipeline** (`lib/higgsfield/mcp-client.ts:138`) — the hard ban on Higgsfield `soul_*` / `marketing_studio_*` is being violated in production; pipeline needs a Seedance-only rework before it can enter the engine.
7. **NEW: siggy retirement.** Ship a deletion of the Vercel deployment before that endpoint gets discovered — it's an unauthenticated Redis + API-key-in-request-body + prompt-leaking service.
