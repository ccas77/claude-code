# Backsight — Technical Architecture

**Date:** 2026-07-10
**Scope:** the local MVP (`product/app/`) and its evolution path to production.
**Companion documents:** `MVP_BUILD_SPEC.md` (authoritative build spec), `PRD.md`, `MVP_SCOPE.md`.

---

## 1. Stack and rationale

| Layer | MVP choice | Why |
|---|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript** | One codebase for the marketing page, the authenticated app, and the public status page; server components + route handlers remove the need for a separate API service; TypeScript keeps the parser and data layer honest; it is the stack Claude Code iterates on fastest, which matters because the builder is a non-specialist (Decision D-011). |
| Styling | **Tailwind CSS** | Fast, consistent, no design-system bikeshedding; the "surveying = precision" visual language (dark slate + orange accent) is a token set, not a component library. |
| Database | **SQLite via `better-sqlite3`** (file `data/backsight.db`) | Zero-install, zero-credential, synchronous API that suits server components; the whole demo database is one file a stranger can delete and re-seed. Deliberately *not* an ORM: plain SQL keeps the schema visible and the Postgres migration mechanical. |
| Maps | **Leaflet via `react-leaflet`**, OpenStreetMap tiles | No API key (the no-credential constraint), permissive usage at demo scale, marker/popup primitives are all the MVP needs. **Offline fallback is mandatory:** if tiles fail, job markers render on a plain CSS coordinate-grid background — never a broken UI. |
| Testing | **vitest** | Fast TS-native unit tests; the parser test corpus is the highest-value test asset in the repo. |
| Auth | **None (mocked)** | Cookie-based demo-user switcher (Dana / Marcus). Documented as mocked in `/app/settings`. |

Key stack constraint honored throughout: **no external network calls at runtime except OSM tiles; no API keys anywhere** (per `MVP_BUILD_SPEC.md`).

## 2. Data model

Five tables (SQLite; identical logical model in production Postgres):

```
clients ──< jobs ──< job_events
              │──< attachments
              │──< outbox (nullable job_id)
```

**ER description:**

- **`clients`** — one row per client organization/person. `id, name, kind (title_co|builder|homeowner|attorney|government), contact_email, phone`. A client has many jobs.
- **`jobs`** — the core entity; one row per survey job. `id, job_number ("2026-0142"), client_id → clients, type (boundary|alta|topo|construction_staking|subdivision_plat|elevation_cert), stage (request|quoted|scheduled|fieldwork|drafting|review|delivered|invoiced), quote_amount, address, county, state, lat, lng, plss_trs (nullable, "T7N R69W S14"), plss_meridian (nullable, "6th PM"), crew (nullable), due_date, created_at, delivered_at (nullable), notes, share_token (unique)`. The spatial columns implement the address-first rule: `lat/lng` is the primary index; `plss_trs` + `plss_meridian` are enrichment. `share_token` addresses the public status page.
- **`job_events`** — append-only status history. `id, job_id → jobs, at, actor, from_stage, to_stage, note`. Written on every stage transition; drives the job timeline and the dashboard activity feed. Never updated or deleted.
- **`attachments`** — deliverable/field-note metadata. `id, job_id → jobs, filename, label`. Metadata only in MVP (no file bytes).
- **`outbox`** — the mocked email transport. `id, at, to_email, subject, body, job_id → jobs`. Every "sent" notification is a row here; `/app/outbox` renders it.

Seed data (via `npm run seed`, idempotent): fictional firm **Whitfield Land Surveying** (Fort Collins, Larimer County, CO — 6th Principal Meridian); 12 clients; ~85 jobs 2019–2026 (~60 delivered/invoiced historical, ~25 active); coordinates scattered realistically around Fort Collins; ~70% of jobs carry area-consistent `plss_trs` values (T6N–9N, R68W–70W, sections 1–36) and the rest are address-only to exercise the fallback; plus the four demo hooks (same-section radar hit, 2 overdue, 1 stuck-in-review >10 days, several delivered-unbilled).

## 3. Core library: the PLSS parser (`lib/plss.ts`)

The wedge's hardest component, and the one under a hard legal constraint: **written from scratch, no pyTRS** — the only mature OSS parser bans commercial use under its Modified Academic Public License (verified by adversarial review, https://github.com/JamesPImes/pyTRS).

