# Backsight — Product Requirements Document

**Date:** 2026-07-10
**Status:** Approved for MVP build (see `MVP_BUILD_SPEC.md` for the build-level spec, `MVP_SCOPE.md` for the in/out line)
**Authoritative upstream documents:** `business/FINAL_CONCEPT.md` (product direction), `decisions/DECISION_LOG.md` (D-010, D-011)

---

## 1. Problem statement

Small US land-surveying firms (1–5 field crews, 3–25 staff, $300K–$5M revenue) run 20–80 concurrent jobs — boundary, ALTA, topo at $500–$5,000 each — on a whiteboard plus email and a spreadsheet. Two failures follow:

1. **Job-status chaos.** Field crews, drafting, and licensed review live in different tools or none. Title companies and builders call the owner for status; deadlines slip silently between stages; delivered jobs sit unbilled. The pain pattern (status calls, idle drafters, delayed invoices) is documented in the scout evidence — with the caveat that the primary written source is a vendor blog and is flagged as such (https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/); it is scheduled for validation via owner interviews.
2. **Prior-work amnesia.** The firm's most valuable asset — control points, prior boundary resolutions, plats on ground it has already surveyed — lives in the owner's head and a shelf of folders. When a request arrives for a parcel the firm surveyed in 2019, quoting should take minutes and the bid should be unbeatable on price. It only works if someone remembers.

Backsight is job tracking that speaks surveying (Request → Quote → Scheduled → Fieldwork → Drafting → Licensed Review → Delivered → Invoiced), plus a **Prior-Work Radar** that indexes the firm's historical jobs spatially and surfaces everything the firm already knows about any new parcel, plus a tokenized read-only **client status link** that kills "where's my survey?" calls.

### Market reality (post-adversarial-review, honest version)

