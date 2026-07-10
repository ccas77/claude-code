# Backsight — Gap Analysis

**Date:** 2026-07-10
**Purpose:** Define precisely which market gap Backsight occupies, which claims are adversarially verified versus our own hypotheses, and which gaps we deliberately refuse to chase. Companion to `COMPETITOR_ANALYSIS.md` (same evidence base and verification caveats: competitor sites blocked automated fetching; details rest on search snippets, directories, and press releases, per the round-3 adversarial review).

**Labeling convention used throughout:**
- **[VERIFIED]** — established by the tournament's adversarial skeptics through fresh web research, with source URLs from the research files.
- **[HYPOTHESIS]** — our positioning belief; plausible, consistent with the verified record, but not independently confirmed. Each carries its validation step.

---

## 1. The gap in one paragraph

Six vertical micro-vendors (Qfactor, SurveyOps, KudurruStone, Cyanic Job Book, Info-Retriever by AGT, CQ) already sell job tracking to land surveyors, and several already put jobs on a map — so the gap is **not** "surveying job software" and **not** "a map of jobs." The verified residual gap is narrower and better: **no incumbent advertises automatically parsing a firm's messy historical job archive (legal descriptions, addresses) into a spatial index** — they map jobs *going forward* or require manual entry (adversarial review: "the most defensible residual claim found"). Backsight's wedge is to turn the archive a firm already owns into a quoting and profitability asset on day one, wrap it in a pipeline that speaks surveying, expose progress through a no-login client status link, and price flat per firm so field crews never count against a license. The rest of this document defends each element honestly.

---

## 2. Gap #1 — Prior-work spatial intelligence as a first-class quoting/profit tool

### What the record verifies