- Input grammar: `"T7N R69W Sec 14"`, `"T7N, R69W, S14"`, `"Township 7 North, Range 69 West, Section 14"`, optional aliquot prefixes (`"NE1/4 SW1/4 S14 T7N R69W"`).
- Output: `{township, townshipDir: 'N'|'S', range, rangeDir: 'E'|'W', section, quarters?: string[]} | null`.
- **Meridian disambiguation (skeptic-mandated):** an S-T-R tuple is not globally unique — it repeats across principal meridians. A state→default-meridian table (CO → 6th PM, etc.) resolves it; when the state is unknown, the result carries `ambiguous: true` and every consumer (Radar, import) must surface the flag rather than silently match. Silent wrong-section matches are the product's defined worst failure mode.
- Deterministic, dependency-free, ≥12 vitest cases including malformed input and out-of-range values. This exact module ships to production.

`lib/geocode.ts` is the geocoding seam: the production interface (address in, `{lat,lng,quality}` out) with a stub implementation and a documented TODO for the US Census Geocoder (free, no API key — chosen precisely because it keeps production credential-light).

## 4. Key flows

### 4.1 Stage transition → event + outbox

```
UI (board card menu / job detail controls)
  → server action: transition(jobId, toStage, actor)
      1. validate transition (any adjacent advance/regress; regress not from `request`)
      2. UPDATE jobs SET stage = ?, delivered_at = now() when entering `delivered`
      3. INSERT job_events (job_id, at, actor, from_stage, to_stage)
      4. if toStage ∈ {scheduled, delivered}:  -- key client-visible transitions
           INSERT outbox (to_email = client.contact_email, subject, body, job_id)
  → revalidate affected pages (board, job detail, dashboard, outbox)
```

One write path serves the board, the job page, the dashboard feed, the public status page (which reads `jobs.stage` + latest event), and the outbox — the single-source-of-truth property Marcus's persona demands. In production the outbox INSERT is unchanged; a queue worker drains it through SES (§6).

### 4.2 Radar search → parse/geocode → spatial rank

```
query string
  ├─ looks like S-T-R?  → lib/plss.parse()
  │     ├─ null → loud "could not parse" + format examples (never a guess)
  │     └─ parsed → resolve meridian via state default; set/display `ambiguous` flag
  │        → candidate jobs WHERE plss_trs matches (same meridian) → rank tier 1
  ├─ looks like "lat,lng"? → parse directly
  └─ otherwise address     → lib/geocode.lookup() (MVP: seeded-address match)
  → spatial ranking:
      tier 1: same PLSS section (string equality on normalized T/R/S + meridian)
      tier 2: haversine distance from the resolved point, ascending, cutoff 2 km
  → response: ranked list (year, type, deliverables, original quote) + map markers
```

Address-first rule (skeptic-mandated): when both a geocode and an S-T-R path are available, the geocoded point is authoritative for ranking. In production, tier 1 becomes point-in-polygon and polygon-adjacency against CadNSDI geometry (§6), with identical ranking semantics.

### 4.3 Public status page

`/status/[token]` → `SELECT ... FROM jobs WHERE share_token = ?` → render progress bar over the stage enum + latest `job_events.at` as "last updated." No session, no cookies, no data beyond that one job's client-safe fields. Invalid token → friendly not-found.

## 5. Security & privacy posture

**MVP (demo):** explicitly not hardened — mocked auth, local single-tenant SQLite, no PII beyond fictional seed data. The `/app/settings` real-vs-mocked panel discloses this in-product.

**Production posture (requirements, not options):**
- **Tenancy:** every query firm-scoped at the data layer; the tokenized status page stays public by design but exposes only client-safe fields of a single job (no pricing, notes, or navigation).
- **Tokens:** `share_token` generated with a CSPRNG, ≥128 bits, revocable/regenerable per job.
- **Data classification:** B2B business-contact data and job/site records; no consumer-PII categories, no payment data in v1, no regulated deliverables (Backsight tracks the licensed-review stage; the professional act stays with the customer — verified as carrying no software licensing regime by the adversarial review).
- **Archive-of-record liability (skeptic-flagged):** losing a firm's 500-job institutional memory is a business-ending grievance for the customer and a contractual (not regulatory) exposure for Backsight. Mitigations required before the first paying customer: automated offsite backups, a documented and rehearsed restore drill, ToS liability caps, and a customer-facing **full export** (CSV + attachments) — which also disarms the lock-in sales objection.
- Standard web hygiene: parameterized SQL throughout (already the pattern via `better-sqlite3`), no secrets in the repo, dependency audit in CI.

