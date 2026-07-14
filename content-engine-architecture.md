# Content Engine — Architecture

**Status:** Blueprint for the app that replaces the fleet. Written 2026-07-10, revised same day (16-section expansion of the original 8-section blueprint that M0-M2 was built against). Inputs: `AUDIT.md` in this repo (25-app audit, three passes), `my-toolkit/patterns/slideshow-consolidation-spec/SPEC.md` (2-app slideshow consolidation), `simplepostr/docs/spec.md` (multi-tenant SaaS shape already shipped), `authorbids/specs/{schema,rules-engine,executor}.md` (phase-gating discipline), `my-toolkit/CLAUDE.md` (Post Bridge + Higgsfield MCP + captions runbooks).
**Convention:** deviations from this document are logged in `content-engine/DECISIONS.md` at commit time — never silently. Sections numbered 0-16 to match the approved outline; each is a hard contract with the implementation.

---

## 0. Preamble, scope, glossary

### 0.1 What this document is

A build spec for one Next.js app — `content-engine` — that replaces the ~24 single-purpose social-media apps audited in `AUDIT.md`. It generates book-marketing content (images, slideshows, videos, copy), holds it in a reviewable library, and posts it to TikTok / Instagram / Facebook / Pinterest through Post Bridge, multi-user, multi-pen-name, from one codebase. The spec locks in the load-bearing decisions (stack, tenancy, posting rules, module contract, security posture) so that implementation sessions execute milestones without relitigating them.

### 0.2 What it is not

- A UX spec. Screens and flows are captured in module docs as each module lands.
- A migration playbook for individual old apps — `AUDIT.md` §"Extraction map" is authoritative for what moves where.
- Product roadmap beyond M6. Modules past slideshow / scheduling / winners are stubbed; the module contract in §11 is what makes adding them cheap.

### 0.3 Success criteria

1. One deployed app running against one Neon/Supabase database with per-workspace isolation.
2. Slideshow module reaches production parity with `slideshow-generator` + `slideshow-creator` (planning prompt, censorship, no-text guard, Post Bridge scheduling, verification) — the two Vercel projects can be turned off without loss.
3. Fleet-wide invariants of `AUDIT.md` §"Hard-won rules" are enforced in code, not tribal memory (no em dashes, no `soul_*` Higgsfield models, Post Bridge rules, DRY_RUN by default, etc.).
4. Every append past M4 fits under the §11 module contract with no schema surgery.

### 0.4 Non-goals for v1

No direct platform APIs (Post Bridge is the only publisher). No SEO / static-site module (`tropesite` stays standalone). No fiction-writing UI (`inkwell` stays standalone — the SPEC rename in `my-toolkit` deliberately dropped the "Inkwell v2" alias to avoid confusion). No competitive-cloning ingest (`tslides` Apify mirror — deferred to owner decision). No Amazon Ads (`authorbids` remains its own app). No `siggy`, no `kinetic` — both flagged for deletion by AUDIT.

### 0.5 Glossary

- **Workspace** — the tenancy boundary. Every table is `workspace_id`-scoped; RLS enforces.
- **Pen name** — a sub-entity of a workspace (a workspace holds many pen names, each with brand + voice defaults). Not a tenant — `pen_name_id` is a column, not a partition.
- **Content item** — one generated deliverable of any module, moving through the `draft → pending_review → approved → scheduled → publishing → published | failed | rejected` state machine.
- **Module** — a content type (`slideshow`, `winners`, `quote-video`, …) implementing the §11 `ModuleHandler` contract. One folder + one handler; no per-module cron files.
- **Fire** — one scheduled publish instance produced by the scheduler for one `(automation_config, fire_date, slot)` triple. Idempotent by that key.
- **PB** — Post Bridge (`api.post-bridge.com`). Shared social-posting layer. See `my-toolkit/CLAUDE.md` for the client + gotchas.

---

## 1. Product shape

### 1.1 One-line product

A book-author content operation, running from a browser: build a book's asset library once, generate posts on demand or on schedule, approve or edit before they publish, watch the results.

### 1.2 Actors and what they do

- **Owner** — creates the workspace, pays the bill, invites members, holds the platform keys (PB, AI Gateway, Higgsfield if used).
- **Admin (workspace)** — same operational powers as owner minus billing; manages pen names, brand kits, social account allow-lists, member permissions.
- **Member** — creates and edits content items, runs modules, approves/rejects, schedules against automations they have access to. Cannot alter allow-lists, brand kits, or billing unless granted the specific permission.
- **System (Inngest functions)** — the only actor that transitions items to `scheduled → publishing → published`. Runs anti-spam checks, LRU pickers, Post Bridge submission, verification, and event-log writes. Never mutates user-editable config.

### 1.3 The two operational modes

1. **On-demand.** User picks a module, feeds it a source (book passage, reference image, uploaded photo), reviews the generated item(s), approves, and publishes now or schedules.
2. **Automation.** A `(module × pen_name × social_accounts × schedule window)` config runs on a cadence. Content flows from a curated pool (LRU anti-repeat) through generation → optional review gate → publish. Automations respect anti-spam caps, DST-safe windows, sibling-account spacing.

### 1.4 Review discipline

Every module opts into a review gate. Default is on for anything that leaves the app. Approved items are immutable — edits produce a new revision. Rejection sends the item back to the module for regeneration with the reviewer's notes appended to the prompt (storyforge/pinfactory pattern; converges independently in three audited apps).

### 1.5 Explicit product principles

Distilled from the audit's "what worked" and the my-toolkit + simplepostr specs:

1. **Setup is not consent for live-mode.** DRY_RUN is the default across every side-effectful path; live-mode requires an explicit workspace flag AND a real credential. Once live-mode is authorized for a workspace, individual scheduled posts do NOT require typed confirmations (feedback memory: "scheduled posts should not require per-post manual gate").
2. **Every producer surfaces its output in the app.** No pipeline is complete when it fires-and-forgets to a third party — the item, its preview, and its download link must live in the review UI (feedback memory: "app must surface its own outputs").
3. **Bulk paths beat per-item forms.** Any list surface (books, prompts, captions, hashtag banks, imports) exposes paste-many / CSV alongside single-add.
4. **Explanations live in-app.** Feature help ships as HelpCard entries next to the feature, not as chat text (feedback memory).
5. **No em dashes anywhere.** Ban is enforced by lint script + AI prompt instructions. Hyphens, commas, or a sentence break.
6. **User thinks in aspect ratios.** UI leads with 1:1, 9:16, 3:2; pixels are export metadata surfaced on hover.
7. **Times default to Europe/London.** Never UTC in the UI. UTC is a storage detail.
8. **No user-side friction to paper over server bugs.** If a publish went wrong, fix the code — don't add typed-PUBLISH friction to the user flow.
9. **Save is explicit.** Multi-field editors keep a draft with a sticky "Unsaved changes — Save / Discard" bar; no autosave-on-change (feedback memory).

### 1.6 Explicitly out of scope

Real-time comments/inbox; recurring cron schedules more complex than the window model in §6; team approval chains (single-reviewer gate only); public API; native mobile app (mobile PWA is the mobile surface); analytics beyond post status + engagement metrics on assets; anything Amazon-Ads-shaped.

---

## 2. Target stack

### 2.1 The fixed choices