- **TAM:** ~7,000 US establishments in NAICS 541370 — the adversarial review corrected the original scout's 25,000 figure, which conflated establishments with licensed individuals (verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping). At 5% penetration × ~$140/mo average, ~$590K ARR: a strong bootstrapped outcome, not venture-scale, by design.
- **Competition exists and is named:** Qfactor, KudurruStone, Cyanic Job Book, Info-Retriever, CQ, and SurveyOps are real vertical vendors (round-3 market skeptic). SurveyOps's own marketing page claims Section-Township-Range job search (https://survey-ops.com/land-surveying-job-management-software). Differentiation is the prior-work-monetization wedge on *imported historical data*, client status links, modern UX, and flat per-firm pricing — not "no competition exists."
- **Geographic limit:** the PLSS wedge does not cover Texas or the ~20 colonial metes-and-bounds states (verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system). Launch ICP is PLSS states (Midwest/Mountain West); address-based search must carry non-PLSS ground.
- **Pricing anchor:** flat per-firm — $79/mo (up to 5 users), $149/mo (up to 15), $249/mo (unlimited) — against KudurruStone's per-user pricing (≈$100/mo for a 10-person firm per adversarial review) and the segment's documented resentment of per-seat/add-on creep (https://myquoteiq.com/jobbers-biggest-problem-exposed/).

---

## 2. Personas

Full personas live in `business/CUSTOMER_PERSONA.md`. Summary:

| Persona | Role | What they need from Backsight |
|---|---|---|
| **Dana Whitfield, PLS** (primary buyer) | Owner, sole license-holder, chief rainmaker, final reviewer | Know where every job stands without being the human database; deflect status calls; turn the firm's history into quoting power; get delivered work invoiced; get the archive out of her head |
| **Marcus Lee** (daily user, veto-holder) | Office manager / drafting technician | One source of truth crews actually update; a status link to paste at callers; a delivered-but-unbilled queue; prior-work search that doesn't route through Dana's memory; painless import of the existing spreadsheet |

Design rule derived from the personas: **Marcus kills the tool if it adds data entry without removing work; Dana kills it after one wrong-section match.** Speed, import quality, and spatial-match trustworthiness are therefore acceptance criteria, not nice-to-haves (the KudurruStone "too slow" abandonment on the RPLS forum, surfaced by the round-3 market skeptic, is the cautionary tale).

---

## 3. Skeptic-mandated requirements (non-negotiable)

These come from the round-3 implementability review (`research/revival-round3-results.json`, verdict: *survives_with_fixes*) and are incorporated as hard requirements:

| ID | Requirement | Rationale |
|---|---|---|
| SM-1 | **License-clean PLSS parser — no pyTRS.** The parser in `lib/plss.ts` is written from scratch. pyTRS's Modified Academic Public License explicitly prohibits commercial use (verified by adversarial review, https://github.com/JamesPImes/pyTRS). No code from pyTRS may be used, ported, or consulted during implementation. | Only mature OSS parser is legally unusable; the wedge's hardest component must be owned in-house. |
| SM-2 | **Principal-meridian disambiguation.** "T2N R3W Sec 14" repeats across principal meridians. Every parse resolves against a state→default-meridian table (e.g., CO → 6th PM); if the state is unknown or the meridian cannot be resolved, the parse result carries `ambiguous: true` and the UI must display an explicit ambiguity flag rather than silently picking a match. | A wrong-section match, discovered by a customer, permanently destroys trust in the archive — the worst failure mode for this product. |
| SM-3 | **Address-first ingestion.** Many firm spreadsheets contain client + street address only; the legal description lives in the deliverable PDF. Geocoded address (US Census Geocoder — free, no API key) is the *primary* spatial index; S-T-R parsing is *enrichment*, never a requirement. When both exist, the geocoded address wins. Manual map pin-drop is the fallback of last resort (post-MVP). | The "instant institutional memory" demo must not overpromise; import must degrade gracefully. |

Two further skeptic directives shape the roadmap rather than the MVP: (a) full CSV+files **data export** ships in v1 production (mitigates archive-of-record data-loss liability and the lock-in objection); (b) the **Intuit app assessment** questionnaire is submitted in week 1 of production work, not after months of mocking (it is a ~30-minute form with near-immediate approval — verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ).

---

## 4. MVP user stories and acceptance criteria

The MVP is a locally runnable demo (see `MVP_SCOPE.md` and `MVP_BUILD_SPEC.md`): SQLite, no external credentials, seeded with the fictional firm **Whitfield Land Surveying** (Fort Collins, Larimer County, CO — 6th PM), ~85 jobs 2019–2026.

### 4.1 Pipeline board (`/app/jobs`)

**US-1** — As Marcus, I want a kanban board with surveying-native stage columns so the whiteboard has a single always-current replacement.

Acceptance criteria:
- Columns render in fixed order: `request, quoted, scheduled, fieldwork, drafting, review, delivered, invoiced`.
- Each card shows job number, client name, job type, county reference, due date.
- Cards display badges: **overdue** (due_date in the past, stage before `delivered`) and **prior-work-nearby** (≥1 other job in the same PLSS section or within 2 km).
- A card menu advances or regresses the job one stage; every transition writes a `job_events` row (actor, from_stage, to_stage, timestamp).
- Key transitions (at minimum: → `scheduled`, → `delivered`) also insert an `outbox` row addressed to the client contact.
- Board filters by job type and by crew; a list-view toggle shows the same data as a table.
- Board renders 25+ active jobs without perceptible lag (the "too slow" kill criterion).

**US-2** — As Dana, I want stage regression to be possible (e.g., review sends a job back to drafting) so the board reflects reality, not an idealized flow.

- Regress is available from any stage except `request`; it writes a `job_events` row identical in structure to an advance.

### 4.2 Job detail (`/app/jobs/[id]`)

**US-3** — As Marcus, I want one page with everything about a job so a status call is answerable in one glance (until the caller can be moved to the status link).

Acceptance criteria:
- Shows the full job record: number, client (linked), type, stage, quote amount, address, county/state, S-T-R + meridian when present, crew, due date, notes.
- Mini-map with the job's marker (Leaflet/OSM; if tiles fail offline, markers render on a plain coordinate-grid fallback — never a broken UI).
- Status timeline rendered from `job_events`, newest first.
- Stage controls identical in behavior to the board (events + outbox on key transitions).
- **Prior-work panel:** lists other jobs in the same section and jobs within 2 km, each with year, type, and original quote; same ranking logic as the Radar.
- **Copy client share link** button copies `/status/<share_token>` to the clipboard.
- Attachments list (metadata only in MVP) and editable notes.

### 4.3 Prior-Work Radar (`/app/radar`) — the wedge

**US-4** — As Dana, I want to search by address or S-T-R when a request comes in, and instantly see every prior job on or near that ground, so I can quote in minutes with confidence.

Acceptance criteria:
- One search box accepts: a street address (matched against seeded geocodes in MVP), a `lat,lng` pair, or an S-T-R string in any of the supported formats (`T7N R69W Sec 14`, `T7N, R69W, S14`, `Township 7 North, Range 69 West, Section 14`, with optional aliquot quarters e.g. `NE1/4 SW1/4 S14 T7N R69W`).
- S-T-R input is parsed live by `lib/plss.ts` (SM-1); the parsed interpretation is echoed back to the user (township/range/section/meridian) so a misparse is visible before it misleads.
- If the parse is meridian-ambiguous (SM-2), the UI shows an explicit ambiguity warning and states which default was assumed.
- Results: a map with hit markers plus a ranked list — same-section matches first, then by distance — each row showing year, job type, deliverables, and original quote amount.
- Empty state explains the value proposition and shows a "try these" row of 3 example searches wired to seeded demo hooks (at least one returning ≥3 same-section hits).
- Address-first rule (SM-3): when a searched location has both geocode and S-T-R paths available, geocode-derived distance ranking is authoritative.

**US-5** — As Marcus, I want the parser to fail loudly rather than guess, so a bad string never silently indexes the wrong ground.

- Unparseable input returns a clear "could not parse" message with format examples; it never returns a low-confidence match presented as fact.
- The parser has ≥12 vitest cases including failure cases (garbage input, missing section, out-of-range values like section 37).

### 4.4 Client status link (`/status/[token]`)

**US-6** — As a title-company closer, I want a link I can refresh instead of calling, so I stop being the surveyor's interruption problem.

Acceptance criteria:
- Public page, **no authentication**, addressed by unguessable `share_token`.
- Read-only: firm-branded header, progress bar across the stage sequence, current stage, last-update timestamp, expected delivery date, office contact info.
- Exposes **no** pricing, no internal notes, no other jobs, no navigation into the app.
- An invalid token renders a friendly not-found page, not an error.
- (Production note: page footer reads "Tracked with Backsight" — the referral loop in the distribution plan.)

### 4.5 Dashboard (`/app`)

**US-7** — As Dana, I want a morning view of what needs me, so nothing slips silently.

Acceptance criteria:
- KPI tiles: active jobs, overdue count, average days-in-stage, unbilled dollars (sum of quote amounts for `delivered`-but-not-`invoiced` jobs).
- Pipeline column counts mirroring the board.
- **Needs-attention list:** overdue jobs and jobs stuck in `review` longer than 10 days (the seeded bottleneck hook must appear here).
- Recent-activity feed from `job_events`.

### 4.6 Outbox (`/app/outbox`)

**US-8** — As the evaluator of this demo, I want to see the notifications the system "sent," so the notification loop is proven without SMTP.

Acceptance criteria:
- Lists all `outbox` rows (timestamp, recipient, subject, body, linked job), newest first.
- New rows appear immediately after a key stage transition anywhere in the app.
- The page states plainly that this is a mocked email transport (see `MVP_SCOPE.md`).

### 4.7 Settings (`/app/settings`)

**US-9** — As a demo user, I want an honest "what's real vs. mocked" panel, so the demo never oversells.

Acceptance criteria:
- Firm profile (name / logo text) editable.
- Demo-user switcher (Dana Whitfield, PLS / Marcus Lee) stored in a cookie; documented as mocked auth.
- A "What's real vs. mocked" panel matching the table in `MVP_SCOPE.md`: parser real; geocoding pre-seeded with `lib/geocode.ts` stub + documented TODO; email = outbox table; billing and auth mocked.

### 4.8 Cross-cutting MVP acceptance

- `npm install && npm run dev` on Node 22 with zero external credentials; `npm run build` clean; `npm test` green.
- `npm run seed` idempotently resets the demo database, including the four deliberate demo hooks (same-section radar hit, 2 overdue jobs, 1 job >10 days in review, several delivered-unbilled).
- No runtime network calls except OSM tiles, with a graceful offline fallback.

---

## 5. Post-MVP roadmap

Ordered by dependency and sales impact. Timeline honesty per the implementability skeptic: a sellable production v1 is a **12–16 week** effort, not 6–8.

| # | Feature | Description | Requirements & acceptance sketch |
|---|---|---|---|
| R-1 | **CSV import wizard** | The onboarding wedge: upload the firm's historical job spreadsheet, map columns interactively, preview parsed/geocoded results on a map, confirm, import. | Column-mapping UI with saved mappings; per-row status (geocoded / S-T-R parsed / ambiguous / failed); **human map-confirmation step for every ambiguous or S-T-R-only row before it is indexed** (SM-2/SM-3); import must degrade gracefully to "address only" and to manual pin-drop; nothing enters the spatial index unconfirmed if flagged. Stress-test with 3–5 real firm spreadsheets before GA (skeptic directive). |
| R-2 | **US Census Geocoder live integration** | Replace the seeded-geocode stub in `lib/geocode.ts` with the real Census Geocoder (free, no API key). | Batch endpoint for imports, single-address endpoint for new jobs; handles no-match and low-quality-match by flagging for pin-drop; results cached; retry/backoff; no hard runtime dependency (a geocoder outage degrades to manual placement, never blocks job creation). |
| R-3 | **PLSS CadNSDI shapefile spatial join** | Import BLM's public-domain PLSS CadNSDI polygons (verified downloadable in bulk without credentials by adversarial review, https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons) so S-T-R strings resolve to real section polygons and point-in-section / adjacency queries are exact. | One-time ETL per state into PostGIS; parser output (SM-1/SM-2) joins to polygons within the resolved meridian only; adjacency = shared-boundary sections plus radius; per-state rollout starting with launch-ICP states. Buy-vs-build fallback exists (Township America sells a PLSS geocoding API covering all 37 meridians — https://townshipamerica.com/). |
| R-4 | **Real email sending** | Outbox rows become actual emails (SES or equivalent) for client notifications and the weekly "stuck jobs" digest (delivered-but-uninvoiced first). | Outbox becomes a queue with send status/retries; per-client notification opt-out; digest scheduling; DKIM/SPF setup; email is B2B operational notification only — no SMS anywhere (concept constraint). |
| R-5 | **Billing** | Stripe subscriptions for the three flat per-firm tiers ($79/$149/$249). | Trial (14 days) → paid conversion; seat counts enforced per tier; no per-user math anywhere customer-visible; dunning emails via R-4. |
| R-6 | **Multi-firm auth** | Real authentication (Clerk or Auth.js) and hard multi-tenancy. | Every query firm-scoped; roles: owner, office, field; token status pages remain public but firm-scoped; session security review before first external customer. Includes the v1 **full data export** (CSV + attachments) skeptic directive. |
| R-7 | **Mobile field view** | Responsive, thumb-first flow for crews: today's jobs, one-tap stage advance, note/photo attach from the truck. | Works on a phone browser over cell data (no native app in v1 — noting the competitive weakness the skeptic flagged: SurveyOps ships an iOS app); offline-tolerant form submission is a stretch goal. |

**Deliberately later / out of roadmap-v1:** QuickBooks Online invoice push (public OAuth API verified feasible — https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ — but sequenced after R-1–R-6; the Intuit assessment form is submitted early regardless), Texas/GLO abstract data (phase-2 market per skeptic), GPS crew tracking, scheduling optimization, CAD/data-collector integration, payments, county-recorder enrichment.

---

## 6. Non-functional requirements

- **Speed as a feature:** interactive pages respond <200 ms locally on seeded data; the board and radar must feel instant (the documented "too slow" churn cause in this vertical).
- **Trustworthiness of spatial claims:** no silent guesses anywhere — every ambiguity is surfaced (SM-2); every S-T-R interpretation is echoed back.
- **Offline-degradable demo:** the MVP runs with zero credentials and no network except optional map tiles.
- **Data stewardship (production):** as archive-of-record, Backsight carries contractual data-loss exposure; automated offsite backups plus a documented, rehearsed restore drill are required **before the first paying customer** (skeptic directive), plus customer-facing full export.
- **Privacy scope:** B2B business-contact data only; no consumer PII categories, no payments data in v1, no regulated deliverables (Backsight tracks the licensed-review stage; it never performs or certifies survey work).

## 7. Success metrics (production)

- Activation: firm imports ≥50 historical jobs and runs ≥1 radar search in week 1.
- Wedge proof: ≥1 radar hit used in a real quote within the 14-day trial (self-reported at trial-end check-in).
- Call deflection: ≥5 status-link views by external parties per firm per week by week 4.
- Revenue hygiene: delivered→invoiced median lag shrinking month-over-month per firm.
- Retention: logo churn <2%/mo after month 3; archive size (jobs indexed) growing monthly — the compounding moat metric.
