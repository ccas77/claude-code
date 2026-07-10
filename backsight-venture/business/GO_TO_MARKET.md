# Backsight — Go-to-Market Plan

**Date:** 2026-07-10 · Assumes a sellable v1 at launch (skeptic-corrected build estimate: 12–16 weeks, per `research/revival-round3-results.json`).

---

## 1. Positioning statement

> **For** owners of small US land-surveying firms (1–5 crews, 3–25 staff) **who** run 20–80 concurrent jobs on a whiteboard, email, and memory, **Backsight** is job-tracking software that speaks surveying — **unlike** generic tools (ClickUp, Jobber, monday.com) that don't know what a plat or a licensed-review gate is, and unlike the vertical micro-vendors (Qfactor, KudurruStone, Cyanic Job Book, SurveyOps) that track jobs going forward, **Backsight** also imports the firm's entire job history and indexes it spatially — so every new request instantly shows what the firm already knows about that ground, at one flat price per firm where field crews never count against a license.

Three disciplines baked into this positioning (all skeptic-mandated, per `research/revival-round3-results.json`):

1. **Never claim "no competition."** Six vertical vendors exist and are named in our own materials (verified by adversarial review). The differentiator is the *historical import → spatial archive* wedge — the one capability none of them advertise (skeptic's residual-gap finding) — plus flat pricing and speed.
2. **Never lead with S-T-R search as unique.** SurveyOps advertises S-T-R job organization (https://survey-ops.com/land-surveying-job-management-software) and Cyanic offers legal-address search. Uniqueness lives in *automated parsing of the messy historical spreadsheet* and quote-time surfacing.
3. **Sell to the owner, ROI the office manager.** The owner buys the radar and fewer interruptions; the office manager lives in the pipeline daily. Demos address both.

---

## 2. Beachhead: PLSS states with dense small-firm counts

**Why PLSS-first:** the wedge's strongest demo (section-level prior-work hits) only works in the 30 PLSS states; Texas and the colonial metes-and-bounds states — about 20 states — fall back to address/pin search (verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system). Launching where the flagship demo is strongest is the skeptic's explicit recommendation.

**Market sizing (corrected):** ~7,000 firms / ~7,382 establishments in NAICS 541370 nationally (verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping — this corrected the scout's 25,000 figure). Serviceable segment after filtering to 3–25-staff firms in PLSS states: **~2,000–4,000 firms** (skeptic estimate; treat as a planning assumption).

**Beachhead wave 1 (months 1–6): Colorado, Wisconsin, Minnesota, Missouri, Kansas.**
Rationale (assumption-based, to be validated against state licensing-board rosters in week 1 of GTM):

- All fully PLSS; strong sectionalized rural + exurban survey demand (boundary/ALTA on section-referenced land).
- Colorado is where the seeded demo lives (Fort Collins / 6th PM, per `product/MVP_BUILD_SPEC.md`) — demos are geographically native.
- Each has an active state society (PLSC, WSLS, MSPS, MSPS-MO, KSLS) with newsletters and annual conferences where sponsorships cost hundreds, not thousands (`FINAL_CONCEPT.md`).
- Deliberately avoids Texas (no PLSS) and California (large-firm skew) in wave 1.

**Wave 2 (months 6–12):** remaining Midwest/Mountain West PLSS states (IA, NE, OK, MT, ID, UT, WY, ND, SD, plus MI/OH/IN/IL).
**Wave 3 (2027):** Texas via GLO abstract/survey-name data as a first-class second system (skeptic's phase-2 recommendation), then East Coast on subdivision/address search.

---

## 3. Channel plan

No saturated-SEO plays: the obvious keywords are being blanketed by SurveyOps's programmatic SEO (verified by adversarial review), and the free S-T-R-lookup lead magnet slot is occupied by randymajors.org, Earth Point, and Township America (verified by adversarial review, https://www.earthpoint.us/Townships.aspx, https://townshipamerica.com/). Distribution runs through people, not SERPs.

| # | Channel | Motion | Cost profile | Expected role |
|---|---|---|---|---|
| 1 | **State survey societies** (wave-1 states) | Newsletter sponsorships, annual-conference booths/talks, member-discount partnership (10% code — see `PRICING_STRATEGY.md`), offer a free CE-friendly talk: "Turning your job archive into a quoting asset" | $200–800 per newsletter slot; $500–1,500 per state conference booth (estimates) | Primary trust channel — the buyer trusts the society more than any ad |
| 2 | **NSPS chapters** | National visibility layer over the state societies; exhibit at the NSPS annual meeting once wave-1 traction exists | Moderate | Air cover, not lead volume |
| 3 | **r/Surveying** (~100k+ members per `FINAL_CONCEPT.md`) + RPLS.com forums | Genuine participation under the founder's real name; answer PM-software threads honestly (including "a whiteboard is fine at your size"); share the free Prior-Work Audit when contextually invited. **Never astroturf** — the skeptic found these forums are where tools get abandoned in public ("too slow"); they're also where reputations are made | Founder time | Credibility + steady trickle of high-intent trials |
| 4 | **Conference booths** | Wave-1 state conferences (typically fall/winter); live demo of the seeded Whitfield firm + "bring your spreadsheet, leave with your coverage map" on-the-spot audits | Hundreds per event (`FINAL_CONCEPT.md`) | The founder-led sales floor; target 5 booths in year 1 |
| 5 | **Client status link loop** (built-in referral) | Every status page footer: "Tracked with Backsight." Title companies and builders refresh these pages weekly and work with *dozens* of surveyors — each becomes a passive referral surface. Add a low-key "Are you a surveyor? See how this works" link | $0 | The compounding channel; slow to start, structural once ~30 firms are active |
| 6 | **Referral program** | Give-a-month/get-a-month for firm-to-firm referrals; surveyors in a region know each other and subcontract to each other | ~$140 per conversion | Word-of-mouth accelerant from month 4 |
| 7 | **Podcasts / YouTube** | Surveying practice podcasts and channels; the founder tells the honest tournament story ("we researched 34 problems; here's why surveying won") — this audience respects rigor | Founder time | Trust + long-tail |

**Deliberately excluded:** paid Google Ads on category keywords (SurveyOps SEO war, bad CAC math at flat pricing), generic software directories as a primary play (the vertical's near-zero review footprints show buyers don't shop there — verified by adversarial review), cold email at scale (small community; reputation risk exceeds yield).

---

## 4. Partnership angles

1. **GNSS equipment dealers & survey-supply houses** (`FINAL_CONCEPT.md`): they talk to every small firm in their territory and have nothing to sell them for the office. Offer a white-glove referral fee (one-time bounty) rather than a reseller margin — dealers won't do SaaS support. Start with wave-1-state dealers.
2. **State societies as partners, not just venues:** member discount + a society-branded webinar per year + sponsorship of the society's map/GIS committee work where one exists.
3. **Title companies (demand-side pull):** once ≥5 firms in a metro use status links, approach the title companies seeing them: "ask your other surveyors for a Backsight link." A title-side dashboard is a later monetizable product (see `PRICING_STRATEGY.md` §4); in year 1 it's an endorsement loop only.
4. **Township America (buy-vs-build option):** they sell a PLSS geocoding API covering 30+ states and all 37 principal meridians (verified by adversarial review, https://townshipamerica.com/). A licensing conversation is both a fallback if our parser hits edge-case walls and a possible co-marketing channel to their surveyor users. Not a dependency — our parser is license-clean and in-house (pyTRS is prohibited for commercial use: verified by adversarial review, https://github.com/JamesPImes/pyTRS).
5. **QuickBooks ecosystem:** complete the Intuit app assessment in week 1 (a ~30-minute form with near-immediate approval — verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ); a QBO App Store listing is a small but warm discovery surface among firms that already run QBO.
6. **Adjacent-vertical associations (2027):** septic designers, foresters, geotechnical field firms (`FINAL_CONCEPT.md`) — parked until the surveying beachhead holds.

---

## 5. 90-day launch plan

Assumes day 0 = sellable v1 (post the 12–16-week build) **and** the interview gate passed (15 owner interviews per `research/PROBLEM_VALIDATION.md`; if WTP fails there, this plan does not execute — see kill criteria in `METRICS_SUCCESS_CRITERIA.md`).

### Days 1–30 — Foundation & first friendlies
- Complete the **trademark/name-collision check** on "Backsight" *before* any paid marketing (flagged as required in `FINAL_CONCEPT.md`; see `RISK_REGISTER.md` R-10). Have a fallback name.
- Manually demo SurveyOps, Qfactor, KudurruStone, and Cyanic Job Book; write the honest comparison one-pager (skeptic-mandated; their sites blocked automated research).
- Submit Intuit app assessment; stand up landing page (`LANDING_PAGE_COPY.md`) + free Prior-Work Audit funnel (`CUSTOMER_ACQUISITION.md`).
- Recruit **5 design-partner firms** from interviewees at 50% off (per `PRICING_STRATEGY.md`): concierge-import their real spreadsheets personally. Target: 5 active firms, 3 with radar hits on their own data.
- Join wave-1 state societies as an affiliate/vendor member; book newsletter slots and the first two conference booths.
- Begin genuine r/Surveying + RPLS participation (no pitching for 30 days — build history first).

### Days 31–60 — Public launch in wave-1 states
- Announce in 5 state-society newsletters + r/Surveying launch post (transparent founder story + free audit link).
- Publish 3 proof artifacts from design partners (with permission): a coverage-map screenshot, a radar-hit-to-won-quote story, a status-link/title-company story. **Real ones only** — social-proof placeholders stay empty until then (`LANDING_PAGE_COPY.md`).
- First conference booth (whichever wave-1 society meets first).
- Ship the referral program; turn on the "Tracked with Backsight" footer link.
- Target by day 60: **75 audit runs, 25 trials, 8–12 paying firms** (assumptions; see funnel math in `CUSTOMER_ACQUISITION.md`).

### Days 61–90 — Repeatability
- Founder-led sales cadence: every audit completion gets a personal 15-minute "walk your coverage map" call offer (the demo script in `SALES_ONBOARDING_FLOW.md`).
- Second booth; first GNSS-dealer partnership signed; first society webinar delivered.
- Win/loss review on every closed-lost demo (price? inertia? competitor? missing feature?) → feeds pricing P1 gate (`PRICING_STRATEGY.md`) and roadmap.
- Instrument and review the metrics stack (`METRICS_SUCCESS_CRITERIA.md`); day-90 checkpoint against the month-3 thresholds there, including the explicit slow-start tripwire.
- Target by day 90: **20 paying firms, ≥$2,500 MRR, ≥60% of trials completing an import** (assumptions, reconciled with `METRICS_SUCCESS_CRITERIA.md`).

---

### Source notes
- ICP, pricing, channel seeds (societies, NSPS, r/Surveying, booths, dealer partners, status-link loop): `business/FINAL_CONCEPT.md`.
- Competitor set, TAM correction, PLSS coverage limits, lead-magnet saturation, SEO warning, build-timeline correction: round-3 skeptic verdicts in `research/revival-round3-results.json` (URLs cited inline above).
- All booth/newsletter cost figures and all day-30/60/90 targets are **estimates/assumptions**, not researched facts.