| Concern | Choice | Why / source |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | fleet standard; matches simplepostr, tslides, bookshelf |
| Runtime | Vercel Fluid Compute (Node 24 LTS) | 300s default max duration; no Edge Runtime (compatibility issues per Vercel plugin session context) |
| DB | Supabase Postgres (managed) | target stack; `pg_crypto` + RLS + auth.users trigger already available |
| ORM | **Drizzle** + Drizzle Kit migrations | schema-as-code; proven at scale in tslides (20 migrations), bookshelf, simplepostr |
| Auth | Supabase Auth (Google OAuth) + `profiles` mirror table | replaces creator's hand-rolled JWT; `handle_new_user` trigger keeps `profiles.id = auth.users.id` |
| Storage | Supabase Storage buckets — **private by default**, one public bucket only for outbound post media | fixes tslides/aesthetic public-blob issue |
| Jobs | **Inngest** (single dispatcher, per-module functions, `waitForEvent` for human gates) | replaces every Vercel cron + pg-boss + two-phase dispatcher in the fleet |
| Posting | Post Bridge only | fleet standard; no direct TikTok/Meta clients |
| Image gen | **Gemini 2.5 Flash Image (primary via AI Gateway)** → Imagen 4.0 → OpenAI (fallback) → **owner-gated Higgsfield MCP** | owner plan; tslides proved Gemini tolerates romance content OpenAI rejects; `soul_*` and `marketing_studio_*` Higgsfield models banned |
| Copy / vision LLM | Claude (`claude-sonnet-4-6` default; `claude-opus-4-7` for planning-quality tasks), direct Anthropic API | every audited app uses it |
| Video / captions | `@ffmpeg-installer/ffmpeg` — never `ffmpeg-static` (lacks `drawtext` + `libass`) | my-toolkit word-timed-captions runbook |
| Text overlay | SVG-glyph-path renderer (`text-to-svg` + `sharp`), Pango variant kept as an emoji fallback | tslides `lib/overlay.ts` is fontconfig-free and Vercel-safe; generator's Pango is the emoji answer |
| Email | Resend | fleet standard (bookshelf, generator, creator, tslides, tinkerboxxx, simplepostr) |
| Observability | Sentry + Supabase logs + internal `event_log` table | dictabook proved Sentry; audit calls out the event log as load-bearing |

### 2.2 What the AI Gateway does for free

Gemini + Imagen + OpenAI are all routed via Vercel's AI Gateway with an auto-injected token — no `AI_GATEWAY_API_KEY` env var is required on Vercel deployments (feedback memory: check platform auto-auth before asking for secrets). Direct Anthropic keys remain per-workspace, per §13.

### 2.3 What is NOT in the stack

