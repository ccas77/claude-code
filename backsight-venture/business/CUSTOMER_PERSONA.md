# Customer Personas — Backsight

**Date:** 2026-07-10

Two personas: the **primary buyer** (owner / licensed surveyor) and the **daily user** (office manager / drafter). Both are **illustrative composites** built strictly from the evidence in `research/raw-scan-full.json`, the round-3 adversarial reviews in `research/revival-round3-results.json`, and the post-skeptic concept in `business/FINAL_CONCEPT.md`. Names match the fictional demo firm in the MVP ("Whitfield Land Surveying," Fort Collins, CO — a PLSS state on the 6th Principal Meridian). No detail here is a claim about a real person; quantified traits are labeled estimates where they are not sourced.

---

## Persona 1 — Primary buyer: "Dana Whitfield, PLS"

**Owner and licensed professional surveyor, Whitfield Land Surveying**

| Attribute | Detail |
|---|---|
| Role | Owner, sole license-holder, chief rainmaker, final reviewer of every deliverable |
| Firm | 3–25 staff, 1–5 field crews, $300K–$5M revenue (target-segment definition, `business/FINAL_CONCEPT.md`) |
| Workload | 20–80 concurrent jobs — boundary, ALTA, topo — at $500–$5,000 each |
| Current stack | Whiteboard + email folders + a job spreadsheet; world-class field/CAD tools (GNSS, Carlson/Trimble-class software); scout-estimated $10–30K per GNSS receiver already spent on hardware |
| Geography (launch ICP) | PLSS states (Midwest / Mountain West) — the wedge does not cover Texas or the colonial metes-and-bounds states (verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system) |

### Day in the life

- **6:45** — dispatches two crews by text; one asks which control was set on the Hendersons' adjacent parcel "a few years back." Dana thinks it was 2019. Nobody is sure which folder.
- **8:30–11:00** — drafting reviews and stamping. Interrupted four times by status calls: two title companies with closings this week, a builder, a homeowner. Each answer requires reconstructing status from email and the whiteboard (pain pattern per the scout evidence — clients call for status, drafters wait on field notes, invoices slip: https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/, flagged as a vendor source; frequency is an estimate pending interviews).
- **11:30** — a quote request lands for a rural parcel. Dana suspects the firm surveyed the neighboring quarter-section but can't confirm without an hour in the file room, so the quote goes out priced like a stranger's job.
- **Afternoon** — field visit to an ALTA site; the whiteboard back at the office is now stale.
- **18:00** — remembers three delivered jobs still haven't been invoiced. Adds it to tomorrow's list. Again.

### Jobs to be done

1. *Know where every job stands without being the human database* — so deadlines stop slipping silently between fieldwork, drafting, and review.
2. *Answer "where's my survey?" without answering the phone* — protect billable review hours.
3. *Turn the firm's history into quoting power* — when the firm has prior control/plats on or near a parcel, quote in minutes, win on price, deliver at lower field cost.
4. *Get delivered work invoiced* the week it ships.
5. *Get the archive out of my head* — the firm should survive Dana's memory (succession, illness, sale).

### Buying triggers

- A lost bid on ground the firm had already surveyed — the prior-work advantage priced at zero.
- A blown title-company deadline discovered only when the client called.
- A month-end discovery of delivered-but-unbilled jobs.
- Hiring crew #2 or #3 — the whiteboard stops scaling.
- Seeing "Tracked with Backsight" on a competitor's client status page (built-in referral loop per concept distribution plan).

### Objections (evidence-grounded)

| Objection | Basis | Counter Backsight must actually deliver |
|---|---|---|
| "We tried a vertical tool; it was too slow" | An RPLS.com forum surveyor abandoned KudurruStone as "too slow" (adversarial review, round 3) | Speed and simplicity over feature count |
| "ClickUp costs $3 a user" | RPLS forum users report running firms on ClickUp (adversarial review, round 3) | Value must come from what generic tools can't do: legal-description search, prior-work radar, client status links |
| "My data is my business — what if you disappear?" | Archive-of-record data-loss exposure flagged by implementability skeptic | Full CSV+files export in v1, documented backups/restore drill |
| "I don't want per-seat pricing that punishes field crews" | Segment's documented resentment of add-on/per-seat creep (SMB-trades research, e.g. https://myquoteiq.com/jobbers-biggest-problem-exposed/); KudurruStone charges per-user | Flat per-firm pricing: $79 / $149 / $249 |
| "Wrong-section match once and I'm done" | Principal-meridian ambiguity failure mode (adversarial review, round 3) | Explicit ambiguity flags, human map-confirmation on import, address-first indexing |
| "Six other vendors already call me" | Qfactor, KudurruStone, Cyanic, Info-Retriever, CQ, SurveyOps all exist (adversarial review, round 3) | Lead with historical-import concierge: day-one value from the firm's existing spreadsheet |

### Watering holes

