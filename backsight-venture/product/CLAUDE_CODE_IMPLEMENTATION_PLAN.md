# Backsight — Claude Code Implementation Plan

**Date:** 2026-07-10
**Audience:** a non-specialist (comfortable running terminal commands, not a professional developer) continuing this build with Claude Code.
**Companion documents:** `MVP_BUILD_SPEC.md` (paste-ready build spec), `PRD.md`, `MVP_SCOPE.md`, `TECH_ARCHITECTURE.md`.

The working method throughout: give Claude Code the relevant spec file plus a milestone-sized instruction, let it build, then **verify with the commands listed before moving on**. Never accept a milestone whose verification step fails.

---

## 1. Environment setup

1. Install **Node 22** (https://nodejs.org or via `nvm install 22`). Verify: `node --version` → v22.x.
2. Install Claude Code (per its official docs) and open a session in `backsight-venture/product/`.
3. No accounts, API keys, or databases to install — SQLite is a file, map tiles need no key, and the MVP makes no other network calls. This is by design (`MVP_BUILD_SPEC.md` quality bar).

First prompt of the project — orientation, not code:

> Read product/MVP_BUILD_SPEC.md, product/PRD.md, product/MVP_SCOPE.md, and product/TECH_ARCHITECTURE.md. Summarize the build plan back to me and list any contradictions you see between them before writing any code.

## 2. Build sequence (ordered milestones)

Each milestone is independently verifiable. Expected wall-clock for the full MVP with Claude Code: a few working days for a non-specialist.

### M0 — Scaffold
**Prompt Claude Code to:** create the Next.js 14+ App Router project in `product/app/` with TypeScript, Tailwind, `better-sqlite3`, `react-leaflet`, and vitest configured; add `npm run seed` and `npm test` scripts as stubs; commit nothing outside `product/app/`.
**Verify:** `npm install && npm run dev` serves a placeholder page; `npm run build` passes.

### M1 — Schema + seed
**Prompt Claude Code to:** implement the five tables (`clients`, `jobs`, `job_events`, `attachments`, `outbox`) exactly as specified in MVP_BUILD_SPEC.md, with auto-create on first run, and write `scripts/seed.ts` generating Whitfield Land Surveying's data: 12 clients, ~85 jobs (2019–2026, Fort Collins coordinates, ~70% with consistent PLSS values), and the four demo hooks — at least 3 historical jobs sharing a section with one request-stage job, 2 overdue jobs, 1 job in review >10 days, several delivered-but-uninvoiced. Seed must be idempotent.
**Verify:** run `npm run seed` twice; row counts identical both times; spot-check the demo hooks with a SQL query Claude writes for you.

### M2 — PLSS parser (the license-sensitive milestone)
**Prompt Claude Code to:** write `lib/plss.ts` from scratch per MVP_BUILD_SPEC.md — and state explicitly in the prompt: **"Do not use, port, or consult pyTRS or any code derived from it; its license prohibits commercial use. Write original code."** Require: the four input format families, the output shape, the state→default-principal-meridian table (CO → 6th PM), the `ambiguous: true` flag when state is unknown, and ≥12 vitest cases including failures (garbage input, missing section, section 37, township 0).
**Verify:** `npm test` green; hand it three S-T-R strings from the seed data and one typo'd string and check outputs yourself. This module ships to production unchanged — spend review time here.

### M3 — Pipeline board + stage-transition engine
**Prompt Claude Code to:** build `/app/jobs` (kanban per stage, cards with job #, client, type, county, due date, overdue and prior-work-nearby badges, type/crew filters, list-view toggle) and the single server-side transition function: validate → update stage → insert `job_events` → insert `outbox` row on transitions to `scheduled` and `delivered` (per TECH_ARCHITECTURE.md §4.1).
**Verify:** advance a job on the board; confirm a new `job_events` row and (for key transitions) a new `outbox` row exist; regress it back.

### M4 — Job detail + client status page
**Prompt Claude Code to:** build `/app/jobs/[id]` (full record, mini-map with offline grid fallback, event timeline, stage controls reusing the M3 engine, prior-work panel with same-section + within-2km lists, copy-share-link button, attachments list, notes) and the public `/status/[token]` page (read-only progress bar, current stage, last update, expected delivery, office contact; friendly not-found on a bad token; no pricing/notes/navigation exposed).
**Verify:** copy a share link, open it in a private browser window (no cookies), confirm it renders and exposes nothing internal.

### M5 — Prior-Work Radar
**Prompt Claude Code to:** build `/app/radar` per PRD US-4/US-5: one search box handling address (seeded match), `lat,lng`, and live S-T-R parsing via `lib/plss.ts`; echo the parsed interpretation back; show the ambiguity warning when flagged; rank results same-section first then haversine distance; map markers + ranked list (year, type, deliverables, original quote); empty state with value explanation; a "try these" row of 3 example searches wired to seed hooks; loud failure on unparseable input.
**Verify:** the first "try these" example returns ≥3 same-section hits; a malformed string produces the error message, never a guess.

### M6 — Dashboard + outbox + settings + landing
**Prompt Claude Code to:** build `/app` (KPI tiles: active, overdue, avg days-in-stage, unbilled $; pipeline counts; needs-attention list incl. stuck-in-review >10 days; activity feed), `/app/outbox` (all rows newest-first, mocked-transport disclosure), `/app/settings` (firm profile, Dana/Marcus cookie switcher, the "What's real vs. mocked" panel mirroring MVP_SCOPE.md §2), and the `/` landing page per MVP_BUILD_SPEC.md (hero, problem bullets, $79/$149/$249 flat pricing, FAQ incl. "what's mocked?", dark-slate + orange design, responsive).
**Verify:** dashboard tiles match hand-computed values from the seed; the settings panel matches MVP_SCOPE.md.

### M7 — Geocode stub, polish, README
**Prompt Claude Code to:** add `lib/geocode.ts` with the production interface and a documented US-Census-Geocoder TODO; sweep for the quality bar (clean `npm run build`, green `npm test`, no runtime network calls except OSM tiles, offline map fallback actually renders); write `product/app/README.md` with prerequisites, 3-command quickstart, the 7-step demo walkthrough from MVP_SCOPE.md §3, the mocked list, and a project-structure map.
**Verify:** run the entire 7-step demo narrative yourself, offline if possible, from a fresh `npm run seed`.

## 3. Testing plan

| Layer | Tool | What |
|---|---|---|
| Parser unit tests | vitest (`lib/plss.test.ts`) | ≥12 cases: each grammar family, aliquot quarters, whitespace/comma variants, meridian default resolution, `ambiguous` flag on unknown state, and failures (garbage, missing section, out-of-range section/township). The highest-value test asset — it guards the wedge and the license-clean rewrite. |
| Smoke flow test | vitest against the transition function + queries | One scripted flow on a seeded test DB: create/read a job → advance `request→quoted→…→delivered` → assert a `job_events` row per hop and an `outbox` row on key transitions → radar query for the demo-hook section returns ≥3 hits ranked same-section-first → status-page query by token returns client-safe fields only. |
| Ranking unit tests | vitest | Same-section beats nearer different-section; 2 km cutoff honored; address-first rule when both geocode and S-T-R exist. |
| Build gate | `npm run build` + `npm test` | Both must pass before any milestone is "done"; make Claude Code run them itself at the end of every milestone. |
| Manual demo pass | you | The 7-step narrative in MVP_SCOPE.md §3 after M7 and before showing anyone. |

Prompt pattern: "Write the tests first for <milestone>, show me the failing run, then implement until green."

## 4. Environment variables

**MVP: none.** No keys, no secrets, no `.env` — this is a spec requirement, not an accident.

Future (production roadmap; create `.env.example` when each arrives):

| Variable | Arrives with | Purpose |
|---|---|---|
| `DATABASE_URL` | R-6 / Postgres migration | Managed Postgres (+PostGIS) connection |
| `AUTH_SECRET` / Clerk keys | R-6 | Real authentication |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET` | attachments | Presigned uploads |
| `SES_REGION` / SES credentials | R-4 | Real email transport |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | R-5 | Billing |
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` | QBO integration | Intuit OAuth (submit the app-assessment form early — it's a ~30-minute questionnaire, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ) |

Note the US Census Geocoder (R-2) needs **no key** — that's why it was chosen.

## 5. Mocking strategy

Principle: **every mock is a seam with the production interface, never a dead end** (details in MVP_SCOPE.md §2 and TECH_ARCHITECTURE.md §6).

- **Email → `outbox` table.** Code "sends" by inserting a row; production adds a worker that drains the same table through SES. Never scatter send-calls — the insertion point is single.
- **Geocoding → `lib/geocode.ts` stub.** Callers use the real interface today; swapping in the Census Geocoder changes one file.
- **Auth → cookie switcher.** UI reads a `currentUser` object shaped like the future session; replacing it with Clerk/Auth.js doesn't touch page code.
- **Attachments → metadata rows.** Schema is production-shaped; S3 upload lands later without migration.
- **Spatial join → string-match + haversine.** Ranking semantics are the contract; CadNSDI polygons (R-3) upgrade precision behind the same result shape.
- **Honesty rule:** anything mocked is listed in `/app/settings` and the README. Instruct Claude Code: "never add a fake 'success' path that pretends an external service was called — insert a row or call the stub."

## 6. First 10 real-world hardening tasks (post-MVP, pre-first-customer)

Ordered; sourced from the PRD roadmap and the adversarial-review directives.

1. **Migrate SQLite → Postgres (+PostGIS)** and stand up managed hosting with CI (build + tests + seed smoke). Everything below assumes it.
2. **Real auth + firm tenancy (Clerk or Auth.js):** every query firm-scoped, roles (owner/office/field), CSPRNG share tokens with per-job revoke/regenerate.
3. **Automated offsite backups + a rehearsed restore drill,** documented — required before the first paying customer (skeptic directive; archive-of-record liability).
4. **Full data export (CSV + attachments) in the product UI** — mitigates data-loss exposure and kills the lock-in objection in sales.
5. **CSV import wizard (R-1)** with saved column mappings, per-row status, and **mandatory human map-confirmation for every ambiguous or S-T-R-only row**; then stress-test with 3–5 real firm spreadsheets and measure what fraction of rows parse/geocode (skeptic directive — this decides how the radar is pitched).
6. **Live US Census Geocoder integration (R-2):** batch + single, caching, no-match → pin-drop flag, and a manual pin-drop UI.
7. **CadNSDI PLSS pipeline (R-3):** ETL BLM's public-domain shapefiles for the launch states into PostGIS (https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons); point-in-section + adjacency queries within the resolved meridian; regression-test parser→polygon agreement on the seed corpus.
8. **Real email (R-4):** SES with DKIM/SPF, outbox-drain worker with retries, per-client opt-out, and the weekly stuck-jobs digest (delivered-but-uninvoiced first).
9. **Performance pass under load:** seed 5,000 jobs and keep board/radar interactions fast (indexes, pagination, query plans) — "too slow" is the documented churn cause in this vertical (KudurruStone abandonment, per adversarial review).
10. **Billing (R-5) + legal basics:** Stripe flat per-firm tiers with 14-day trial; lawyer-reviewed ToS with liability caps appropriate to an archive-of-record product; submit the Intuit app assessment now so QBO invoice push is unblocked when its turn comes.

## 7. Working rules with Claude Code (learned constraints)

- **The license rule is absolute:** any prompt touching PLSS parsing must restate "no pyTRS, no derived code." Review the parser diff yourself for tell-tale ported structure.
- **One milestone per session-thread;** start each by having Claude re-read the spec files. Contradictions between docs: `FINAL_CONCEPT.md` and `MVP_BUILD_SPEC.md` are authoritative.
- **Make Claude prove it:** end every milestone with "run `npm run build` and `npm test` and paste the output."
- **Never let it invent data or URLs** in user-facing copy; marketing claims come only from `business/FINAL_CONCEPT.md` and the citation-checked research files.