- **Competitors treat spatial as a view or a search, not as the product.** [VERIFIED] Qfactor's Map View shows "the location and status of all your current and PAST survey projects"; Cyanic Job Book offers "searching jobs by legal address information and map-based job searching"; SurveyOps organizes jobs "by Section, Township, Range — not just addresses" (adversarial review of the round-3 market skeptic; SurveyOps claim on its own page, https://survey-ops.com/land-surveying-job-management-software). The original claim "this is the value no platform will build" was **contradicted three times over inside the vertical** and has been withdrawn.
- **None of them advertise automated backfill of the historical archive.** [VERIFIED — by absence, per the skeptic's fresh search] The residual differentiator is "automated PLSS parsing of imported historical CSVs," which the skeptic sized honestly as "a real but thin onboarding convenience, not a moat" in isolation.
- **The ingredients are genuinely open.** [VERIFIED] BLM PLSS CadNSDI data is public-domain bulk data, no key, no fee (https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons). The one OSS parser (pyTRS) bans commercial use, so Backsight ships its own license-clean parser (https://github.com/JamesPImes/pyTRS); Township America's paid PLSS geocoding API (30+ states, all 37 meridians) proves the approach works and offers a buy-option (https://townshipamerica.com/).
- **The wedge has verified geographic limits.** [VERIFIED] 20 states — including Texas — sit outside PLSS (https://en.wikipedia.org/wiki/Texas_land_survey_system). Initial GTM targets PLSS states; address geocoding is the primary spatial index and S-T-R parsing is enrichment (FINAL_CONCEPT.md fixes #2–3).
- **Historical spreadsheets may not contain legal descriptions at all.** [VERIFIED as a risk] The implementability skeptic: in many firms the spreadsheet holds client + street address; the legal description lives in the deliverable PDF. Mitigation is architectural (address-first ingestion, map pin-drop fallback) and empirical: **measure parse rates on 3–5 real firm spreadsheets before believing the demo.**

### What is our hypothesis

- **[HYPOTHESIS] The difference between "a map view of past jobs" and "prior-work intelligence at quote time" is commercially decisive.** Backsight surfaces adjacent past jobs (same section, within radius) *inside the quoting moment*, with year, type, deliverables, and original quote attached — "you have 3 prior jobs in this section; quote with confidence, win it on price, deliver it at half the field time." No verified fact says Qfactor or Cyanic *don't* do this; no evidence says they do. **Validation:** manual demos of all four named vertical products (the adversarial review's explicit precondition) before positioning ships.
- **[HYPOTHESIS] The archive compounds into a switching cost.** After a year, spatial search over hundreds of past jobs is institutional memory a firm won't re-enter elsewhere. Consistent with SaaS experience, unverified in this vertical.
- **[HYPOTHESIS] Concierge historical import converts trials.** SurveyOps already offers guided onboarding at no extra cost [VERIFIED], so the concierge must be measurably deeper (we parse and spatially index the backlog; they onboard forward workflow) — a claim to prove in the first ten trials, not assert.

---

## 3. Gap #2 — Client-facing status links

- **The pain framing is plausible but the primary citation is tainted.** [VERIFIED flag] The "clients call for status" evidence traces to CQ's own SEO blog — vendor content marketing (https://www.cq-business-management-software.com/blog/best-business-management-software-for-surveyors-2025-complete-practice-management-guide/). We keep the feature because it is cheap to build and demo-able, not because the citation proves demand.
- **We are not first.** [VERIFIED] KudurruStone ships a Client Portal where clients submit and track requests; SurveyOps markets elimination of status phone calls as a core benefit (adversarial review).
- **[HYPOTHESIS] The tokenized no-login link beats a portal.** A title company will refresh a link embedded in an email; it will not create credentials in a small surveyor's portal. This UX distinction is Backsight's actual bet here, and the referral loop ("Tracked with Backsight" in the footer, seen by title companies working with dozens of surveyors) rides on it. **Validation:** count status-call reduction during trials; ask title-company recipients directly.

---

## 4. Gap #3 — Flat per-firm pricing vs. per-user

- **The verified pricing landscape:** KudurruStone charges $25/$15/$5 per user/month by role — a 10-person firm ≈ $100/mo, below Backsight Firm at $149 [VERIFIED]; surveyors report running firms on ClickUp at ~$3/user/mo [VERIFIED, RPLS forum per adversarial review]; the skeptic's blunt finding was that Backsight is "positioned above, not below, the real vertical competition," since the original concept anchored only against BQE Core.
- **The honest version of the flat-pricing gap:** flat per-firm ($79/$149/$249, FINAL_CONCEPT.md) wins where per-user pricing punishes growth — field crews and role churn never trigger license math, and the crossover favors Backsight as headcount passes the mid-teens. At small headcounts we are **not** the cheap option and should not pretend to be. [Mix of VERIFIED inputs and our arithmetic on published tiers.]
- **[HYPOTHESIS] Flat pricing is also a message, not just math.** The buyer segment demonstrably resents add-on/per-seat creep (per the SMB research thread in the venture record); "one price, every crew" is a trust posture. **Validation:** the adversarial review's prescription — justify the premium with a concrete recovered-revenue calculator in the trial (e.g., delivered-but-uninvoiced jobs surfaced from the imported history on day one) or drop the Practice-tier anchor.

---

## 5. Gap #4 — Modern UX vs. dated micro-vendor products

- **Verified signals, thin but consistent:** a decade-old vertical vendor (Qfactor, founded 2016) remains obscure with near-zero Capterra/G2 review footprint [VERIFIED]; an RPLS forum surveyor abandoned KudurruStone as "too slow" [VERIFIED]; the skeptic's inference is that **latency and simplicity may matter more than features** in this segment.
- **[HYPOTHESIS] A fast, modern, low-friction web app is itself a differentiator here.** No incumbent has been demoed yet; "dated UI" is inference from footprint and forum signals, not from screenshots. **Validation:** the mandated manual demos, plus trial-user session timing on core flows (create job, advance stage, radar search).

---

## 6. Gaps that are NOT ours to win — and why that focus is a feature

The adversarial record shows categories adjacent to Backsight are either owned, hardware-gated, or kill-taxonomy violations. Declining them is deliberate scope discipline (FINAL_CONCEPT.md, MVP_BUILD_SPEC.md), not a roadmap deficit:

| Gap we decline | Who owns it / why we decline | Backsight's posture |
|---|---|---|
| **Accounting / time-and-billing** | BQE Core and QuickBooks; accounting-heavy tools are exactly what this buyer finds oversized. | Push invoices to QuickBooks Online via its public OAuth API (30-minute production assessment, verified: https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ). Integrate, never replicate. |
| **CAD / drafting** | Carlson, Trimble, Leica ecosystems — decades of entrenchment, hardware-coupled (concept framing, uncontested by review but not independently verified). | None in v1. CAD files are attachments/metadata, not a canvas. |
| **Field data collection / GNSS workflows** | The hardware vendors' native turf; firms already spent $10–30K per receiver there (scout signal). | No data-collector integration in v1. The field crew's Backsight surface is a phone browser updating a stage and attaching photos. |
| **Crew GPS tracking / scheduling optimization** | Generic FSM (Jobber-class) does this well for trades; building it invites a feature war we can't win and the buyer didn't ask for. | Simple stage assignment + due dates + stuck-job digest. |
| **Payments / estimating math** | Kill-taxonomy item 5 (payment migration risk); estimating is judgment we must not fake. | Quote amounts are fields the owner fills; money moves in QuickBooks. |
| **Free S-T-R lookup utilities** | randymajors.org, Earth Point (https://www.earthpoint.us/Townships.aspx), MapScaping, BLM viewers, Township America already own the bookmark [VERIFIED]. | Dropped as lead magnet; replaced by the one-shot "map everything your firm has ever surveyed" import tool that doubles as onboarding. |

**Why focus is a feature:** every declined gap either (a) collides with an entrenched, well-capitalized owner (CAD/GNSS, FSM), (b) reintroduces a verified kill pattern (payments, regulated deliverables), or (c) dilutes the one wedge no incumbent advertises (archive backfill). A one-developer, Claude-Code-built product wins by being the *only* tool whose job is turning a surveying firm's past into quoting power — and by being unembarrassed that CAD, collection, and accounting live elsewhere. Integration posture also converts adjacent vendors (GNSS dealers with nothing to sell for the office) into a channel rather than a threat.

---

## 7. What would close our gap, and the tripwires

| Threat | Verified basis | Tripwire / response |
|---|---|---|
| SurveyOps adds historical-import concierge + archive search | They already ship S-T-R search, free onboarding, iOS app, and own the SEO keywords [VERIFIED] | Monitor their pages quarterly; keep the wedge moving toward what imports enable (quote-time adjacency, unbilled-job recovery), not the import itself |
| Qfactor markets its existing past-projects Map View as "prior-work intelligence" | The Map View exists [VERIFIED] | Same: differentiation must live in parse-quality, quote-moment UX, and flat pricing, which are harder to bolt on than a landing page |
| KudurruStone price pressure at small firms | $25/$15/$5 per user verified | Hold flat-pricing message; win on crews-don't-count and archive value, concede the 5-person price fight |
| The buyer stays on the whiteboard | Decade-old vendors still tiny; ClickUp satisfices [VERIFIED] | This is the dominant risk. If 10 concierge-imported trials don't convert ≥3 paying firms, the thesis — not the feature list — is wrong |
| TAM ceiling | ~7,000 establishments NAICS 541370, serviceable 2,000–4,000 PLSS-state small firms [VERIFIED, https://siccode.com/naics-code/541370/surveying-mapping] | Accepted by design (~$590K ARR at 5%); adjacent expansion (septic designers, foresters, geotech field firms) shares the field→office→licensed-review shape [HYPOTHESIS] |

---

## 8. Summary

Backsight occupies a real but deliberately narrow gap: **the only surveying job tracker whose first act is to spatially ingest the firm's past, not just organize its future** — delivered with a no-login client status link, flat per-firm pricing, and modern UX, in a fragmented micro-market with no winner and a status quo of whiteboards. Every load-bearing fact above survived (or was corrected by) three rounds of adversarial review; every claim that did not survive has been relabeled as hypothesis with a named validation step. The two mandatory validations before GTM spend: manual demos of the four named vertical competitors, and parse-rate measurement on real firm spreadsheets.
