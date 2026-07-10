# Backsight MVP — Scope

**Date:** 2026-07-10
**Companion documents:** `PRD.md` (requirements), `MVP_BUILD_SPEC.md` (build-level spec, authoritative for implementation detail), `TECH_ARCHITECTURE.md`

The MVP is a **locally runnable demo application** (`product/app/`): `npm install && npm run dev` on Node 22, zero external credentials, everything demonstrable offline except optional map tiles. Its job is to prove the wedge and the retention loop end-to-end to a stranger in under ten minutes — not to be sellable software. The skeptic-verified production timeline (12–16 weeks to sellable v1) starts from this base.

---

## 1. In / Out

| Area | In MVP | Out of MVP (roadmap ref in `PRD.md` §5) |
|---|---|---|
| Pipeline | Kanban board with the 8 surveying stages, advance/regress, filters, list view, overdue + prior-work badges | Drag-and-drop reordering, custom stages, scheduling optimization |
| Job detail | Full record, mini-map, event timeline, stage controls, prior-work panel, share-link copy, notes, attachment metadata | Real file upload/storage (R-6/S3), CAD or data-collector integration |
| Prior-Work Radar | Search by address / lat,lng / S-T-R string; live license-clean parse with meridian defaults + ambiguity flag; ranked same-section-then-distance results on a map | Exact PLSS polygon spatial join (R-3), adjacency by shared section boundary, Texas/GLO abstract search |
| Client status link | Public tokenized read-only page: progress bar, current stage, last update, contact | Client-branded custom domains, client request-submission portal |
| Dashboard | KPI tiles, pipeline counts, needs-attention list (overdue, >10 days in review), activity feed | Configurable reports, revenue analytics, weekly digest email (R-4) |
| Notifications | Outbox table capturing every "sent" client notification on key stage transitions; `/app/outbox` viewer | Actual email delivery (R-4), SMS (never — concept constraint), digests |
| Data ingestion | Seeded database (~85 jobs, 12 clients, demo hooks) via `npm run seed` | CSV import wizard with human map-confirmation (R-1) — the production onboarding wedge |
| Geocoding | Pre-seeded lat/lng on all jobs; `lib/geocode.ts` stub with documented TODO | Live US Census Geocoder integration (R-2), pin-drop fallback UI |
| PLSS | From-scratch parser (`lib/plss.ts`) with state→meridian defaults and `ambiguous` flag; ≥12 vitest cases | CadNSDI shapefile ETL and PostGIS point-in-section queries (R-3) |
| Auth | Cookie-based demo-user switcher (Dana / Marcus), documented as mocked | Real auth + multi-firm tenancy (R-6) |
| Billing | Pricing page copy on the landing page only | Stripe subscriptions, trials, dunning (R-5) |
| Integrations | None | QuickBooks Online invoice push (post-roadmap-v1; Intuit assessment form submitted early) |
| Mobile | Responsive layout | Field-optimized mobile flow (R-7), native apps |
| Landing | Marketing page: hero, problem bullets, 3-tier flat pricing, FAQ incl. "what's mocked?" | SEO content, free S-T-R lookup lead magnet (dropped — slot occupied per adversarial review, https://www.earthpoint.us/Townships.aspx) |

## 2. Real vs. mocked vs. pending

| Component | Status | Detail |
|---|---|---|
| **PLSS parser** (`lib/plss.ts`) | **REAL** | Original, license-clean code (no pyTRS — its license prohibits commercial use, verified by adversarial review, https://github.com/JamesPImes/pyTRS). Parses the S-T-R grammar variants in `MVP_BUILD_SPEC.md`, resolves principal meridian from a state-default table (CO → 6th PM), sets `ambiguous: true` when the state is unknown. Fully unit-tested. This exact code ships to production. |
| **Spatial ranking** (same-section + distance) | **REAL** (method), simplified (data) | Section-string equality + haversine distance over stored coordinates. Real production logic upgrades to polygon containment/adjacency via CadNSDI (R-3); ranking semantics are unchanged. |
| **Pipeline, events, dashboard, status page** | **REAL** | Actual database reads/writes; the event log and outbox insertions are the production mechanism. |
| **Geocoding** | **MOCKED (pre-seeded) / stub PENDING** | All seed jobs carry realistic Fort Collins-area coordinates. `lib/geocode.ts` exposes the production interface with a documented TODO to wire the US Census Geocoder (free, no key). Address search in the Radar matches seeded addresses. |
| **Email** | **MOCKED** | Notifications insert rows into the `outbox` table; `/app/outbox` renders them. No SMTP anywhere. Production swaps the transport (SES) behind the same insertion point. |
| **Auth** | **MOCKED** | Cookie-based demo-user switcher; no passwords, no tenancy. Production: Clerk/Auth.js + firm scoping (R-6). |
| **Billing** | **MOCKED** | Pricing display only. |
| **Attachments** | **MOCKED** | Metadata rows only (filename, label); no file bytes stored. Production: S3 presigned uploads. |
| **Map tiles** | Real (OSM) with **offline fallback** | If tiles fail, markers render on a plain coordinate-grid background — never a broken UI. |

The `/app/settings` page renders this same table in-product ("What's real vs. mocked" panel) so the demo can never oversell — a PRD acceptance criterion (US-9).

## 3. Demo narrative the MVP must support

Seven steps, one sitting, a stranger driving. Seed data guarantees every hook (`npm run seed` restores them idempotently).

1. **Landing page** (`/`) — the pitch in 30 seconds: "Your firm has surveyed this ground before. Backsight remembers." Flat pricing visible; FAQ answers "what's mocked in this demo?"
2. **Dashboard** (`/app`) — Whitfield Land Surveying's morning: active-job count, **2 overdue jobs**, **unbilled dollars tile** (several delivered-but-uninvoiced), needs-attention list including **1 job stuck in review >10 days**.
3. **Pipeline board** (`/app/jobs`) — the whiteboard replacement: 25 active jobs across 8 surveying-native stages; overdue and prior-work badges visible; advance a job to `delivered` from the card menu.
4. **Outbox** (`/app/outbox`) — the transition just fired a client notification: a new row addressed to the job's client sits at the top. Proof of the notification loop without SMTP.
5. **Prior-Work Radar** (`/app/radar`) — the wedge: click the first "try these" example (an incoming request-stage job). **≥3 historical jobs light up in the same section**, ranked above nearby others, each with year, type, and original quote. Type a raw S-T-R string (`Township 7 North, Range 69 West, Section 14`) and watch it parse live, meridian resolved to 6th PM with the interpretation echoed back; type a malformed string and see it fail loudly instead of guessing.
6. **Job detail** (`/app/jobs/[id]`) — one job's whole story: timeline of stage events, mini-map, prior-work panel, notes. Click **copy client share link**.
7. **Client status page** (`/status/[token]`) — paste the link in a new window: the read-only, no-login page a title company refreshes instead of calling. Progress bar, current stage, expected delivery, office contact — and nothing else exposed.

Close of demo: settings page (`/app/settings`) shows the real-vs-mocked panel — the honest accounting of what production still requires.

## 4. Explicit non-goals of the MVP

- Proving import quality on messy real-world spreadsheets (that is R-1, and the skeptic mandates stress-testing with 3–5 real firm spreadsheets before GA).
- Exact PLSS polygon geometry (section-string match + radius stands in for the CadNSDI join, R-3).
- Any claim of production security posture, tenancy, or backup discipline (R-6 and the pre-first-customer backup/restore drill).
- Sales collateral for non-PLSS states — the wedge demo is honest about covering PLSS ground (verified limitation, https://en.wikipedia.org/wiki/Texas_land_survey_system).