- **State survey societies** and their newsletters/conferences under **NSPS** — every state has one; sponsorships priced in the hundreds of dollars (concept distribution plan).
- **r/Surveying** (~100k+ members per `business/FINAL_CONCEPT.md`) and **RPLS.com forums** — where the practice-management threads the skeptic mined actually live.
- Surveying podcasts (gear-and-practice shows).
- **GNSS equipment dealers and survey-supply houses** — trusted vendors who talk to every small firm and have nothing to sell them for the office.

### What Dana already pays for

- GNSS receivers and data collectors (scout estimate $10–30K per unit) and CAD/technical software from Trimble/Leica/Carlson-class vendors.
- Possibly a generic PM tool (ClickUp ~$3/user/mo per RPLS forum evidence) or nothing — the whiteboard is free.
- Reference price anchors in the vertical: KudurruStone ≈ $100/mo for a 10-person firm (per-user, per adversarial review); BQE Core ~$25–50/user/mo (scout anchor); SurveyOps and Qfactor sell paid annual contracts (pricing not publicly verifiable — their sites blocked automated review; noted as a verification gap in round 3).

---

## Persona 2 — Daily user: "Marcus Lee"

**Office manager / drafting technician, Whitfield Land Surveying**

| Attribute | Detail |
|---|---|
| Role | Runs the office: intake, scheduling, chasing field notes, drafting support, invoicing, and the phone |
| Reports to | Dana (owner). Not the economic buyer, but the veto: if Marcus won't live in the tool, it dies in the trial |
| Current tools | The job spreadsheet (his creation), email, the whiteboard, QuickBooks Online for invoicing |
| Technical comfort | High on office software, allergic to "systems" that add data entry without removing work |

### Day in the life

- **8:00** — reconciles the whiteboard with reality: calls crew A for yesterday's status, discovers a job moved to drafting Friday and nobody updated anything.
- **9:00–12:00** — the phone. Title companies calling about closings; Marcus digs through email threads to answer, interrupting his drafting queue each time (idle-drafter/status-call pattern per scout evidence, vendor-flagged source).
- **13:00** — assembles field notes for the drafting backlog; one job stalls because the crew's notes are on a device in a truck.
- **15:00** — invoicing hour that usually evaporates; delivered jobs from two weeks ago still unbilled.
- **16:30** — updates the spreadsheet, knowing it's already wrong somewhere.

### Jobs to be done

1. *One source of truth* that field crews actually update from a phone browser — no re-keying from texts and calls.
2. *Deflect the phone*: send every repeat caller a status link instead of playing detective (the tokenized read-only client status page).
3. *Never let a delivered job sit unbilled*: a "stuck jobs" digest with delivered-but-uninvoiced first, and one-click invoice push to QuickBooks Online (public OAuth API, verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ).
4. *Find prior work without asking Dana*: search by address or Section-Township-Range instead of relying on the owner's memory.
5. *Painless import*: the historical spreadsheet must load without weeks of cleanup — address-first geocoding, map pin-drop fallback (mandatory fix from adversarial review; many firm spreadsheets have client + street address only).

### What makes Marcus champion it — and what makes him kill it

**Champion:** the trial imports the firm's existing spreadsheet and immediately shows (a) a map of everything the firm ever surveyed, (b) the delivered-but-unbilled list, (c) a status link he can paste to the next title-company caller. Value on day one, using data he already maintains.

**Kill:** double data entry (tool + whiteboard both maintained), a slow UI (the KudurruStone "too slow" abandonment is the cautionary tale), field crews refusing the mobile flow, or a single wrong-section search result that makes Dana distrust the archive.

---

## Persona-to-evidence traceability

| Persona element | Evidence |
|---|---|
| Firm size, job volume/pricing, whiteboard status quo | Scout problem record, `research/raw-scan-full.json` (land-surveying job tracking) |
| Status calls / idle drafters / delayed invoices | https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/ (vendor source, flagged; to be validated in interviews per `research/PROBLEM_VALIDATION.md`) |
| S-T-R search need; vertical entrants | https://survey-ops.com/land-surveying-job-management-software (competitor page; confirms need and competition) |
| ClickUp satisficing; KudurruStone "too slow"; six vertical competitors; per-user price floor | Round-3 market skeptic, `research/revival-round3-results.json` |
| TAM ~7,000 establishments (NAICS 541370) | verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping |
| PLSS coverage limits shaping launch geography | verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system |
| QBO invoicing integration feasibility | verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ |
| Flat-pricing resentment of per-seat/add-on creep | SMB-trades scout evidence, e.g. https://myquoteiq.com/jobbers-biggest-problem-exposed/ |

**Caveat:** interruption counts, hours lost, and dollar magnitudes in the day-in-the-life narratives are illustrative estimates, not measured data. The interview plan in `research/PROBLEM_VALIDATION.md` exists to replace them with numbers from 10–15 real firm owners before further build investment.
