# Content Engine — Architecture

**Status:** Blueprint for implementation. Written 2026-07-10, derived from AUDIT.md (13-app audit) and my-toolkit's `patterns/slideshow-consolidation-spec/SPEC.md`, widened to fleet scale.
**Rule carried over from that spec: do not deviate from this doc silently — log deviations in `DECISIONS.md` as you build.**

## 1. What this is

One web app that replaces the ~24 single-purpose social-media apps. It generates book-marketing content (images, slideshows, videos, copy), holds it in a reviewable library, and posts it to TikTok/Instagram/Facebook/Pinterest on schedules via Post Bridge — multi-user, multi-pen-name, one codebase.

**Non-goals (v1):** no SEO static sites (tropesite stays standalone), no fiction-writing tools (inkwell stays standalone), no competitive-cloning ingest (tslides' Apify mirror — deferred until the owner decides it's wanted), no direct platform APIs (Post Bridge only).

## 2. Stack (fixed — do not relitigate)

| Concern | Choice | Why / source |
|---|---|---|
| Framework | Next.js (App Router, current stable) + TypeScript | fleet standard |
| DB | Supabase Postgres via **Drizzle** ORM + migrations | target stack; schema patterns proven in bookshelf + tslides |
| Auth | Supabase Auth (Google sign-in), roles: `admin`, `member` | replaces creator's hand-rolled OAuth/JWT |
| Storage | Supabase Storage buckets (private by default; public bucket only for outbound post media) | fixes tslides/aesthetic public-blob issue |
| Jobs/scheduling | **Inngest** (replaces every Vercel cron + pg-boss + two-phase dispatchers) | target stack |
| Posting | Post Bridge only | fleet standard |
| Image gen | Gemini 2.5 Flash Image (primary, via Vercel AI Gateway) → configurable fallback chain | owner's plan; tslides proved Gemini tolerates romance content OpenAI rejects |
| Copy/vision LLM | Claude (claude-sonnet-4-6) via direct API | every app uses it |
| Video/captions | `@ffmpeg-installer/ffmpeg` — **never `ffmpeg-static`** (lacks drawtext/libass) | my-toolkit word-timed-captions runbook; overrides the old spec |
| Text overlay | SVG-glyph-path approach (text-to-svg + sharp; tslides `lib/overlay.ts`) | fontconfig-free, proven on Vercel. Pango variant (generator) documented as fallback if emoji rendering is required |
| Email alerts | Resend | fleet standard |

Repo layout (new standalone repo, e.g. `ccas77/content-engine`):

```
content-engine/
  src/
    app/               # Next.js routes (UI + API)
    services/          # shared capabilities (no module imports services→modules)
      posting/         # Post Bridge client + verification
      scheduling/      # windows, caps, anti-spam, LRU pickers (Inngest fns)
      ai/              # llm.ts, image-gen.ts, prompts/, qa/
      rendering/       # overlay.ts, video.ts, captions/
      assets/          # asset library CRUD, ingest, brand kits
      observability/   # event log, status, cross-check
    modules/           # content types; each implements ModuleHandler
      slideshow/       # Module #1
    lib/db/            # drizzle schema + migrations
  inngest/             # function definitions
  DECISIONS.md
```

## 3. Domain model (Drizzle schema — the load-bearing decisions)

