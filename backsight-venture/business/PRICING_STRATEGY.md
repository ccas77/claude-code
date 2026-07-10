# Backsight — Pricing Strategy

**Date:** 2026-07-10 · **Status:** Launch pricing per `FINAL_CONCEPT.md`; test plan below governs changes.

---

## 1. The tiers

| Tier | Price | Users | Included | Who it's for |
|---|---|---|---|---|
| **Solo** | **$79/mo** ($790/yr — 2 months free) | Up to 5 | Pipeline, Prior-Work Radar, historical import, client status links, full data export | 1-crew shops, 3–5 people |
| **Firm** | **$149/mo** ($1,490/yr) | Up to 15 | Everything in Solo + QuickBooks Online invoice push | 2–3 crews, 6–15 people — the center of the ICP |
| **Practice** | **$249/mo** ($2,490/yr) | Unlimited | Everything in Firm + client-branded status pages | 4–5 crews, 16–25 people |

All tiers: 14-day free trial, no credit card to start, no setup/onboarding/import fees, no per-user charges beyond the tier cap, self-serve full export on every tier.

**Blended ARPA assumption for planning: ~$140/mo** (per `FINAL_CONCEPT.md`; assumes a mix skewed toward Firm — this is an assumption until real tier mix data exists).

---

## 2. Rationale anchored to the verified competitive landscape

The adversarial review (round 3, market lens) corrected our original pricing posture. The original concept anchored only against BQE Core — the most expensive comparator — and the skeptic's blunt finding was that Backsight as first drafted was *"positioned above, not below, the real vertical competition."* This strategy is rebuilt against the verified field.

### 2.1 KudurruStone — the per-user math we price against

