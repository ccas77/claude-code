# Problem Validation — Small Land-Surveying Firms

**Venture:** Backsight
**Date:** 2026-07-10
**Purpose:** State exactly what we know about the surveyor problem, how we know it, what adversarial review corrected, and what only customer interviews can settle.

---

## 1. The painful workflow

A small US surveying firm (1–5 field crews, 3–25 staff) runs a high volume of small jobs — boundary surveys, ALTA surveys, topos at $500–$5,000 each, 20–80 concurrent — through a pipeline that crosses field and office: request → quote → scheduled → fieldwork → drafting → licensed review → delivered → invoiced.

Two failure modes, per the original scout research (`research/raw-scan-full.json`, problem "Job-status and workflow tracking for small land surveying firms"):

1. **Job-status chaos.** Status lives on whiteboards, in email folders, and in verbal updates from the field. Clients — title companies, builders, homeowners — call the owner asking "where's my survey?"; drafters sit idle waiting on field notes; finished jobs go uninvoiced for weeks (source: https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/ — **flagged by adversarial review as vendor content marketing**; the pain is plausible but this citation is not independent evidence).
2. **Prior-work amnesia.** The firm's most valuable asset is what it already knows about ground it has surveyed before — control points, prior boundary resolutions, plats. That knowledge lives in the owner's head and a shelf of file folders. Firms need to search past jobs by legal description (Section-Township-Range or subdivision), which generic tools cannot do (source: https://survey-ops.com/land-surveying-job-management-software — **flagged by adversarial review**: it is a competitor's landing page; it validates that a vendor ships S-T-R search, which cuts against uniqueness while confirming the need is real).

The structural context: the surveying software market is dominated by technical/CAD/GNSS vendors (Trimble, Leica, Carlson) with no interest in small-firm practice management, so firms cobble together spreadsheets, monday.com boards, or field-service apps built for landscapers (source: https://myquoteiq.com/top-8-softwares-for-land-surveying-businesses-in-2026/ — **flagged**: a generic-SaaS vendor's listicle ranking itself; the underlying "no dominant player" claim held up under review, but "no vertical solution" did not).

## 2. Who feels it

- **The owner / licensed surveyor** (the buyer): quotes jobs, dispatches crews, personally fields status calls, personally remembers "we shot that section in 2019." Every hour of interruption is unbillable.
- **The office manager / drafter** (the daily user): chases field notes, shepherds jobs between stages, prepares invoices, answers the phone when the owner is in the field.
- **Secondary sufferers:** title companies and builders on deadline who cannot see status without calling; field crews re-shooting control that the firm already established on adjacent ground.

## 3. Frequency and cost-of-problem reasoning

All items below are **reasoned estimates from evidenced inputs**, labeled as such — no independent study of surveying-firm operational losses was found by any of the three research passes, which is precisely why interviews (Section 6) are the next gate.

| Cost driver | Reasoning | Status |
|---|---|---|
| Status-call interruptions | 20–80 concurrent jobs × client mix of title companies/builders on closing deadlines implies daily inbound status queries handled personally by the owner or office manager | Estimate; frequency must be measured in interviews |
| Delayed invoicing | "Finished jobs go uninvoiced for weeks" (scout evidence via CQ blog, flagged vendor source). On jobs of $500–$5,000, a handful of delivered-but-uninvoiced jobs is thousands of dollars of float at any moment | Directionally plausible; magnitude unverified |
| Lost repeat-work advantage | A request on ground the firm previously surveyed can be quoted faster and delivered at lower field cost — but only if prior work is found. Missed prior work = quoting like a stranger and either losing the bid or eating redundant fieldwork | Core wedge hypothesis; win-rate/field-time deltas are estimates until interviews |
| Software budget exists | Firms already pay heavily for technical tooling (scout estimate: GNSS receivers $10–30K; adjacent anchors Jobber ~$40–200/mo, BQE Core ~$25–50/user/mo); six vertical PM vendors sustain paid products in the niche | Vendor existence verified by adversarial review; individual firms' actual PM software spend unverified |

Honest counter-evidence, surfaced by the market skeptic and retained deliberately: surveyors on the RPLS.com forum report running firms on ClickUp at ~$3/user/mo, and one abandoned the purpose-built KudurruStone as "too slow." The willingness to pay $79–249/mo flat is therefore **assumed, not demonstrated** — it must clear the interview gate.

## 4. The evidence chain

1. **Scout evidence (July 2026):** three citations establishing the pain narrative and the vertical's thin tooling —
   - https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/
   - https://survey-ops.com/land-surveying-job-management-software
   - https://myquoteiq.com/top-8-softwares-for-land-surveying-businesses-in-2026/
   All three were later **flagged as vendor content marketing** by the round-3 market skeptic. They prove vendors are betting on this pain; they do not prove demand volume.
2. **Adversarial market review (round 3):** fresh web research found six vertical competitors (Qfactor, KudurruStone, Cyanic Job Book, Info-Retriever, CQ, SurveyOps), corrected the TAM (below), mapped the real price floor, and identified the RPLS forum adoption evidence. Verdict: *seriously weakened, zero fatal flaws* — the only concept of 12 without one.
3. **Adversarial implementability review (round 3):** verified the wedge's data supply chain end-to-end — BLM PLSS CadNSDI is public-domain bulk data (verified by adversarial review, https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons); QuickBooks Online is a public OAuth API with a ~30-minute production assessment (verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ). Verdict: *survives with fixes*.

## 5. Corrections applied by skeptics

Every correction below is incorporated into `business/FINAL_CONCEPT.md` and the MVP spec.

| # | Original claim | Correction | Source |
|---|---|---|---|
| 1 | "~25,000+ small surveying establishments in the US" | **~7,000 firms / ~7,382 establishments** in NAICS 541370 (2020 Census County Business Patterns); a second source shows ~6,191 active companies. The 25,000 figure conflated establishments with licensed individuals. Serviceable segment (3–25 staff, PLSS states): skeptic estimate 2,000–4,000 firms | verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping |
| 2 | "No dominant vertical solution exists" (read as: no vertical solution) | Six vertical products exist; the market is fragmented with no winner. Positioning rebuilt to name all competitors | adversarial review round 3 (Qfactor, KudurruStone, Cyanic Job Book, Info-Retriever, CQ, SurveyOps) |
| 3 | Wedge (spatial prior-work search) framed as unique | Qfactor's Map View shows past project locations; Cyanic offers legal-address search; SurveyOps markets S-T-R organization. Residual wedge: automated parsing/spatial indexing of **imported historical spreadsheets**, which none advertise | adversarial review round 3, incl. https://survey-ops.com/land-surveying-job-management-software |
| 4 | Legal-description parsing is a drop-in solved problem | **Refuted:** pyTRS, the only mature OSS parser, prohibits all commercial use; Backsight must ship an original, license-clean parser with a human-confirmation UI | verified by adversarial review, https://github.com/JamesPImes/pyTRS |
| 5 | (Unmodeled) principal-meridian ambiguity | "T2N R3W Sec 14" repeats across principal meridians; silent wrong-section matches would be the worst possible failure for a trust product. Fix: state→default-meridian table, explicit ambiguity flags, geocoded address preferred | adversarial review round 3 |
| 6 | Demo assumes spreadsheets contain legal descriptions | Many firm spreadsheets carry only client + street address. Fix: address-first ingestion via the free US Census Geocoder; S-T-R parsing is enrichment, not a requirement | adversarial review round 3 |
| 7 | PLSS wedge coverage | 20 states are outside PLSS — the original 13 colonies plus TX, HI, KY, TN, VT, ME, WV; Texas uses its own GLO abstract/survey system. Initial GTM targets PLSS states (Midwest/Mountain West) | verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system |
| 8 | Pricing anchored against BQE Core | KudurruStone's per-user pricing ≈ $100/mo for a 10-person firm; ClickUp satisfices at ~$3/user. Repriced flat per-firm ($79/$149/$249) so the math beats per-seat at team size | adversarial review round 3 |
| 9 | Free S-T-R lookup map as lead magnet | Slot occupied by randymajors.org, Earth Point, MapScaping, BLM viewers. Dropped in favor of an import-your-history onboarding funnel | verified by adversarial review, https://www.earthpoint.us/Townships.aspx |
| 10 | 6–8 week build | Re-planned to 12–16 weeks for a sellable v1 (parser + meridian disambiguation + 30-state CadNSDI ingest + import UX + QBO OAuth) | adversarial review round 3 |

## 6. Open questions — closeable only by customer interviews

The evidence base establishes a plausible, buildable, competitively survivable thesis. It does **not** establish demand volume, willingness to pay, or data readiness. Target: 10–15 recorded interviews with owners of 3–25-staff firms in PLSS states before writing further code beyond the demo.

**Interview questions:**

1. Walk me through the last job that came in — from first phone call to invoice. What tools, boards, or paper touched it at each stage?
2. How many jobs are active right now, and how do you know, today, which ones are stuck and where?
3. How many "where's my survey?" calls or emails does your office handle in a typical week, and who answers them? What does each one interrupt?
4. When a request comes in for a parcel you might have surveyed before, how do you check? How long does it take, and when did you last discover prior work *after* quoting or fieldwork?
5. What does your historical job record physically look like — spreadsheet, folders, ledger? Do the rows contain legal descriptions, street addresses, both, or neither?
6. Which practice-management tools have you tried or evaluated — SurveyOps, Qfactor, KudurruStone, Cyanic Job Book, ClickUp, Jobber, monday? Why did you stop, stay, or never start?
7. What do you currently pay per month for office/business software versus field/CAD software, and who signs off on a new ~$150/mo subscription?
8. How often do delivered jobs sit uninvoiced for more than a week, and roughly how much delivered-but-unbilled work was outstanding at the end of last month?
9. If every new request instantly showed your prior jobs on and around that parcel, what would actually change — your quote price, win rate, or field hours? Can you put numbers on a recent example?
10. What would make you *distrust* a map of your firm's archive — and what happens to that trust the first time it shows a job in the wrong section?

**Pass/fail heuristics (pre-registered, honest):** the thesis strengthens if owners report ≥5 status interruptions/week, a prior-work check that takes >15 minutes or is skipped, and an existing software line item ≥$50/mo; it weakens if ClickUp-style satisficing is common, historical records are mostly address-only paper, or the prior-work advantage is priced at zero in owners' own quoting math.

---

*Sources: `research/raw-scan-full.json` (problem: land-surveying job tracking), `research/revival-round3-results.json` (Backsight concept + dual skeptic verdicts and evidence checks), `business/FINAL_CONCEPT.md` (post-skeptic fixes), `decisions/DECISION_LOG.md` (D-006, D-009, D-010).*