Core tables (adapt column detail from bookshelf `src/lib/db/schema.ts` + tslides' migrations):

- **workspaces** — one per user-group. Every row below is workspace-scoped (`workspace_id` FK + RLS).
- **users / workspace_members** — Supabase auth users mapped to workspaces with roles.
- **pen_names** — sub-entity of a workspace (a workspace has many pen names; each has voice/brand defaults). *Decision made: pen name ≠ workspace.*
- **social_accounts** — Post Bridge account IDs with **per-user allow-lists**. ⚠️ Post Bridge has NO isolation: one API key sees every connected account (my-toolkit CLAUDE.md:190). Default-deny: a user can only post to accounts explicitly granted. This is enforced in `services/posting`, not trusted to the API.
- **books** — the content source entity: title, author/pen name, covers, excerpts, captions bank, hashtags bank, audio tracks (per-book asset banks, from tslides/bookshelf).
- **assets** — the workspace asset library: images/fonts/audio/video + `visibility` (`workspace` | `private`), `origin` (uploaded/generated/ingested), **engagement metrics columns** (views/likes/shares, source platform, rank) so "what worked" is queryable (facebook-library pattern).
- **brand_kits** — semantic palette + font roles (pinfactory `themes.yaml` model) + optional AI "style recipe" text (bookshelf recipe pattern).
- **content_items** — the universal state machine: `draft → pending_review → approved → scheduled → publishing → published | failed | rejected`. One row per generated deliverable regardless of module. Append-only **event_log** records every transition (bookshelf pattern).
- **automation_configs** (user-edited) **vs automation_state** (machine-edited) — two tables, never one. This split (from the my-toolkit spec) is what kills the read-modify-write races the old apps fought.
- **post_log** — append-only record of every Post Bridge submission + verification result.
- **fires** — scheduled posting instances with unique `(config_id, fire_date)` dedup (tslides two-phase pattern, re-expressed as Inngest runs).

## 4. Services

### posting/
Merge of the two best Post Bridge implementations (per AUDIT):
- Fetch core from my-toolkit `patterns/postbridge-analytics/analytics.js`: ~8 req/s promise-chain self-throttle, 429 retry driven by response `rate_limit.reset_ms`, deep-page-500 graceful degradation, MAX_PAGES ceiling.
- Typed surface from `patterns/postbridge/post-bridge.ts` (+ bookshelf's idempotency guard).
- Rules encoded, non-negotiable: `POST /v1/posts` is **never retried** (duplicate-post incident 2026-05-08); every post is **verified after creation** by re-listing and matching client-side (`social_account_id` filter is silently ignored by PB); per-user account allow-list checked before every call; `is_aigc` flag is a per-workspace setting, not hardcoded.
- Post-publish verification + tinkerboxxx-style cross-check (claimed vs confirmed vs missing = silent failure) runs as an Inngest follow-up job.

### scheduling/
All Inngest. Ports: bookshelf's posting windows/daily caps/DST handling; tslides' two-phase enumerate→fire shape and transient-vs-permanent error classifier; pinfactory's anti-spam (rolling caps, per-URL spacing, quarantine, circuit breaker); tslides' `pickFresh` LRU anti-repeat for content selection. Plus tinkerboxxx's dead-account (zero-views) daily alert via Resend.

### ai/
- `image-gen.ts`: single entry point. Wraps every prompt with the **no-text guard** ("Generate an image with NO text, words, letters, or writing anywhere in the image: …"). Fallback chain configurable per workspace, default `gemini-2.5-flash-image` → `imagen-4.0` → OpenAI, with tslides' `isContentRejection()` routing (safety-refused prompts skip to the tolerant model).
- `prompts/`: the consolidated prompt library, imported nearly verbatim from the audited apps — slide-planning GUIDE/EDITOR/truncate + censorship engine (generator), Top-N BookTok generator (generator), vision-to-prompt reverse engineering (tslides `analyze.ts`, merged with tinkerboxxx's nano-banana image-to-prompt rules), caption generator + its 5 design rules (my-toolkit ai-riffed-captions: one paragraph, exactly-N, drop empty fields, genre-neutral, no em dashes), book-marketing post taxonomy (book-social-media), grounded no-fabrication rules (tropesite), style-recipe distillation (bookshelf). Each prompt is a versioned TS module with typed I/O (zod).
- `qa/`: visual QA gates — bookshelf's cover-check (transcribe-and-vote) and storyforge's drift-QC generate→score→retry loop, exposed as an optional step any module can enable.

### rendering/
- `overlay.ts`: tslides SVG-glyph-path renderer, extended with: configurable fonts from brand kits (pinfactory's 12 OFL fonts seed the library), auto-fit-to-box sizing (pinfactory `fit_text` logic), scrim gradient, TikTok safe zones (generator SAFE_TOP=280/SAFE_BOTTOM=480).
- `video.ts`: slides→MP4 (per-slide durations, audio loop) + Ken Burns + storyforge's xfade/audio-ducking/loudnorm; aesthetic's sepia-grade + beat-sync cut logic as an optional style.
- `captions/`: bookshelf's ASS kinetic captions + Whisper word timestamps (my-toolkit runbook constraints: TTF only, `\an8\pos(540,460)`, `-filter_complex_script`).

### assets/ and observability/
Asset ingest (upload, generate, or import — first import job: facebook-library's 999 posts, re-hosted + OCR'd, **time-sensitive**). Observability = event log UI + fleet-style status page + posting cross-check dashboard (port tinkerboxxx Manager once the engine replaces the fleet).

## 5. Modules

Every module implements one interface (evolved from the my-toolkit spec's `AutomationHandler`):

```ts
interface ModuleHandler {
  key: string;                        // 'slideshow'
  selectContent(ctx): Promise<Selection>;   // uses LRU pickers
  generate(ctx, sel): Promise<ContentItem>; // AI + rendering; idempotent, resumable per-step (Inngest steps)
  buildPost(item): Promise<PostSpec>;       // caption, media, platform config
}
```

One generic Inngest dispatcher drives every module through the state machine (no per-module cron files — this is the single biggest de-duplication vs the old fleet).

### Module #1: slideshow
The synthesis chosen in AUDIT.md's head-to-head:
1. **Input paths:** (a) book passage → Claude slide-planning prompt (generator's GUIDE: beats, backloading, censorship) → slide texts; (b) reference image → vision-to-prompt (tslides) → regenerable prompt + reworded text; (c) manual.
2. **Structure:** hook slide → excerpt slides → cover slide (tslides), with pinfactory's template set (headline / quote / checklist / comp / stats / trope-hook) as layout options.
3. **Render:** Gemini background (no-text guard, fallback chain) → overlay renderer with brand-kit theme → 1080×1920.
4. **QA:** optional cover-check gate when a real book cover is composited.
5. **Output:** TikTok photo carousel (≥2 slides enforced) and/or IG carousel (≤10, `truncate` action) and/or MP4.
6. **Review:** lands in `pending_review` with a gallery UI (approve/reject/regenerate-one-slide — storyforge pattern); publishing only from `approved`.

Later modules, in audit-suggested order: quote-video (aesthetic), Top-N lists (generator), kinetic-caption video (bookshelf), memes (pending meme-maker audit), narrated story video (storyforge). Each is a folder + handler, nothing more.

## 6. Hard-won rules (encode as code/comments, not tribal memory)

1. Post Bridge: 10 req/s cap; never retry post-create; verify after create; deep pagination 500s; no workspace isolation → allow-lists; no first-comment support (IG first-comment needs native API — deferred).
2. Images: no-text guard on every gen; content-rejection → tolerant-model routing; never bake text into AI images.
3. ffmpeg: `@ffmpeg-installer/ffmpeg`; TTF fonts only; safe-zone caption positioning.
4. Apify (when competitive-cloning lands): `clockworks~tiktok-profile-scraper` (no $0.50 minimum), `slideshowImageLinks` order is truth, KV downloads need auth header.
5. Copy: no em dashes (house rule, enforced in prompts + a lint script); "exactly N" phrasing; drop empty source fields from prompts.
6. Secrets: env-only, zod-validated at boot (tslides pattern); AES-GCM for stored OAuth tokens **without** weak fallbacks (fix tslides' bug); `.claude/` in `.gitignore` from day one.
7. Every bounded list/cap logs what it dropped. Every automation writes to event_log.

## 7. Build order (milestones a session can execute one at a time)

1. **M0 scaffold:** repo, Next.js + Drizzle + Supabase + Inngest wiring, auth, workspaces/members/pen_names, event_log. CI: typecheck + build.
2. **M1 posting core:** social_accounts + allow-lists, posting service (merged client), post_log, manual "post this image now" flow end-to-end against a PB test account. *DRY_RUN mode from day one (bookshelf pattern: placeholder generators, zero paid calls).*
3. **M2 asset library:** assets + brand_kits + upload/ingest + the facebook-library import job (OCR at ingest).
4. **M3 slideshow module:** prompts ported, image-gen service, overlay renderer, review gallery, content_items state machine.
5. **M4 scheduling:** automation_configs/state, Inngest dispatcher, windows/caps/anti-spam/LRU, verification cross-check job, dead-account alert.
6. **M5 migration:** cut one real account over from slideshow-generator/creator; run both in parallel a week; compare post_log vs old apps; then decommission the pair (their Redis data exported via a one-off script).
7. M6+: next module, repeat.

## 8. Open items (do not block M0–M2 on these)

- `is_aigc` and censorship-engine policy: per-workspace toggles exist; owner decides defaults. Platform-ToS risk is the owner's call.
- Higgsfield: not in v1 (Gemini-first). If added, use the MCP OAuth pattern (my-toolkit), not the Clerk-cookie bypass.
- Competitive-cloning module (tslides front end): owner decision.
- The third audit pass (see AUDIT.md) has since covered the rest of the fleet. Candidates it surfaced to fold into the module roadmap after M4: meme-maker's combo-rotation scheduler + Remotion chroma-key renderer, quadrants' carousel factory + few-shot caption prompt, reposter's Post Bridge client (AUDIT calls it the most hardened in the fleet — compare against §4's merged client before finalizing), ai-ugc-pipeline's checkpoint state machine, book-video-bot's wobble+drift renderer, trialreels' hook generator. Out of engine scope per that pass: inkwell, dictabook, authorbids (standalone), siggy + kinetic (delete). Nothing in M0–M4 changes.
