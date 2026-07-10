# Backsight — Metrics & Success Criteria

**Date:** 2026-07-10 · Clock convention: **M0 = first day of public availability** (post 12–16-week build and post interview gate). All targets below are **planning assumptions**, not benchmarks from research — no comparable cohort data exists for this vertical. The kill criteria, however, are commitments.

---

## 1. North star

> **Engaged firms:** the number of firms that, in a given week, both (a) advance at least one job through the pipeline and (b) run at least one Prior-Work Radar search on their own data.

Why this metric: it combines the retention feature (pipeline as daily habit) with the wedge (archive being consulted). A firm doing both is getting the two things it pays for; a firm doing neither is churn on a delay regardless of billing status. Revenue follows engaged firms almost mechanically at flat pricing (MRR ≈ engaged firms × tier price, with a lag).

## 2. Input metrics (the tree under the north star)

| Layer | Metric | Why it matters |
|---|---|---|
| **Acquisition** | Prior-Work Audits completed / week | Top of funnel; the lead magnet working |
| | Audit → trial rate | Quality of the audit artifact (guardrail: ≥40%, per `CUSTOMER_ACQUISITION.md`) |
| | % of new trials from referral / status-link footer / word-of-mouth | The compounding channels becoming visible (target ≥25% by M9) |
| **Activation** | Trial → activated rate (definition: `SALES_ONBOARDING_FLOW.md` §4) | The 10-minute aha converting |
| | Median time-to-own-coverage-map | Must stay ≤10 min; the segment abandoned a competitor for being "too slow" (verified by adversarial review) |
| | % of imported rows auto-placed (geocode or S-T-R parse) | Parser/geocoder quality on real-world data — the skeptic's central implementability concern |
| **Engagement** | Radar searches per firm per week; radar hit rate | Wedge usage; hit rate also measures archive density |
| | Radar hits marked "used in quote" / "won" | The dollar story — feeds proof library and pricing defense |
| | Status-link views by external viewers per firm | Retention feature reaching clients + referral surface size |
| | Stage advancements per active firm per week | Pipeline as habit |
| **Revenue** | MRR; ARPA; tier mix; % annual | Business health; tier mix feeds pricing tests P2/P4 (`PRICING_STRATEGY.md`) |
| **Retention** | Monthly logo churn; M3 cohort retention; net revenue retention | The compounding-archive thesis is testable here: churn should *fall* with archive age |
| **Efficiency** | Cash CAC (≤$500) and blended CAC (≤$1,200) per `CUSTOMER_ACQUISITION.md` §3 | Channel discipline |

## 3. Definitions (binding)

- **Activated:** per `SALES_ONBOARDING_FLOW.md` §4 — ≥50 historical jobs imported (≥60% placed) + ≥1 own-data radar search + ≥5 active jobs with ≥3 advancements + ≥1 externally-opened status link, within 14 days. (25-job threshold for young firms.)
- **Retained:** a paying firm counted in the month it renews; a firm is **churned** on the day its subscription lapses without renewal (dunning grace: 14 days). Paused/seasonal accounts count as churned unless on a prepaid annual plan.
- **Revenue:** MRR = normalized monthly value of active subscriptions (annual ÷ 12). One-time concierge/archive-service fees (if ever offered, `PRICING_STRATEGY.md` §4) are excluded from MRR.
- **Engaged (weekly):** north-star definition above; measured on firm level, not user level.

## 4. Success thresholds

### Month 3 checkpoint (early signal, per `GO_TO_MARKET.md` day-90)

| Metric | On track | Concern | Trigger review |
|---|---|---|---|
| Paying firms | ≥20 | 10–19 | <10 |
| Audits completed (cumulative) | ≥100 | 50–99 | <50 |
| Trial → activated | ≥50% | 30–50% | <30% |
| MRR | ≥$2,500 | $1,200–2,500 | <$1,200 |

### 6-month success thresholds (M6)

| Metric | Target | Minimum acceptable |
|---|---|---|
| Paying firms | 35 | 20 |
| MRR | $4,500 | $2,500 |
| Trial → paid | ≥35% | ≥20% |
| Monthly logo churn (M3+ cohorts) | ≤2.5% | ≤4% |
| Weekly engaged firms / paying firms | ≥60% | ≥45% |
| Radar hits marked used-in-quote (cumulative) | ≥40 | ≥15 |
| Permissioned proof stories | ≥6 | ≥3 |

### 12-month success thresholds (M12)