## 6. Production evolution path

The MVP is architected so each mock is a seam, not a rewrite:

| Seam | MVP | Production step |
|---|---|---|
| Database | SQLite file | **Postgres (+ PostGIS)**. Schema ports table-for-table; SQL is already plain and parameterized. PostGIS is required by the CadNSDI join below. |
| Auth | Cookie demo-switcher | **Clerk or Auth.js**: real identities, firm-scoped tenancy, roles (owner / office / field). The demo-switcher's user object already shapes the session contract. |
| Geocoding | Seeded coords + `lib/geocode.ts` stub | **US Census Geocoder** live behind the same interface (free, no key): batch for imports, single for new jobs, cache + flag-for-pin-drop on no-match. |
| PLSS spatial join | Section-string equality + haversine | **CadNSDI import pipeline:** BLM publishes national PLSS CadNSDI polygons (townships + first-division/sections) in bulk, public-domain, no credentials — verified by adversarial review, https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons. ETL per launch state → PostGIS; parser output joins to real section polygons within the resolved meridian; adjacency = shared-boundary + radius queries. (~2.6M national section polygons fit comfortably in PostGIS per the same review. Buy-option fallback: Township America's commercial PLSS geocoding API, https://townshipamerica.com/.) |
| Email | `outbox` table | Outbox becomes a durable queue; a worker drains it via **SES** (DKIM/SPF, retries, per-client opt-out). The insertion point in the transition flow is unchanged — this is why the mock is a table, not a no-op. |
| Attachments | Metadata rows | **S3 presigned uploads**, virus scanning, size limits; attachment metadata schema is already in place. |
| Billing | Pricing copy | **Stripe** subscriptions for the flat per-firm tiers. |
| Hosting | `npm run dev` | Vercel/Fly/Render + managed Postgres; CI runs build + vitest + seed smoke. |
| QBO invoice push | absent | Public OAuth2 API; Intuit's production-app assessment is a ~30-minute form with near-immediate approval (verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ) — submit it in week 1 of production work; budget for the 100-day refresh-token lifecycle. |

Sequencing follows `PRD.md` §5 (R-1 CSV import wizard → R-2 geocoder → R-3 CadNSDI → R-4 email → R-5 billing → R-6 auth/tenancy → R-7 mobile field view). Skeptic-verified schedule honesty: 12–16 weeks to a sellable v1, not the concept's original 6–8.

## 7. Known limitations

1. **PLSS coverage is not national.** Texas and the ~20 colonial metes-and-bounds states are outside PLSS; the S-T-R wedge is inert there and address/subdivision search must carry those markets (verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system). Launch GTM targets PLSS states; Texas is a phase-2 market via GLO abstract data.
2. **MVP spatial matching is approximate.** Section-string equality + haversine radius, not polygon geometry; edge cases (jobs near section corners, elongated parcels) mis-rank until R-3.
3. **Parser coverage is deliberately narrow.** The constrained grammar in §3 covers common firm-spreadsheet notation, not the full wildness of recorded legal descriptions; even mature parsers require human proofreading on real-world text (per the adversarial review of pyTRS's own documentation, https://github.com/JamesPImes/pyTRS) — hence the human map-confirmation step in the R-1 import wizard.
4. **Geocoding quality ceiling.** Rural addresses — common in surveying — geocode poorly; the pin-drop fallback (R-1) is a correctness feature, not a convenience.
5. **Demo data is synthetic.** Radar hit-rates on the seed corpus say nothing about hit-rates on a real firm's messy spreadsheet; the skeptic directive to stress-test with 3–5 real spreadsheets before GA stands.
6. **Single-writer SQLite.** Fine for a demo; concurrency, tenancy, and durability all arrive with Postgres (R-6 at the latest).
7. **No offline field capability.** Crews on cell-dead sites can't update stages until back in coverage; offline-tolerant submission is an R-7 stretch goal.
8. **Competitive non-uniqueness of individual features.** Adversarial review found vertical competitors already shipping map views, S-T-R search claims, and client portals (e.g., https://survey-ops.com/land-surveying-job-management-software); the architecture's defensible asset is the *imported-history* radar pipeline (parse → geocode → confirm → index) plus speed — which is why the parser, the import seams, and page performance get the engineering attention.