- No Upstash Redis. Legacy KV storage in generator/creator/siggy/reposter/ai-ugc-pipeline is replaced by Postgres tables (`automation_configs` + `automation_state` split kills the read-modify-write races those apps fought).
- No Cloudflare R2. Supabase Storage is the one bucket layer.
- No Vercel Blob. Same reason.
- No pg-boss / BullMQ / Vercel Cron in isolation. Inngest is the single scheduling substrate.
- No Higgsfield Clerk-cookie "unlimited mode" (aesthetic's pattern). If Higgsfield lands in v1 it uses MCP OAuth per `my-toolkit/patterns/higgsfield-mcp` — raw JSON-RPC, not the MCP SDK client transport (which their server silently rejects).
- No `soul_*` or `marketing_studio_*` Higgsfield models. Hard ban.

### 2.4 Repo layout

```
content-engine/                     # monorepo folder (see DECISIONS.md D-001 for why not a split repo)
  src/
    app/                            # Next.js App Router (UI + API)
    services/                       # shared capabilities. modules import services; services never import modules.
      posting/                      # PB client, submit, verification, cross-check
      scheduling/                   # windows, caps, anti-spam, LRU pickers, Inngest functions
      ai/                           # llm.ts, image-gen.ts, prompts/, qa/
      rendering/                    # overlay.ts, video.ts, captions/
      assets/                       # asset library CRUD, ingest, OCR fan-out, brand kits
      observability/                # event_log writers, cross-check queries, alerts
      crypto/                       # envelope AES-GCM (§13)
    modules/                        # content types; each is one ModuleHandler + templates + prompts
      slideshow/                    # Module #1
    lib/
      db/                           # drizzle schema + migrations
      auth/                         # session, RLS helpers
      tenant/                       # workspace_id resolution + tenant-scoped query helpers
  inngest/                          # function registration + client
  DECISIONS.md                      # deviations from this spec, newest-first
  README.md
```

Rule: `services/` never imports from `modules/`. Modules depend on services, not each other. This is what makes the module contract cheap.

---

## 3. Tenancy and auth

### 3.1 The tenancy boundary

A **workspace** is the atomic tenant. Every table below carries `workspace_id` and is protected by RLS. There is no cross-workspace read path in the app; even the ops dashboard queries with an explicit `workspace_id` filter (or aggregates across a set with an internal admin role that is not surfaced in UI).

### 3.2 Users, sessions, roles

- Sign-in: Supabase Auth Google OAuth (owner + members). Email + password is a follow-up; not v1.
- Sessions: Supabase's httpOnly cookie session. `middleware.ts` (Next 16 renames to `proxy.ts` per DECISIONS.md D-… convention — see repo) rewrites for auth on protected routes.
- Roles per workspace: `owner`, `admin`, `member`. Owner is the billing principal; admin is functionally equivalent minus billing.
- Member permission keys (fine-grained, additive; absence denies):
  - `connect_social_accounts`
  - `manage_brand_kits`
  - `manage_asset_library`
  - `create_content`
  - `approve_content`
  - `schedule_content`
  - `run_now`
  - `view_event_log`
- Billing, member management, and social-account allow-lists are owner/admin only and NOT expressible as member permissions (same shape as simplepostr §3.2).

### 3.3 `profiles` mirror table

Supabase `auth.users` is not directly writable. `profiles` holds `(id = auth.users.id, email, display_name, created_at)`. `handle_new_user()` (SECURITY DEFINER) upserts `profiles` from `auth.users` on insert/update. Every FK to a "user" in the app points to `profiles.id`.

### 3.4 Row-level security (RLS)

RLS is on for every workspace-scoped table. Two helpers (SECURITY DEFINER) power every policy:

- `is_workspace_member(uuid workspace_id) returns boolean`
- `is_workspace_admin(uuid workspace_id) returns boolean`

Policies use those helpers so membership joins are not re-implemented in each rule (DECISIONS.md D-015 already made this call for M1 tables).

The Postgres role used by server-side code (`DATABASE_URL`) is treated as a service role and bypasses RLS. Any user-session-scoped read/write path — Supabase JS from a route handler — is subject to RLS. This dual-mode is deliberate: it lets us keep raw SQL in Inngest functions simple while still forcing the browser path through the tenant boundary.

### 3.5 Multi-pen-name model

`pen_names` is a child of `workspaces`. Design decisions:

- A pen name is a brand-kit + voice-defaults + default-hashtags carrier — not a tenant. `pen_name_id` appears as a column on `books`, `content_items`, `automation_configs`, and any table whose semantics change by pen name.
- Social accounts are workspace-scoped, not pen-name-scoped, with an explicit `default_pen_name_id` per account. A single physical TikTok can back multiple pen names; the account is not partitioned.
- A workspace with a single pen name should feel like a single-brand app — pen name pickers hidden until a second pen name is added.

### 3.6 API secret storage

Third-party keys (Anthropic override, Higgsfield tokens, Resend, per-workspace PB key overrides if any) are stored using the envelope pattern in §13, one row per `(workspace_id, provider)`. Never returned through the UI once written.

---

## 4. Data model

Load-bearing tables. Concrete Drizzle types live in `src/lib/db/schema.ts`; the shapes here are the contract.

### 4.1 Tenancy + auth

```
profiles          (id [= auth.users.id], email, display_name, created_at)
workspaces        (id, name, timezone [default 'Europe/London'], created_by, created_at)
workspace_members (id, workspace_id, user_id, role, permissions[], invited_at, joined_at)
pen_names         (id, workspace_id, display_name, voice_defaults jsonb, brand_kit_id, created_at)
```

Every row below is `workspace_id`-scoped; that column is elided from the sketches.

### 4.2 Books + content sources

```
books                    (id, pen_name_id, title, subtitle, author_display,
                          asin?, isbn?, cover_asset_id?, blurb, created_at)
book_excerpts            (id, book_id, name, body, tags[], created_at)   -- passage bank
book_captions            (id, book_id, kind, body, tags[], sort_order)   -- caption/hashtag pools
book_prompts             (id, book_id, name, body, kind, sort_order)     -- image-prompt pool
book_audio               (id, book_id, name, asset_id, license, duration_ms)
book_covers              (id, book_id, asset_id, position, is_primary)
```

The "banks" (excerpts, captions, prompts, audio) exist per-book because the audit shows every mature app has them per-book (bookshelf, tslides, generator, creator). LRU anti-repeat pickers (§6.4) draw from them.

### 4.3 Social accounts + PB integration

```
social_accounts (id, pb_account_id [unique in ws], platform, username,
                 default_pen_name_id?, is_aigc bool,
                 default_first_comment text?, notes,
                 last_verified_at, synced_at, added_at)
social_account_allowlist (workspace_id, user_id, social_account_id)  -- explicit grants
```

Design notes:

- `is_aigc` lives on `social_accounts` (per DECISIONS.md D-011), not on `workspaces` — per-account is strictly finer-grained than per-workspace and matches how the fleet actually uses it.
- `social_account_allowlist` is default-deny: a new user sees zero accounts until an admin grants access. This is the workspace-side answer to PB's lack of workspace isolation.
- `default_first_comment` is metadata for a possible future feature; PB has no first-comment API today (my-toolkit §"What's NOT in the API"), so it's a UI placeholder + potential native-API integration later.

### 4.4 Asset library + brand kits

```
assets (id, kind ['image'|'video'|'audio'|'font'|'other'],
        storage_path?, storage_bucket, mime, size_bytes,
        width text?, height text?,        -- text; see D-020
        duration_ms int?,
        uploaded_by profiles.id, origin ['uploaded'|'generated'|'ingested'],
        source_url text?, source_platform text?,
        metadata jsonb,                    -- prompt used, model, seed, run_id, dryRun flag
        views int?, likes int?, shares int?, engagement_rank int?,  -- fb-library-shaped
        ocr_status text default 'pending', ocr_text text?,
        visibility ['workspace'|'private'] default 'workspace',
        created_at, deleted_at?)

brand_kits (id, name, palette jsonb, font_roles jsonb, style_recipe text?,
            preview_asset_id?, created_at)
```

RLS on `assets`: workspace members can read; uploader-or-admin can update/delete (DECISIONS.md D-021). Bulk update by non-uploader is blocked.

Engagement metric columns exist so "what worked" is a query, not a spreadsheet — the facebook-library import job (§10.4) fills them at ingest.

### 4.5 Content items — the universal state machine

```
content_items (id, module_key, pen_name_id, book_id?, source jsonb,
               status ['draft'|'pending_review'|'approved'|'scheduled'|
                       'publishing'|'published'|'failed'|'rejected'|'cancelled'],
               revision int default 1,
               generated_by ['user'|'automation'], automation_config_id?,
               media_asset_ids uuid[],    -- ordered
               caption text?, hashtags text[],
               platform_configs jsonb,    -- per-platform overrides
               review_notes text?,
               event_log_head bigint,     -- pointer to most recent event
               created_at, updated_at, version int)

content_item_revisions (id, content_item_id, revision, snapshot jsonb, created_at)
```

State machine (identical shape to bookshelf's `cards`, generalized):

```
draft            → pending_review     (creator submits)
pending_review   → approved           (reviewer approves)
pending_review   → rejected           (reviewer rejects with notes)
rejected         → draft              (edit and resubmit; new revision)
approved         → scheduled          (schedule succeeds; automation_state row updated)
scheduled        → publishing         (Inngest fire begins)
publishing       → published          (PB verifies delivery)
publishing       → failed             (terminal PB error)
scheduled|approved → cancelled        (user cancels before publish)
```

Rules baked in:

- `approved` items are immutable except by cancellation. Any edit clones to a new revision (writes to `content_item_revisions`), moves the current item back to `draft`.
- Every transition writes an `event_log` row (see §12) in the same transaction.
- `publishing → published` is only set by the verification step, never by the initial PB submit (my-toolkit incident + AUDIT).

### 4.6 Automations

```
automation_configs (id, module_key, pen_name_id,
                    social_account_ids uuid[],
                    enabled bool,
                    windows jsonb,        -- [{ start, end, timezone, days }]
                    caps jsonb,           -- per-account/day, per-account/hour, workspace/day
                    selection jsonb,      -- module-specific: books, excerpt pools, image pools, etc.
                    review_gate ['skip'|'require'],
                    platform_modes jsonb, -- e.g. { tiktok: 'carousel', instagram: 'carousel' }
                    updated_at, updated_by, version)

automation_state (config_id primary key,
                  pointer jsonb,           -- module-specific: cycle index, LRU tail refs
                  last_fired_at, last_status,
                  next_fire_at)

fires (id, config_id, fire_date date, slot int, content_item_id?,
       status ['queued'|'skipped_cap'|'skipped_dupe'|'submitted'|'failed'],
       reason?, created_at,
       UNIQUE (config_id, fire_date, slot))
```

The two-table split (config user-editable, state machine-only) is the load-bearing decision from `my-toolkit/patterns/slideshow-consolidation-spec/SPEC.md` — it's what makes UI saves and cron writes stop colliding. Never merge them.

### 4.7 Posting log + verification

```
post_log (id, content_item_id, social_account_id,
          idempotency_key text unique per workspace,
          pb_post_id text?, pb_share_url text?,
          status ['dry_run'|'submitted'|'verified'|'unverified'|'not_found'|'failed'],
          error jsonb?, request jsonb?, response jsonb?,
          verification jsonb?,
          submitted_at, verified_at)
```

Idempotency: pre-flight lookup on `(workspace_id, idempotency_key)` returns the prior row if present (DECISIONS.md D-012). The `Idempotency-Key` header is also sent to PB (belt-and-braces).

### 4.8 Event log

```
event_log (id bigserial, workspace_id, actor_type ['user'|'system'|'automation'],
           actor_id?, aggregate_type, aggregate_id, event_type,
           before jsonb?, after jsonb?,
           request_id text?, ip inet?, user_agent text?,
           occurred_at)
```

Every mutation writes exactly one row. `event_log` is the source of truth for the ops dashboard, "what changed and when", and any future audit export.

### 4.9 Secrets

```
workspace_secrets (workspace_id, provider, credential_version, is_active,
                   ciphertext bytea, iv bytea, aad bytea,
                   dek_id text, created_at, revoked_at?)
```

Envelope pattern per §13. `SECURITY DEFINER` accessor `workspace_secret(provider)` returns plaintext to workers; call sites never touch `ciphertext` directly.

---

## 5. Posting service

### 5.1 Base client

The audit picked **reposter's `lib/post-bridge.ts` as the fleet's most hardened PB client** (AUDIT §"Third pass"). The engine's `services/posting/client.ts` is that pattern merged with tinkerboxxx's rate-limited paginator and generator's non-retryable-POST rule. Contract:

- Bearer auth from `POSTBRIDGE_API_KEY` (workspace-level override reads from `workspace_secrets` — see §13).
- **~8 req/s self-throttle** via a promise-chained gap enforcer (my-toolkit analytics runbook: PB's cap is 10 req/s; ~125ms gap).
- 429 handling driven by `rate_limit.reset_ms` when present, clamped to 100ms–5s, up to 6 attempts on read paths.
- Retries: read paths retry on 429 and 5xx; **`POST /v1/posts` is `allowRetry: false`** and never retries (DECISIONS.md D-016; incident 2026-05-08).
- Deep-page-500 graceful degradation on `/v1/post-results` (partial map returned) — the analytics runbook's `MAX_PAGES=200` ceiling.

### 5.2 Submit path

`submitPost(contentItemId, socialAccountId, opts)`:

1. Look up the content item + resolved caption + platform config + media asset URLs.
2. Compute `idempotency_key = sha256(contentItemId + socialAccountId + revision)`.
3. **DRY_RUN check.** If `postbridgeDryRun()` returns true (default when `POSTBRIDGE_API_KEY` unset, or `POSTBRIDGE_DRY_RUN=1`), write a `post_log` row with `status='dry_run'` and return without hitting the network (DECISIONS.md D-014).
4. Pre-flight idempotency: if a prior `post_log` row exists with the same key, return its result.
5. Upload media (2-step: `POST /v1/media/create-upload-url` → PUT to S3) with 500-retry only on `create-upload-url` (reposter's pattern; jittered).
6. `POST /v1/posts` with the full body (single attempt).
7. Write `post_log` row with `status='submitted'`, `pb_post_id`, response snapshot.
8. Kick an Inngest `content-engine/post.verify-requested` event with a 30s delay.

### 5.3 Verify + cross-check

The `verify` job (§6.5) confirms the post landed on PB:

1. Paginate `/v1/posts` (up to 3 pages by default; DECISIONS.md D-017) matching `post.social_accounts[].id === pbAccountId AND post.id === pbPostId` client-side (PB's `social_account_id` query filter is silently ignored — 2026-06-26 incident).
2. Update `post_log.status` to `verified` | `unverified` | `not_found`. Store the full verification result on `verification`.
3. Transition the `content_item` to `published` iff every submitted `post_log` row for that item is `verified`.

`content_item.status = published` is only reachable through this path.

### 5.4 Rules encoded, non-negotiable

Enforced in code with tests and comments referencing this section:

1. **Never retry `POST /v1/posts`.** One incident, one rule.
2. **Every post is verified** by re-listing and matching client-side; PB's account filter is untrusted.
3. **Per-user allow-list** checked before any PB call touches an account. Default-deny for new users.
4. **`is_aigc` is per-account**, not hardcoded. The posting service passes it through to `platform_configurations.tiktok` and drops it if the account has it `null`.
5. **No first-comment support** in v1. UI hint only. If a hashtag-hide first-comment ever ships, it uses a native platform API and is a separate v2 module.
6. **Rate throttle applies globally** across the PB client instance, not per-endpoint. Otherwise the analytics tab trips the cap while automations are also running.
7. **`POST /v1/social-accounts` sync** runs on a schedule (see §6) and on demand; the app never trusts a cached account list past 24h.

### 5.5 Silent-failure detection

A daily cross-check job (`services/posting/cross-check.ts`, ported from tinkerboxxx `api/aggregate.js`) compares `post_log.status='submitted'` rows created in the last 72h against `/v1/post-results`. Any submitted-not-confirmed row over 24h old surfaces on the ops dashboard as "silent failure" and emails the workspace owner via Resend.

---

## 6. Scheduling service

### 6.1 Substrate

Every scheduled action is an **Inngest function**. There is no per-module cron file, no pg-boss, no manual `setTimeout`. Vercel Cron (when it exists) is a trigger for a *single* dispatcher only. Inngest handles retries, dead-letter, `waitForEvent`, concurrency limits.

### 6.2 The single dispatcher

`services/scheduling/dispatcher.ts` runs on a 15-minute schedule + on `content-engine/config.updated` events:

1. Query `automation_configs where enabled=true` joined with `automation_state`.
2. For each config, compute `next_fire_at` from the window model (§6.3), respecting caps (§6.4).
3. Insert `fires` rows keyed on `(config_id, fire_date, slot)` — unique index dedupes.
4. Emit `content-engine/fire.due` for each newly inserted row.

Per-config Inngest functions listen for `content-engine/fire.due` filtered to their `module_key` and drive the module through generation → review gate → submit.

### 6.3 Window model

`automation_configs.windows` is a JSONB list of window objects:

```json
[
  { "start": "18:00", "end": "20:00", "timezone": "Europe/London", "days": ["mon", "wed", "fri"] }
]
```

Rules:

- All times display in Europe/London by default (feedback memory: never UTC in UI).
- DST-safe: window boundaries live in the workspace timezone; the dispatcher resolves to a wall-clock instant and converts to UTC only at storage time (bookshelf pattern).
- Multiple windows per day allowed (from the old spec).
- Empty windows list = "on demand only" (config exists for its selection state; never fires automatically).

### 6.4 Anti-spam and picker rules

Ported and merged from the audited apps:

- **Rolling caps** (pinfactory `pinfactory/scheduler.py`): per-account/day, per-account/hour, per-workspace/day. Configurable per config with sane defaults.
- **Sibling-account 30-min spacing** (meme-maker): if account A and account B share a `pen_name_id`, force ≥30-min gap between their fires unless the config opts out.
- **LRU anti-repeat picker** (`pickFresh`, tslides): picks from `book_excerpts` / `book_prompts` / `book_captions` / `book_audio` avoiding the N most-recently-used per config. Anti-repeat tail is stored in `automation_state.pointer`.
- **URL spacing / quarantine** (pinfactory): if the same URL has been posted in the last 24h, block; if a URL is flagged (manual or auto), quarantine for a configurable window.
- **Circuit breaker** (authorbids executor pattern): if a config would generate > `max_daily_actions`, HALT the config, notify owner. A rules bug that proposes 5,000 items should stop the machine, not fire 200.
- **Transient-vs-permanent error classifier** (tslides `lib/automation.ts`): generation/render errors are classified before deciding retry. Permanent errors (bad book_id, missing brand kit) mark the fire `failed` immediately.

### 6.5 Fixed schedules

Three engine-wide Inngest schedules exist regardless of user configs:

- `posting.sync-accounts` — hourly. Pulls `/v1/social-accounts` for each platform, refreshes `social_accounts.synced_at`.
- `posting.cross-check` — daily. §5.5.
- `assets.dead-account-check` — daily. Zero-views alert (tinkerboxxx `api/cron/dead-account-check.js`).

### 6.6 Rescheduling and cancellation

`PATCH /v1/content-items/{id}/schedule` and `POST /v1/content-items/{id}/cancel` follow simplepostr's §7.8 per-target semantics: items in `scheduled` and pre-submission states move; items in `publishing` return `in_flight`; terminal states return `not_applicable`. Full response body lists what moved.

---

## 7. Pipeline runtime

### 7.1 Every module is a state machine

The state machine on `content_items` (§4.5) plus Inngest's `waitForEvent` gives us a durable, resumable pipeline runtime with no bespoke worker code. Each module handler drives one `content_item` through generation → optional QA → review → publish.

### 7.2 Human checkpoints via `waitForEvent`

`ai-ugc-pipeline`'s checkpoint state machine (audit calls it "the drift-prevention pattern the fleet needs") ports directly onto Inngest:

```ts
export const runSlideshowModule = inngest.createFunction(
  { id: "module.slideshow.run", retries: 3 },
  { event: "content-engine/module.run-requested" },
  async ({ event, step }) => {
    const item = await step.run("create-draft", () => createContentItem(event.data));
    await step.run("generate-media", () => generateSlideshow(item.id));
    if (item.review_gate === "require") {
      await step.waitForEvent("content-engine/item.approved", {
        match: `data.contentItemId == "${item.id}"`,
        timeout: "14d",
      });
    }
    await step.run("submit", () => submitAllAccounts(item.id));
    await step.sendEvent("verify", { name: "content-engine/post.verify-requested", data: { contentItemId: item.id } });
  }
);
```

`step.run` gives free durability + idempotency per step. Re-runs after crashes never repeat completed steps. This is the audit's "checkpoint state machine" rewritten in the native Inngest idiom.

### 7.3 Retryable vs terminal errors

- **Retryable** (transient network/PB 5xx/AI Gateway timeout): let Inngest retry with backoff, respecting the classifier's verdict.
- **Terminal** (permanent): throw `NonRetriableError` — Inngest stops retrying, the module marks the item `failed`, event_log records the reason, ops dashboard surfaces it.
- **Reconciliation-hold** (PB submit succeeded but verify inconclusive after N attempts): `content_item` stays in `publishing`, ops dashboard flags it. Manual "check my profile / assume not posted and retry" flow per simplepostr §7.7.

### 7.4 Never blindly retry side-effects

Same rule as authorbids executor §1 and simplepostr §8.4: if a PB submit attempt times out mid-request, DO NOT retry. `post_log` still has the `submitted` row; verify handles reconciliation. This is what prevents the 2026-05-08 duplicate incident from recurring.

### 7.5 Backpressure

Inngest concurrency limits are set per-function:

- `posting.submit`: concurrency 4 per workspace (PB rate cap headroom).
- `posting.verify`: concurrency 8 per workspace.
- `module.*.run`: concurrency 2 per workspace default; per-module overrides.

Global limits on the account: match the deployed plan's concurrent-run budget.

### 7.6 Dead-letter

Any function exhausting its retry budget writes an `event_log` row `event_type='deadletter'` with the payload snapshot, and emails the workspace owner via Resend. No silent drops.

---

## 8. AI services

### 8.1 One LLM entry point

`services/ai/llm.ts` exposes `chatText`, `chatJson`, `vision`. Every module and prompt call goes through it. Rationale: model swaps, cost tracking, and per-workspace key overrides live in one place.

- Default model: `claude-sonnet-4-6`.
- Planning-quality tasks (slide-planning prompt, book distillation, style-recipe): `claude-opus-4-7`.
- Vision tasks (reverse-engineer a reference slide): `claude-sonnet-4-6` with the image content block.
- **Per-item cost tracking:** input tokens, output tokens, cache read, cache write, model → `event_log` (socialato `lib/anthropic.ts` pattern is the reference).

### 8.2 One image-gen entry point

`services/ai/image-gen.ts` exposes `generateImage({ prompt, aspectRatio, workspaceId, opts })`.

- **No-text guard applied unconditionally.** Every prompt is wrapped: `"NO text, words, letters, or writing anywhere in the image. …"` — the audit's universal rule, load-bearing for every renderer.
- **Fallback chain (default):** Gemini 2.5 Flash Image (AI Gateway) → Imagen 4.0 → OpenAI `gpt-image-1`. `isContentRejection()` classifier (tslides) routes NSFW-refused prompts straight to the tolerant model.
- **Aspect-ratio-first API.** UI passes `1:1` / `9:16` / `3:2` (feedback memory). Pixels are computed from the ratio for export.
- **Genre-neutral prompt derivation** (feedback memory: `dark_romance_is_beautiful.md`). System prompts for image-prompt-derivation are genre-agnostic; tone comes from the source content, not from a hardcoded "dark romance".
- **Higgsfield off by default.** Reachable via MCP OAuth per `my-toolkit/patterns/higgsfield-mcp` if a workspace opts in AND owner approves. Raw JSON-RPC, not the MCP SDK client. `soul_*` and `marketing_studio_*` models are refused at the entry point.

### 8.3 Prompt library

`services/ai/prompts/` is versioned TypeScript modules with typed I/O (Zod). Ports from AUDIT §"Extraction map":

- `slide-planning/` — generator/creator `generate-slides` prompt: passage → beats, backloading (punch word at end), no character names ("Not 'Dante' — 'your mafia boss'"), author dialogue sacrosanct, second-person POV, "End on the Turn." Plus `tighten` and `truncate` actions.
- `censorship/` — leetspeak map + emoji substitutions. User-extensible per workspace. Not applied by default; opt-in per workspace flag with the platform-ToS risk warning inline (§13 policy note).
- `top-n-booktok/` — generator's Top-N BookTok copy generator (titles/captions/imagePrompts, Punchline Rule, per-genre notes, 5-hashtag format).
- `vision-to-prompt/` — tslides `analyze.ts`: reverse-engineer a reference image into a prompt + reworded text + style hints. Two alt-variant modes.
- `caption-riff/` — my-toolkit ai-riffed-captions runbook: per-render generation, one flowing paragraph, exactly N hashtags, drop-empty-source-fields, genre-neutral, no em dashes (banned in the system prompt).
- `book-marketing-post/` — book-social-media's post-type taxonomy (10 content types).
- `grounded-copy/` — tropesite's no-fabrication rules + JSON repair/backfill.
- `style-recipe/` — bookshelf's brand-kit distillation from reference images.
- `book-distillation/` — trialreels' Claude-vision scene / book distillers.

Every prompt module exports `{ system, buildUser, schema, version, model }`. Version bumps are load-bearing — an automation running on prompt `v3` doesn't silently upgrade to `v4`; upgrade is explicit.

### 8.4 Visual QA gates

`services/ai/qa/`:

- `cover-check.ts` — bookshelf's transcribe-and-vote gate: given a rendered slide, ask Claude vision "what does this image show?", require the answer to include the book title. Retry generation on fail, up to `qa.max_retries`.
- `identity-consistency.ts` — storyforge's drift QC + aesthetic's `appearsIn` character-reference routing: on multi-image runs, verify each image matches the character reference; retry on fail.

QA is opt-in per module and per config. Default on for slideshow, off for meme.

### 8.5 Content policy

Enforced at prompt build time:

- **Never** reference the user's real pen name(s) or real book titles in placeholders, examples, hints, README copy, or demo content (feedback memory).
- **Never** quote lines from user brief / spec / notes markdown files back into runtime code, hints, or chat (feedback memory).
- **No em dashes** in AI output. Enforced by system-prompt instruction + a post-generation regex check that either strips or fails-loud based on config.

---

## 9. Rendering services

### 9.1 Text overlay

`services/rendering/overlay.ts` is the SVG-glyph-path approach from tslides `lib/overlay.ts`:

- Text is rendered as SVG `<path>` glyphs via `text-to-svg` (bundled Inter-Bold TTF), composited by `sharp`.
- No `fontconfig`, no `canvas`, no `satori`, no Pango — deliberately avoids the fontconfig-on-Vercel pain the fleet fought through.
- Configurable: font (from brand kit), size (with auto-fit-to-box, ported from pinfactory `fit_text`), color (hex fill), stroke (black default, brand-kit color option), position (top / middle / bottom + alignment), scrim gradient underlay, safe zones (TikTok `SAFE_TOP=280` / `SAFE_BOTTOM=480`).
- Emoji fallback: if the render input contains emoji characters, route to the Pango variant (generator `lib/render-slide.ts`) with `NotoColorEmoji` written to `/tmp` and a generated `fonts.conf`. Documented, second path — not the default.

### 9.2 Slide render

`services/rendering/slide.ts` composes: (background image) + (optional gradient scrim) + (overlay text) + (optional cover-slide layout) → 1080×1920 PNG. Layouts:

- Standard 9:16 slide.
- TikTok safe-zone slide (Top-N pattern from generator `render-topn-slide.ts`).
- 2×2 quadrant (quadrants `src/lib/grid-renderer.ts`) — for the quadrant module.
- Headline / quote / checklist / comp / stats / trope-hook template set (pinfactory `images.py:410-691` port).

### 9.3 Video render

`services/rendering/video.ts` covers the three video shapes the fleet uses:

- **Slideshow → MP4** (per-slide durations, audio loop, optional Ken Burns) — port of generator `render-video.ts` and tslides `lib/video.ts` on `@ffmpeg-installer/ffmpeg`.
- **Quote video** (sepia grade + `drawtext` captions + beat-sync cuts) — aesthetic `lib/render-server.ts` + `lib/beat-detect.ts`. `cutIntervalMs(bpm)` 250-400ms sweet spot.
- **Book-video** (handheld wobble + Ken Burns + safe-zone titles) — book-video-bot `lib/video.js`. Aware of the ffmpeg 4.x constraint (no `text_align` in `drawtext`); commented in the source.

### 9.4 Kinetic captions

`services/rendering/captions/`:

- `ass.ts` — the word-timed captions pattern from `my-toolkit/patterns/word-timed-captions`. Whisper word-timestamps → ASS subtitle file with inline `\an8\pos(540,460)` per cue.
- 10 kinetic effects; default `fade-drift`. `MAX_SILENT_GAP_BEFORE_CLEAR_SEC` clamp mandatory.
- Bundled Bebas Neue TTF; `fontsdir` contains only valid font files (libass silently fails otherwise).
- ffmpeg filter graph via `-filter_complex_script` (avoids shell argv limits).

### 9.5 Renderers not in v1

- Remotion WebGL chroma-key (meme-maker). Deferred to the meme module.
- Storyforge's ffmpeg xfade + audio ducking + loudnorm. Deferred to the narrated-story module.

Both are candidates for `services/rendering/video.ts` when the corresponding modules land.

---

## 10. Asset library

### 10.1 Storage layout

Supabase Storage, two buckets:

- `assets-workspace` (private) — brand-kit fonts, reference images, generated intermediates, book covers.
- `assets-outbound` (public-read) — post media (the URLs PB S3-uploads reference for its own hosted copies).

Assets always write to `assets-workspace` first. A row is copied to `assets-outbound` only at publish time and only for the specific media used in the post.

### 10.2 Ingest paths

1. **Upload.** UI file picker AND URL paste (feedback memory: support both). Image + audio + font uploads. Video upload arrives with the video modules.
2. **Generate.** Any AI image-gen call writes an `assets` row with `origin='generated'`, `metadata.prompt`, `metadata.model`, `metadata.seed`.
3. **Ingest.** External sources are cloned to `assets-workspace`:
   - **facebook-library import** — first ingest job. 999 posts, images re-hosted, OCR at ingest, engagement metrics captured. **Time-sensitive per AUDIT** (source URLs expiring).
   - **Book covers** — direct upload; ISBN → cover fetch is out of scope for v1.

### 10.3 OCR fan-out

Every image upload emits `content-engine/asset.ocr-requested`. The `asset-ocr` Inngest function reads the asset, runs OCR, writes `ocr_text` and updates `ocr_status`.

Per DECISIONS.md D-019, live OCR is guarded by `OCR_DRY_RUN`; the machinery is wired but the provider (Google Vision vs AWS Textract vs Tesseract-in-worker) is not authorized until the owner picks one. Fan-out + state machine ship in M2; live provider is a swap.

### 10.4 Engagement metrics

The facebook-library-shaped columns (`views`, `likes`, `shares`, `engagement_rank`) are filled on ingest and queryable. This is the "performance-ranked content library" from AUDIT — modules that want "top 20 quotes by engagement" query the assets table, not a separate analytics store.

### 10.5 Brand kits

`brand_kits`:

- `palette` — semantic slots (primary, secondary, background, text, accent) — pinfactory's model.
- `font_roles` — semantic (display, body, caption) → asset IDs — pinfactory + bookshelf recipe.
- `style_recipe` — freeform text distilled from reference images by the `style-recipe/` prompt (bookshelf). Optional.
- `preview_asset_id` — a rendered sample used in the picker UI.

Every `pen_name` has one active `brand_kit_id`. Multiple kits per pen name are allowed; only one is default.

### 10.6 Deletion

Assets referenced by an active `content_item` (`draft`, `pending_review`, `approved`, `scheduled`) cannot be deleted. Historical revisions may reference an asset; a soft-delete flags the asset and future queries treat it as unavailable rather than blocking the delete.

---

## 11. Modules

### 11.1 The contract

```ts
export interface ModuleHandler<Src, Selection> {
  key: string;                                   // 'slideshow'
  displayName: string;
  supportsAutomation: boolean;
  selectContent(ctx: RunCtx): Promise<Selection>;      // uses LRU pickers
  generate(ctx: RunCtx, sel: Selection): Promise<ContentItemDraft>;
  buildPost(item: ContentItem): Promise<PostSpec[]>;   // one per social_account
  reviewGate?: (item: ContentItem) => Promise<'pass' | 'fail' | 'manual'>;
}
```

- `services/` never imports from `modules/`.
- `generate` MUST use Inngest `step.run` inside for durability — one step per meaningful side effect.
- `buildPost` returns one `PostSpec` per selected `social_account_id` — the module decides platform-specific overrides.

### 11.2 Module #1: `slideshow`

The synthesis chosen in AUDIT §"Slideshow head-to-head":

- **Input paths.** (a) book passage → Claude slide-planning prompt (`slide-planning/` — GUIDE + backloading + no-names + censorship) → slide texts; (b) reference image → `vision-to-prompt/` → regenerable prompt + reworded text; (c) manual.
- **Structure.** `[hook, ...excerpts, cover]` (tslides). Template layouts from pinfactory: headline / quote / checklist / comp / stats / trope-hook.
- **Render.** Gemini background (`generateImage`, no-text guard, fallback chain) → overlay renderer with brand-kit theme → 1080×1920 PNGs.
- **QA.** `cover-check` gate opt-in when a real book cover is composited.
- **Output.** TikTok photo carousel (≥2 slides enforced) and/or IG carousel (≤10, `truncate` action) and/or MP4 (slides → video).
- **Review.** `pending_review` gallery UI: approve, reject-with-notes, regenerate-one-slide (storyforge pattern). Only `approved` items schedule.

### 11.3 Module #2: `winners` (candidate for M6+)

Reposter's engagement-ranked re-posting: query `assets` by `engagement_rank` filtered to a book, rebuild the caption with `caption-riff/`, re-post to a target account with a spacing rule against the original post. Straight port of `reposter/lib/winners/`.

### 11.4 Later modules (roadmap, not v1)

- **quote-video** — aesthetic-style beat-synced quote videos.
- **top-n** — generator's Top-N BookTok pipeline as its own module.
- **kinetic-caption-video** — bookshelf's Whisper → ASS captions pipeline as a standalone module.
- **memes** — meme-maker's combo-rotation + Remotion chroma-key renderer.
- **narrated-story** — storyforge's scene decomposition + TTS + character-consistency.
- **quadrants** — quadrants' 2×2 grid factory + few-shot caption calibration.

Each is a folder + one handler + prompts + templates. No new schema.

### 11.5 What is NOT a module

Anti-spam scheduling (a service), asset library (a service), posting (a service), verification (a service). Modules use them. This split is what stops the fleet's per-app code duplication.

---

## 12. Ops and observability

### 12.1 Event log as source of truth

Every mutation writes an `event_log` row in the same transaction. The ops dashboard, "recent activity", cross-check, and any audit export read from here. No mutation path skips `event_log` — bookshelf's discipline.

### 12.2 Status page (M4+)

The ops surface, ported from tinkerboxxx Manager:

- **Fleet card.** For each workspace: last 24h posts (submitted / verified / silent failure), automation health, PB rate-cap headroom.
- **Silent-failure list.** `post_log.status='submitted'` older than 24h with no verification. §5.5.
- **Dead-account list.** Zero-views for N days.
- **Stuck-fires list.** `fires.status='queued'` beyond expected window.

### 12.3 Metrics

Cheap, in-DB counters (no separate Prometheus in v1):

- `posts_submitted_total`, `posts_verified_total`, `posts_failed_total`.
- `module_runs_total`, `module_run_duration_ms` (histogram bucketed).
- `image_gen_by_model_total` (Gemini vs Imagen vs OpenAI fallback usage).
- `llm_tokens_total` split (input / output / cache read / cache write) with `cost_usd` derived per §8.1.

Cost tracking is workspace-scoped and surfaces in the settings UI as "This month's LLM spend" per workspace — socialato pattern.

### 12.4 Error handling

Sentry for uncaught exceptions on the Next.js side. `event_log` for expected failures (deadletters, terminal errors). Owner + admins receive Resend emails for:

- Silent-failure detections.
- Deadletters.
- Circuit-breaker halts.
- PB reauth / disconnect signals.
- Approaching PB rate cap (>80% sustained for 10 min).

### 12.5 Debug helpers

- `content-engine/debug/{workspace}/event-log` (admin only) — filterable event view.
- `content-engine/debug/{workspace}/fires/{fire_id}` — the fire's full lifecycle.
- `content-engine/debug/postbridge` — read-only PB introspection: accounts sync state, rate-cap state, last N verified posts.

Never expose plaintext credentials in debug surfaces — §13.

---

## 13. Security posture

### 13.1 Secrets

- Engine-level secrets in Vercel env vars: `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTBRIDGE_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ENVELOPE_DEK`, `INNGEST_SIGNING_KEY`.
- Per-workspace overrides live in `workspace_secrets` under envelope AES-256-GCM (§13.2).
- Zod-validated env boot check (tslides pattern) — the app refuses to start if a required key is missing or malformed.
- No fallback to weak defaults. Never `TOKEN_SECRET || DATABASE_URL || 'dev'` (audit flags this pattern in tslides as a leak vector).

### 13.2 Envelope encryption

`services/crypto/envelope.ts`:

- AES-256-GCM. DEK held in `ENVELOPE_DEK` (32 bytes, base64). AAD = `${provider}:${workspace_id}`.
- Interface (not implementation) is the contract — `envelope.encrypt(plaintext, aad)`, `envelope.decrypt(ciphertext, iv, aad)`. Simplepostr's pattern; the current DEK-in-env impl is swappable for a real KMS later without touching call sites.
- Inkwell's pgcrypto per-user LLM-key pattern is a layer *on top* of this — the engine-wide envelope handles workspace-shared secrets, pgcrypto handles per-user secrets if a workspace ever adds per-user key BYO.

### 13.3 Auth surfaces

- Supabase Auth handles session cookies. Every route handler resolves `workspace_id` via `services/tenant`.
- RLS is on for every workspace-scoped table (§3.4).
- CSRF: Next.js App Router uses same-origin fetch by default; explicit CSRF tokens on any cross-origin path (none in v1).

### 13.4 Content policy

- **`is_aigc` / censorship engine.** Both are per-workspace opt-in. UI shows a policy note inline explaining the platform-ToS risk (feedback memory: "don't relabel design failures as bugs" — call it what it is: a platform-evasion feature with owner-taken risk).
- **Higgsfield.** MCP OAuth path only. Clerk-cookie "unlimited mode" (aesthetic's pattern) is not offered. `soul_*` and `marketing_studio_*` models refused at the entry point.
- **Test media** — user-supplied file or a known public sample URL only. Never generate test assets (feedback memory).
- **No pen-name / real-book-title leaks** in placeholder / demo copy (feedback memory).

### 13.5 URL-fetch surface

The engine has no `fetch(userProvidedURL)` server-side path in v1. If one is added (e.g. reference-image URL paste), it goes through an allowlist (creator's `analyze-slide`/`describe-image`/`fetch-image-url` SSRF surfaces are the anti-pattern from AUDIT §"Security findings").

### 13.6 CI + dependency hygiene

- CI (GitHub Actions, `.github/workflows/content-engine-ci.yml`): typecheck + build on every PR touching `content-engine/**` (DECISIONS.md D-002).
- Dependency scanning: enable Vercel's built-in checks + rely on npm audit at CI.
- Next.js pinned above 15.1.3 (CVE-2025-66478 — DECISIONS.md D-003 already handled this in M1).

### 13.7 Non-goals

- No SOC 2 posture in v1.
- No customer-facing data export UI (per-workspace CSV export is a v2 feature).
- No IP allow-listing / SSO.

---

## 14. Phase plan

Milestones a session executes one at a time. M0-M2 are already landed; the remaining plan is the contract for future sessions.

### M0. Scaffold — DONE

Next.js + Drizzle + Supabase + Inngest wiring; auth; workspaces/members/pen_names; profiles trigger; event_log; RLS on M0 tables; CI. Reference: DECISIONS.md D-001 through D-005.

### M1. Posting core — DONE

`social_accounts` + `social_account_allowlist`; `services/posting/*` (merged PB client + verify + cross-check); `post_log`; manual "post this image now" flow end-to-end; DRY_RUN default; RLS on M1 tables. Reference: DECISIONS.md D-011 through D-017.

### M2. Asset library — DONE (scaffold)

`assets` + `brand_kits`; upload/ingest routes; OCR fan-out (`asset-ocr` Inngest fn); Supabase Storage buckets. Live OCR provider still gated (DECISIONS.md D-019). Reference: D-018 through D-021.

### M3. Slideshow module

- Port `slide-planning/`, `censorship/`, `top-n-booktok/`, `vision-to-prompt/`, `caption-riff/` prompts as versioned modules.
- `services/ai/image-gen.ts` with the Gemini→Imagen→OpenAI fallback + `isContentRejection()` routing + no-text guard.
- `services/rendering/overlay.ts` (SVG-glyph-path) + `services/rendering/slide.ts`.
- `modules/slideshow/handler.ts` implementing §11.1.
- Review gallery UI (approve / reject-with-notes / regenerate-one-slide).
- `content_items` state machine complete.
- DONE when: manual on-demand slideshow runs end-to-end against a PB test account with DRY_RUN off and a real book.

### M4. Scheduling

- `automation_configs` + `automation_state` + `fires` tables.
- Dispatcher + per-config Inngest fns (§6.2).
- Windows, caps, LRU picker, sibling-account 30-min spacing, anti-spam quarantine, circuit breaker.
- `posting.sync-accounts`, `posting.cross-check`, `assets.dead-account-check` fixed schedules.
- Ops dashboard: silent-failure + stuck-fires + dead-account.
- DONE when: an automation on a real account fires on schedule, verifies, and surfaces in the ops dashboard.

### M5. Migration cut-over — slideshow-generator + slideshow-creator

Per AUDIT §"Build order" step 6:

1. **Rotate the leaked `CRON_SECRET`** in slideshow-generator (must happen before this milestone, ideally before M0 landed; if not yet done, do it now).
2. Migrate one real account into the engine. Two-week parallel run alongside the old apps; compare `post_log` vs old apps' logs daily.
3. Export both Redis stores via one-off scripts, land into the engine's `books` + `book_prompts` + `book_captions` tables.
4. Point the old apps' automation configs to `enabled=false`; watch for a week.
5. Decommission the Vercel projects (delete deploys, retain repos as reference).

### M6. Winners module + reposter cut-over

`modules/winners/` per §11.3. Second real cut-over target because reposter's flow is small and self-contained.

### M7+

- Quote-video module (aesthetic cut-over).
- Kinetic-caption module (bookshelf partial cut-over).
- Top-N module.
- Memes module.
- Storyforge / narrated-story module.
- Character-video module — sources: `ccas77/aimoviebot` (Seedance + workflow, dialogue-in-audio) and `ccas77/book-boyfriend` (Higgsfield DOP still→video, pose extraction, character consistency). Evaluate both approaches before committing to one; both source apps stay running as-is.
- Competitive-cloning ingest (tslides) — owner decision (§16 open).

Ordering is a suggestion; each module is independent under the §11 contract, so priorities can shift as the owner chooses.

### Non-goals per milestone

Every milestone forbids: adding a new stack element; skipping DRY_RUN default; adding a per-module cron file; introducing a KV store.

---

## 15. Migration map

Where each old app's crown jewels land. This section is a summary of AUDIT §"Extraction map"; the audit doc is authoritative for the full list.

### 15.1 Straight ports

| From (app) | Crown jewel | Lands in |
|---|---|---|
| slideshow-generator | slide-planning prompt + censorship engine + Top-N BookTok generator + no-text guard | `services/ai/prompts/` |
| slideshow-generator | Pango-based render-slide + TikTok safe zones (fallback path) | `services/rendering/overlay.ts` (fallback) |
| slideshow-creator | multi-user shell patterns (invite system, admin role, per-user namespacing) | superseded by Supabase Auth + RLS; do not port |
| tslides | Drizzle schema + Blob layout patterns + LRU `pickFresh` + `analyze.ts` vision-to-prompt + `overlay.ts` (SVG-glyph-path) + two-phase automation shape | `lib/db/`, `services/scheduling/`, `services/ai/prompts/`, `services/rendering/overlay.ts`, `inngest/` |
| tslides | 3-tier image fallback + `isContentRejection()` routing | `services/ai/image-gen.ts` |
| aesthetic | render-server sepia grade + drawtext + beat-detect + prompt bank | `services/rendering/video.ts` (quote-video), `services/ai/prompts/` (STYLE preamble) |
| bookshelf | `cards` state machine + event_log + cover-check + kinetic ASS captions + Whisper + ffmpeg still→video | `content_items`, `event_log`, `services/ai/qa/`, `services/rendering/captions/`, `services/rendering/video.ts` |
| tinkerboxxx | Manager cross-check + rate-limited analytics + zero-views alert | `services/observability/`, `services/posting/analytics.ts` |
| facebook-library | 999-post dataset + FB media proxy + client-side OCR (re-do server-side) | `assets` seed data (**time-sensitive migration**) |
| meme-maker | combo-rotation scheduler + sibling-account spacing (Remotion chroma-key deferred) | `services/scheduling/` |
| book-video-bot | typed-PUBLISH danger-dialog + per-account checkbox + pull-back delete UX + wobble/Ken-Burns renderer | shared publish UI, `services/rendering/video.ts` |
| ai-ugc-pipeline | checkpoint-enforcement state machine | `services/pipeline/` shape (`step.run` + `waitForEvent`) — replace `soul_2` calls first |
| inkwell | pgcrypto per-user AES-GCM + RLS policies + event_log | `services/crypto/` layer + `event_log` shape |
| trialreels | register-scored hook generator + Claude-vision scene/book distillers | `services/ai/prompts/` |
| simplepostr | tenancy schema (workspaces, memberships, entitlements, quota reservations, audit_logs) + envelope encryption + argon2id + 30-day session cookies | `lib/db/`, `services/crypto/envelope.ts`, `services/auth/` (Supabase Auth replaces argon2id itself) |
| quadrants | few-shot calibration-example caption prompt + 2×2 quadrant Satori renderer | `services/ai/prompts/`, `services/rendering/slide.ts` |
| reposter | most hardened PB client (jittered 500-retry, per-platform config matrix) + winners module | `services/posting/client.ts`, `modules/winners/` |
| dictabook | Whisper 25 MB oversize-detect + ffmpeg re-encode | `services/ai/whisper/` only if audio-in module ships |
| socialato | per-item Opus cost tracking (input/output/cache split) | `services/ai/llm.ts` cost logging |
| authorbids | phase-gate discipline (no-write executor, spec-before-code, HUMAN_CHECKPOINTS) | engineering norm across the engine — this doc + DECISIONS.md pattern |
| my-toolkit | PB client + PB analytics + Higgsfield MCP raw JSON-RPC + word-timed captions + ai-riffed-captions + Apify TikTok scraper (winners candidate) + automation-overview UI + chroma-key ffmpeg | services + prompts across the map |
| pinfactory | semantic theme system + font/roles + slide template set + anti-spam scheduler | `brand_kits`, `services/rendering/slide.ts`, `services/scheduling/` |
| storyforge | Gemini image gen + character consistency + drift QC + ffmpeg xfade/loudnorm + karaoke cues | `services/ai/image-gen.ts` character routing, `services/ai/qa/identity-consistency.ts`, `services/rendering/video.ts` (deferred) |
| book-social-media | book-marketing post prompt + platform guidelines + 10 content types + Post Bridge stagger | `services/ai/prompts/`, `services/scheduling/` |
| tropesite | grounded no-fabrication copy + JSON repair/backfill (SEO surface out of scope) | `services/ai/prompts/` |
| aimoviebot | Gateway image fallback impl + MCP OAuth+PKCE for Higgsfield + ffmpeg concat + ASS captions (Whisper) + dialogue-as-data through pipeline + Workflow FatalError credit-burn guard | `services/ai/image-gen.ts`, `services/ai/mcp-client.ts`, `services/rendering/video.ts`, `services/rendering/captions/` — deferred to M6+ video module |
| book-boyfriend | pose-extraction prompt (strips outfit/props) + setting-extraction prompt + Higgsfield DOP still→video polling + character-consistency via ref-repeat + appearance description | `services/ai/vision/pose-extract.ts`, `services/ai/character-routing.ts`, `inngest/functions/higgsfield-poll.ts` — deferred to M6+ character-video module |

### 15.2 Explicitly not carried

- Every Redis-only storage layer (generator/creator/siggy/reposter's KV/ai-ugc-pipeline's KV/meme-maker's raw SQL, book-video-bot's raw SQL) — replaced by Postgres.
- Single `APP_PASSWORD` auth (generator).
- Aesthetic's Clerk-cookie Higgsfield subsystem — MCP OAuth only.
- Ai-ugc-pipeline's `soul_2` model call site (`lib/higgsfield/mcp-client.ts:138`) — must be replaced.
- Bookshelf's pg-boss + Vercel cron plumbing — replaced by Inngest.
- Tslides' Apify TikTok mirror UI (unless competitive cloning becomes a module).
- Simplepostr's Meta OAuth stack — Post Bridge is the posting layer.
- Dictabook's Stripe per-audio-minute billing (out of scope).
- Authorbids in full (out of scope).
- Siggy in full (delete).
- Kinetic in full (delete / rebuild — no `.git` at all).
- Book-video-bot's DIY scheduler (Inngest replaces it).
- Tropesite's SQLite / static-deploy machinery.
- Facebook-library's client-side OCR (redo at ingest).
- All Python CLI scaffolding.

### 15.3 Deletion candidates

- Vercel project `siggy` — insecure prototype flagged in AUDIT §URGENT SECURITY-adjacent. Delete before an internet crawler finds the endpoint.
- Vercel project `bookslide` and `public` — unreachable source; owner call.
- `kinetic` local folder — no `.git`, no working app; delete or rebuild under a new name.

---

## 16. Open questions

Deferred decisions the engine does not block on. Grouped by whether the answer changes the schema or only the module set.

### 16.1 Schema-affecting

1. **Per-workspace PB key or shared engine key?** Fleet uses shared `POSTBRIDGE_API_KEY`. Multi-workspace SaaS wants per-workspace keys. Current model: `workspace_secrets` supports both (per-workspace override reads first). Owner decision on default.
2. **Pen-name-scoped social accounts** — spec says workspace-scoped with `default_pen_name_id`. Reconsider if operational feedback shows accounts routinely serve one pen name and cross-pollination is a source of bugs.
3. **`content_items.source jsonb` shape** — current model is freeform. If module count grows past 6, promote frequently queried source fields (book_id already promoted) to columns.

### 16.2 Policy

4. **Censorship engine default** — off per §13.4; owner decides whether to change. Platform-ToS risk is real.
5. **`is_aigc:false` default** — per-account per DECISIONS.md D-011; the *default* value across the fleet has been `false` (generator/creator/tslides all suppress the AI badge). Explicit owner-set default per workspace.
6. **Higgsfield in v1?** Currently off. If owner opts in, MCP OAuth path only, `soul_*` refused at entry.
7. **Competitive-cloning module?** tslides' Apify mirror is off unless owner says on. Would need an `ingest` service and a compliance policy note.
8. **First-comment support?** PB has no API. Native platform APIs are a v2 conversation.
9. **Public API?** Simplepostr's private-API design (workspace 2 in the same DB) is a natural extension. Owner call.

### 16.3 Operational

10. **OCR provider** — Google Vision, AWS Textract, or Tesseract-in-worker (DECISIONS.md D-019). Owner picks.
11. **Sentry vs OpenTelemetry** — current bet is Sentry (dictabook already uses it). Revisit if Vercel Observability closes the gap.
12. **Billing / plans** — Stripe test-mode only until owner signs off; the engine has no `subscriptions` table because there is no v1 billing.
13. **Storage cost curve** — assets bucket will grow. Retention policy (auto-archive after N days of no reference?) is a v2 question.
14. **Cross-workspace admin surface** — the owner runs multiple workspaces (personal + friends). A minimal super-admin surface for the ops dashboard is TBD; today it uses a hardcoded env flag on the owner's account.
15. **Migration cut-over pace** — AUDIT lays out 12 modules over time. Reasonable ceiling is 1 module per 2 weeks; owner sets the pace.

### 16.4 Reserved for later specs

16. **UX spec** — screens, layouts, empty states, and error copy live in module docs as they land; there is no fleet-wide UX spec until at least three modules ship.
17. **v2 spec** — anything past M7 is out of scope here. If the fleet grows a public API, native mobile, or SOC 2 posture, a v2 spec supersedes this doc.