| Metric | Target | Minimum acceptable |
|---|---|---|
| Paying firms | 90 | 55 |
| MRR | $12,000 | $7,000 |
| ARR run-rate | ~$145K | ~$85K |
| Monthly logo churn | ≤2% | ≤3% |
| % trials from referral/status-link/WOM | ≥30% | ≥20% |
| % base on annual plans | ≥40% | ≥25% |
| Cash CAC | ≤$500 | ≤$900 |
| Wave-2 states opened | ≥4 | ≥2 |

Context for scale expectations: `FINAL_CONCEPT.md`'s honest ceiling is ~$590K ARR at 5% of ~7,000 firms (TAM verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping). M12 target of ~$145K ARR ≈ 2.2% penetration of the 2,000–4,000-firm SAM — a bootstrapped-healthy trajectory toward that ceiling, not a venture curve. Anyone evaluating this business against venture-scale expectations should stop at `FINAL_CONCEPT.md`'s own admission.

## 5. Kill criteria (specific numbers, specific dates — these are commitments)

A **kill** means: stop acquisition spend, stop feature build, honor existing subscriptions through term with export support, and either (a) pivot per the documented alternatives or (b) wind down. "Keep trying harder" is not a listed option because the adversarial tournament showed this category punishes wishful persistence.

| # | Gate | Kill condition | Rationale |
|---|---|---|---|
| K-0 | **Pre-build interview gate** (before M0) | <5 of 15 interviewed owners express concrete WTP at ≥$79/mo (would trial with intent, or pre-order) | WTP is *assumed, not demonstrated* per `research/PROBLEM_VALIDATION.md`; building without this signal repeats the mistakes the tournament killed 11 concepts for |
| K-1 | **Wedge-on-real-data gate** (design partners, ~M1) | On ≥5 real firm spreadsheets, <40% of rows can be spatially placed even with manual pinning assistance, or 0 of 5 firms get a radar hit they call useful | The skeptic's core warning: if real archives are unmappable or hits don't matter, the wedge degrades to a pin map Qfactor already offers (verified by adversarial review) |
| K-2 | **M4 traction gate** | <10 paying firms AND <75 cumulative audits by end of M4 | Neither demand nor funnel exists; channels this cheap not producing this little means the buyer isn't reachable at viable cost |
| K-3 | **M6 conversion gate** | Trial → paid <10% with ≥50 trials, after at least one funnel iteration | Interest without purchase = ClickUp/whiteboard satisficing wins (the verified $3/user floor); price/value story failed |
| K-4 | **M9 retention gate** | Monthly logo churn >6% for 3 consecutive months (M3+ cohorts), or weekly-engaged <30% of paying base | The compounding-archive retention thesis is false; flat-price LTV math collapses at this churn (LTV < ~$1,700 → CAC ceiling unworkable) |
| K-5 | **M12 scale gate** | <30 paying firms or <$4,000 MRR at M12 despite passing K-2/K-3 | The SAM is real but penetration velocity means decade-to-meaningful; redeploy effort (this mirrors the verified Qfactor pattern: 10 years in market, still obscure) |
| K-6 | **Competitive event (any time)** | A funded or platform player ships free historical-import + spatial archive AND our win rate in head-to-heads drops below 25% for a quarter | The free-tier-floor kill pattern (taxonomy item 2, `DECISION_LOG.md` D-009) arriving in-category; fight only with evidence we're winning |

**Soft pivots short of kill** (documented for completeness): K-1 partial failure → lean the product toward pipeline + status links with the archive as secondary (weaker moat — flag honestly); K-5 near-miss with strong retention → lifestyle-business mode: cut acquisition spend, run profitably at small scale, which flat pricing and low COGS permit.

## 6. Reporting cadence

- **Weekly (founder, 30 min):** north star, funnel counts, activation, time-to-map, parser auto-place rate, at-risk firms (zero-usage 14 days).
- **Monthly:** full metric tree vs. thresholds; win/loss log review; channel CAC table; pricing-test gates (`PRICING_STRATEGY.md` §5).
- **Gate reviews:** at M4, M6, M9, M12 — written verdict against K-gates appended to `decisions/DECISION_LOG.md`, pass or fail, no silent slippage.

---

### Source notes
- TAM/SAM and ceiling: `FINAL_CONCEPT.md`; NAICS 541370 correction verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping.
- "Too slow" latency evidence, Qfactor-obscurity pattern, ClickUp floor, pin-map degradation risk: round-3 market skeptic, `research/revival-round3-results.json` (verified by adversarial review; competitor sites blocked automated fetch per skeptic notes).
- Kill-taxonomy grounding for K-6: `decisions/DECISION_LOG.md` D-009.
- All targets in §4 are assumptions; all kill numbers in §5 are commitments.