KudurruStone charges **$25/$15/$5 per user/month by role**, so a 10-person firm lands at roughly **$100/mo**, with no onboarding/import/training fees and a free trial (verified by adversarial review; kudurrustone.com blocked automated fetch, figures obtained via the skeptic's search-index research and flagged for manual re-confirmation before being used in sales collateral).

What this means for us, honestly:

- **We do not win a 5-person price fight against KudurruStone.** A 5-person firm on KudurruStone might pay $75–125/mo depending on role mix; Backsight Solo at $79 is parity, not a discount. We concede the "cheapest" claim at the small end (this concession is recorded in `research/GAP_ANALYSIS.md`).
- **We win the math as the team grows, and we win it predictably.** Per-user pricing creates a hiring tax and a role-classification chore. Flat tiers mean the owner knows the number, and adding a crew chief or a summer field hand costs $0. At 10–15 people, Firm at $149 is in the same band as KudurruStone's ~$100–200 but with zero marginal seat cost and no incentive to under-license field staff.
- **The relevant KudurruStone datapoint isn't only price:** an RPLS forum surveyor abandoned it as *"too slow"* (verified by adversarial review). Speed and simplicity are part of what the price buys; we treat product latency as a pricing feature.

### 2.2 Qfactor and SurveyOps — the posture we price under

- **Qfactor** (founded 2016, rebranded June 2026 claiming "leading software for land surveying firms") has been selling into this buyer for ~10 years and remains obscure with a near-zero review footprint (verified by adversarial review). Its Map View already shows past-project locations. Exact pricing could not be confirmed — qfactor-llc.com blocked automated fetch (per skeptic notes).
- **SurveyOps** ships an iOS field app, S-T-R job organization, guided onboarding at no extra cost, and runs aggressive programmatic SEO (verified by adversarial review, https://survey-ops.com/land-surveying-job-management-software; site blocked deeper automated fetch, so tier prices are unconfirmed). `FINAL_CONCEPT.md` characterizes Qfactor/SurveyOps as annual-contract postures we deliberately undercut with monthly, published, no-quote pricing.

**Our posture against both:** published prices on the website, monthly billing available, no sales call required, no annual lock-in required. In a segment where a decade-old vendor is still obscure, transparency itself is differentiation. **Action item (from skeptic):** manually demo SurveyOps and Qfactor and re-confirm their pricing before any comparison collateral goes out — their exact price points are a verification gap.

### 2.3 The floor below everyone: ClickUp and the whiteboard

Surveyors on the RPLS forum report happily running firms on ClickUp at **~$3/user/mo** (verified by adversarial review), and the modal "competitor" is a whiteboard plus email — cost $0. This is the real pricing constraint: **Backsight's $79–249 must be justified against near-free satisficing, not against other vertical vendors.** The justification is the wedge: ClickUp cannot spatially index a job archive or parse an S-T-R string, and neither can a whiteboard. Every trial must therefore surface a dollar-denominated artifact fast — a radar hit on ground already surveyed, or a delivered-but-uninvoiced job found in the import. That artifact, not feature count, is what carries the price.

### 2.4 Why flat per-firm (not per-seat)

1. **Field crews must never count against a license** (`FINAL_CONCEPT.md`). Per-seat pricing punishes exactly the behavior we need — crews updating stages from the field. Under-licensing field staff is the known SMB failure mode of per-seat tools.
2. **Anti-add-on-creep is a message this segment demonstrably resents being violated** (per the SMB research behind `FINAL_CONCEPT.md`). One price, everything included at the tier, is a sales line the owner can repeat to their partner in one sentence.
3. **It converts KudurruStone's model into our talking point:** "their price goes up when you hire; ours doesn't."
4. **It fits the buyer's mental model:** firms budget software like an insurance premium or a license fee — per firm, per year — not like headcount.

The known cost of flat pricing: we leave money on the table at the largest firms and can't monetize seat growth. Section 4 addresses expansion revenue without breaking the flat promise.

### 2.5 Value anchor (the line sales actually uses)

Jobs in the segment run $500–$5,000 each (`FINAL_CONCEPT.md`). At $149/mo:

- **One radar-assisted win** on previously-surveyed ground pays for 3–30 months of Backsight, before counting the field time saved by existing control.
- **One delivered-but-uninvoiced job caught** by the stuck-jobs digest typically pays for a year.
- These are illustrative arithmetic on our own price and the concept's stated job values — **not market statistics** — and should be presented as such.

---

## 3. Discounting policy

Deliberately narrow. Published price integrity is a strategic asset against quote-only competitors.

| Discount | Terms | Why |
|---|---|---|
| **Annual prepay** | 2 months free (

≈16.7%) | Cash flow + churn insulation; industry-standard, already in `FINAL_CONCEPT.md` |
| **Design partner** (first 10 firms) | 50% off for 12 months, in writing, in exchange for: 2 feedback calls/quarter, permission to use anonymized usage data, and a quote if (and only if) they're genuinely happy | Buys the social proof and interview access the validation plan requires; capped and time-boxed |
| **State society member** | 10% off first year with a society partnership code | Makes society partnerships (see `GO_TO_MARKET.md`) concretely valuable to the society and trackable for us |
| **Everything else** | No | No haggling, no "founder's special" beyond the above, no free tier (the audit lead magnet is the free taste — see `CUSTOMER_ACQUISITION.md`), no discounts to close a quarter |

**No free tier, ever, at launch:** the adversarial review across 12 concepts showed free-tier floors killing paid products; no funded free tier exists in this vertical (per `FINAL_CONCEPT.md`), and we will not create the precedent ourselves.

---

## 4. Expansion revenue paths (without breaking "flat")

Ordered by likelihood; none are committed roadmap, all preserve the flat-per-firm promise.

1. **Tier upgrades (organic):** Solo → Firm on hiring or QuickBooks need; Firm → Practice on the 16th user or the first client who should see a branded status page. This is the primary expansion motion; the tier caps are set so growth naturally crosses them.
2. **Annual conversion:** monthly → annual is +0 revenue but −churn; treat it as expansion for LTV purposes.
3. **Archive services (one-time fees):** paid concierge digitization of paper archives (scan → index → pin) beyond the free CSV import — priced per job or per box, one-time, explicitly not a subscription. Labor-intensive; only offer once there's demand pull and capacity.
4. **Adjacent-vertical editions** (septic designers, foresters, geotechnical field firms — `FINAL_CONCEPT.md`): same field→office→licensed-review shape, new TAM rather than new price. 2027 question, not 2026.
5. **Later candidates, explicitly not promised:** county-recorder data enrichment, title-company-side portal (multi-surveyor status dashboard for the title co. that already sees our links). Both monetize a *different buyer*, so they don't violate firm-flat pricing.

**Anti-path (do not do):** per-crew add-ons, SMS packs, storage tiers, "premium support." Each contradicts the anti-add-on-creep positioning that is load-bearing in the sales story.

---

## 5. Price-test plan

Principles: never test on existing customers (grandfather everything); test one variable at a time; this market is small (~2,000–4,000 serviceable firms per the skeptic-corrected TAM — verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping), so tests are sequential cohorts, not A/B splits.

| Phase | When | Test | Decision rule |
|---|---|---|---|
| **P0 — WTP interviews** | Pre-launch (part of the 15-owner interview gate in `research/PROBLEM_VALIDATION.md`) | Van Westendorp-style questions on $79/$149/$249 + "what do you pay today?" | If >½ of interviewed owners anchor below $79 for the whole category, revisit tiers before launch — willingness to pay at these levels is **assumed, not demonstrated** (per `PROBLEM_VALIDATION.md`) |
| **P1 — Launch cohort** | Months 1–4 | Ship $79/$149/$249 as-is; measure objection rate in founder-led demos, tier mix, trial→paid | If price is cited as primary objection in >30% of lost demos, test P2a; if tier mix is >70% Solo, test P2b |
| **P2a — Firm-tier probe** | Months 5–7 | New-cohort test of Firm at $129 vs $149 (sequential months) | Keep the higher price unless conversion delta >25% relative |
| **P2b — Cap adjustment** | Months 5–7 | Move Solo cap from 5 → 3 users for new signups (pushes 2-crew shops to Firm) | Only if Solo cannibalization is proven, and never retroactively |
| **P3 — Annual push** | Months 6–9 | At-activation annual offer vs. at-renewal offer | Optimize for % of base on annual by month 12 (target ≥40% — assumption) |
| **P4 — Practice validation** | By month 9 | If <5% of customers are on Practice, interview why | Either add a genuine Practice-only capability or fold branded pages into Firm and retire the tier (skeptic explicitly warned the $249 anchor may be unearned) |

**Repricing tripwire:** if SurveyOps or KudurruStone publish pricing that undercuts us with feature parity on the radar (see `RISK_REGISTER.md`, R-1), do not reflex-discount — the segment evidence says speed, simplicity, and the compounding archive retain better than price. Respond on the wedge, cut price only with a specific win/loss dataset showing price as the verified loss reason.

---

### Source notes

- Tier structure, flat-pricing logic, ARPA, and market sizing: `business/FINAL_CONCEPT.md` (authoritative).
- KudurruStone per-user pricing, ClickUp ~$3/user RPLS evidence, "too slow" abandonment, Qfactor obscurity, SurveyOps posture: round-3 market skeptic in `research/revival-round3-results.json` (verified by adversarial review; kudurrustone.com / qfactor-llc.com / survey-ops.com / rpls.com blocked automated fetch — figures from search-index research, flagged for manual re-confirmation).
- SurveyOps existence + S-T-R positioning: https://survey-ops.com/land-surveying-job-management-software (note: this is the competitor's own page).
- TAM correction (~7,000 firms / ~7,382 establishments, NAICS 541370): verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping
