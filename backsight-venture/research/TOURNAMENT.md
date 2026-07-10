# The Backsight Candidate Tournament

**Date compiled:** 2026-07-10
**Inputs:** `research/raw-scan-full.json` (34 evidenced problems, 8 scouts) → `research/tournament-shortlist.json` (12 candidates) → `research/tournament-results.json` (12 concepts, 3 judge scorecards, weighted ranking, round-1 skeptic verdicts) → `research/skeptic-round2-partial.json` (round-2 verdicts) → `research/revival-round3-results.json` (round-3 concepts and verdicts).
**Companion document:** [`ADVERSARIAL_REVIEW.md`](./ADVERSARIAL_REVIEW.md) — the complete skeptic history that this tournament fed into.

---

## 1. Pipeline overview

```
34 evidenced problems (8 parallel research scouts, every claim cited)
        │  shortlist: hard-dollar pain, evidence quality, buildability, thesis diversity
        ▼
12 tournament candidates (2 formed by merging independent-scout convergences)
        │  one product concept designed per candidate
        ▼
12 SaaS concepts, scored by a 3-persona judge panel (8 criteria × weighted aggregate)
        │  top 4 advance
        ▼
Round 1: dual adversarial skeptics per finalist (web-research-backed) → ALL 4 REJECTED
        ▼
Round 2: ranks 5–8 face the identical gauntlet → ALL 4 REJECTED
        │  seven-pattern kill taxonomy codified from the 8 autopsies
        ▼
Round 3: 4 revival candidates engineered against the kill taxonomy → dual skeptics again
        ▼
WINNER: Backsight (land-surveyor job tracking + prior-work intelligence)
— the only concept of 12 whose market skeptic found zero fatal flaws
```

The tournament was deliberately designed so that no concept could win on judge scores alone: every would-be winner had to survive two independent skeptics doing fresh web research, including spot-checks of the original scouts' citations (Decision Log, D-007/D-008).

---

## 2. The 12 shortlisted candidates

The shortlist was drawn from the 34 scouted problems using four criteria (Decision Log, D-006): (a) pain denominated in hard dollars or legal risk, not convenience; (b) evidence quality — named prices, named incumbents, documented failures; (c) buildability without gated access; (d) diversity across the 8 hunting grounds.

The 8 scouts (hunting grounds): `smb-trades`, `niche-pros`, `reg-compliance`, `ai-era-ops`, `creators-solo`, `ecommerce-sellers`, `devtools-b2b`, `hated-incumbents`.

| # | Candidate key | Title (abridged) | Scout(s) | Source problem(s) of the 34 |
|---|---|---|---|---|
| 1 | `hvac-agreements` | Standalone maintenance-agreement tracker for small HVAC/plumbing shops | smb-trades | #0 |
| 2 | `coi-tracking` | Affordable COI collection & expiry-chasing for small GCs and property managers | smb-trades **+ niche-pros (merge)** | #1 + #4 |
| 3 | `backflow-compliance` | Backflow test report filing + annual retest reminder engine | smb-trades | #2 |
| 4 | `commission-recon` | Carrier commission reconciliation for small independent insurance agencies | niche-pros | #5 |
| 5 | `eaa-accessibility` | Continuous EAA/WCAG compliance monitoring for SMB e-commerce (anti-overlay) | reg-compliance | #8 |
| 6 | `autorenewal-compliance` | Auto-renewal law (ARL) compliance auditor + annual-reminder engine | reg-compliance | #10 |
| 7 | `ai-cost-margin` | Per-client LLM cost attribution and margin tracking for agencies | ai-era-ops **+ devtools-b2b (merge)** | #16 + #28 |
| 8 | `sponsorship-ops` | Sponsorship-operations hub for indie newsletters and podcasts | creators-solo | #18 |
| 9 | `affiliate-linkrot` | Affiliate link-rot monitor for YouTube creators | creators-solo | #20 |
| 10 | `threepl-audit` | 3PL / fulfillment invoice auditing for small DTC brands | ecommerce-sellers | #22 |
| 11 | `chargeback-evidence` | Flat-fee chargeback evidence automation for Shopify/Stripe merchants (anti-Chargeflow) | ecommerce-sellers | #24 |
| 12 | `membership-refuge` | Membership management for small clubs fleeing Wild Apricot | hated-incumbents | #29 |

**The two independent-scout merges.** Two problems were discovered independently by two different scouts working disjoint hunting grounds — treated as a convergence signal and merged into single candidates:

- **COI tracking** — found by both `smb-trades` (problem #1, GC/property-manager angle, myCOI per-vendor pricing) and `niche-pros` (problem #4, enterprise-incumbent pricing / LLM-extraction feasibility angle).
- **Per-client AI cost attribution** — found by both `ai-era-ops` (problem #16, agency per-client billing) and `devtools-b2b` (problem #28, per-customer AI margin guardrails into Stripe).

**Notable drops from the 34** (Decision Log, D-006): interpreter-agency back-office (ops burden), HOA treasurer-in-a-box (fiduciary/ACH exposure), pet-boarding software (crowded), support-AI answer QA (gated data), youth-sports league management (volunteer buyers, no budget), and **surveyor job tracking (#7 — dropped for "weaker evidence of software WTP vs hardware spend")**. That last drop matters: the eventual tournament winner, Backsight, is this problem revived in round 3 after every shortlisted finalist had been killed on evidence.

---

## 3. The 12 concepts

Each shortlisted problem was turned into a concrete SaaS concept by a dedicated ideation agent (no web research at this stage — claims were tested later by the skeptics, who did have web access).

| Candidate | Product concept | One-liner (abridged) | Pricing posture |
|---|---|---|---|
| `chargeback-evidence` | **DisputeKit** | Flat-fee chargeback evidence automation; 2-hour dispute response → 5-minute review-and-submit; keep 100% of recoveries | $49 / $99 / $199 per mo flat, "no success fees ever" |
| `coi-tracking` | **CertChase** | Auto-reads ACORD 25 certificates and chases subs' insurance agents for renewals | $49+ flat tiers by vendor count |
| `threepl-audit` | **MarginHawk** | Audits the 3PL's monthly invoice against your own rate card; drafts the dispute email inside the 30–90-day window | $99 / $199 / $349 by monthly fulfillment spend |
| `commission-recon` | **ShortPay** | Turns the pile of carrier commission statements into a reconciled ledger; flags every short-pay | $99 / $199+ per agency |
| `eaa-accessibility` | **Statement** (statement.eu) | Weekly WCAG scans + always-current EU accessibility statement + evidence file | $39 / $79+ per store |
| `hvac-agreements` | **TuneUp Keeper** | Standalone maintenance-agreement manager: auto-bills memberships, never lets a visit go unscheduled | $79 / $129 / $199 flat by agreement count |
| `membership-refuge` | **Clubhouse HQ** | One-click Wild Apricot import; bills only active members; never taxes your payment processor | $29 / $59 / $99 by active members |
| `autorenewal-compliance` | **RenewGuard** | Scores signup/cancel/reminder flows against 20+ state ARLs; runs the mandated annual reminders | Audit $99/mo; Operate $299/mo |
| `ai-cost-margin` | **Marginal** | Drop-in LLM proxy that tags every API call to a client; live margin per client; billable-usage statements | $49+ by clients tracked, not tokens |
| `sponsorship-ops` | **SlotDeck** | Slot calendar, sponsor portal, deliverable tracker; replaces the breaking spreadsheet | $29/mo flat, zero commission |
| `backflow-compliance` | **RetestHQ** | Gauge readings → the exact form each city wants + automatic 12-month retest chasing | Solo $59/mo; Crew $99/mo |
| `affiliate-linkrot` | **LinkPatrol** | Watches every affiliate link in the YouTube back catalog; ranks dead links by dollars; bulk-fixes via API | $19+ by channel/video count |

---

## 4. Judge panel design

Three judge personas with deliberately conflicting priors each scored **all 12 concepts** on 8 criteria (1–10). Persona diversity is a failure-mode net: the VC catches vitamin products, the indie catches unreachable niches and ops burden, the CTO catches gated-API fantasies (Decision Log, D-007). The personas, as prompted:

| Judge | Persona | Stated priorities |
|---|---|---|
| **VC** | Seed-stage B2B SaaS investor | Market pull, willingness to pay, expansion potential, wedge-to-company path; "allergic to vitamin products and crowded categories" |
| **Indie** | Successful bootstrapped indie hacker (Tyler Tringas / Rob Walling school) | Reachable niches, cheap distribution, low operational burden, time-to-first-dollar; avoids enterprise sales and 24/7 ops |
| **CTO** | Pragmatic CTO assessing technical risk | Whether a non-specialist can genuinely build **and maintain** this with Claude Code: API availability without gated credentials, data-model complexity, failure modes, ongoing accuracy/liability risk, integration fragility |

### Weighted scoring system

Each judge's concept score is a weighted sum of the 8 criterion scores; the final tournament score is the mean across the three judges. Weights encode the brief's hard constraint that Claude-Code buildability dominates (Decision Log, D-007). The weights below reproduce every published ranking score exactly (maximum possible weighted score: 97.0):

| Criterion | Weight | Rationale |
|---|---|---|
| Buildability | ×1.5 | Hard constraint: non-specialist + Claude Code must be able to ship it |
| Claude Code fit | ×1.5 | Same constraint, maintenance included |
| Willingness to pay | ×1.3 | Revenue proof beats market theory |
| Pain | ×1.2 | Must be denominated in dollars or legal risk |
| Urgency | ×1.1 | Deadline-driven pain converts |
| Differentiation | ×1.1 | Wedge quality |
| Market size | ×1.0 | Useful, but indie scale acceptable |
| Distribution | ×1.0 | Channel realism |

---

## 5. Full ranking

### 5.1 Final ranking (weighted average across 3 judges, max 97.0)

Dimension columns are the 3-judge mean per criterion (1–10).

| Rank | Concept | **Weighted score** | VC | Indie | CTO | Pain | Urg | WTP | Mkt | Diff | Build | CC-fit | Dist |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | DisputeKit (`chargeback-evidence`) | **72.20** | 73.8 | 71.4 | 71.4 | 8.0 | 6.7 | 7.3 | 7.0 | 5.7 | 8.0 | 9.0 | 7.0 |
| 2 | CertChase (`coi-tracking`) | **68.53** | 69.3 | 67.0 | 69.3 | 7.7 | 5.7 | 7.0 | 7.0 | 5.0 | 8.0 | 9.0 | 6.0 |
| 3 | MarginHawk (`threepl-audit`) | **68.00** | 70.4 | 69.3 | 64.3 | 7.0 | 6.3 | 7.0 | 5.7 | 7.0 | 7.7 | 8.7 | 5.7 |
| 4 | ShortPay (`commission-recon`) | **67.97** | 70.8 | 67.4 | 65.7 | 7.7 | 5.0 | 8.0 | 6.0 | 7.0 | 7.7 | 8.7 | 4.7 |
| 5 | Statement (`eaa-accessibility`) | **66.50** | 66.3 | 66.9 | 66.3 | 6.0 | 7.3 | 6.0 | 7.0 | 6.0 | 7.7 | 8.0 | 6.3 |
| 6 | TuneUp Keeper (`hvac-agreements`) | **64.97** | 62.7 | 64.6 | 67.6 | 7.0 | 5.0 | 6.7 | 5.7 | 5.7 | 8.7 | 8.3 | 5.0 |
| 7 | Clubhouse HQ (`membership-refuge`) | **64.17** | 64.9 | 61.9 | 65.7 | 7.0 | 5.0 | 6.0 | 7.3 | 4.7 | 7.7 | 8.3 | 6.0 |
| 8 | RenewGuard (`autorenewal-compliance`) | **62.63** | 66.1 | 60.4 | 61.4 | 6.7 | 7.0 | 6.3 | 6.0 | 7.0 | 6.0 | 6.7 | 6.0 |
| 9 | Marginal (`ai-cost-margin`) | **60.37** | 67.8 | 56.6 | 56.7 | 6.3 | 5.3 | 5.3 | 5.7 | 4.7 | 6.7 | 8.3 | 6.7 |
| 10 | SlotDeck (`sponsorship-ops`) | **60.27** | 61.2 | 58.5 | 61.1 | 5.0 | 3.7 | 4.0 | 5.3 | 5.3 | 9.0 | 8.7 | 7.3 |
| 11 | RetestHQ (`backflow-compliance`) | **55.77** | 54.3 | 52.7 | 60.3 | 6.3 | 5.0 | 5.3 | 3.3 | 5.7 | 7.7 | 7.3 | 3.7 |
| 12 | LinkPatrol (`affiliate-linkrot`) | **55.33** | 59.7 | 53.7 | 52.6 | 5.7 | 4.7 | 5.3 | 5.3 | 6.3 | 5.3 | 6.3 | 6.7 |

**Top 4 advanced to round-1 adversarial review:** `chargeback-evidence`, `coi-tracking`, `threepl-audit`, `commission-recon`.

### 5.2 Per-judge raw scorecards (1–10 per criterion; weighted total per judge)

**Judge: VC**

| Concept | Pain | Urg | WTP | Mkt | Diff | Build | CC-fit | Dist | Weighted |
|---|---|---|---|---|---|---|---|---|---|
| chargeback-evidence | 8 | 7 | 8 | 7 | 6 | 8 | 9 | 7 | 73.8 |
| commission-recon | 8 | 6 | 8 | 6 | 7 | 8 | 9 | 5 | 70.8 |
| threepl-audit | 7 | 7 | 7 | 6 | 7 | 8 | 9 | 6 | 70.4 |
| coi-tracking | 8 | 6 | 7 | 7 | 5 | 8 | 9 | 6 | 69.3 |
| ai-cost-margin | 7 | 6 | 6 | 7 | 5 | 8 | 9 | 7 | 67.8 |
| eaa-accessibility | 6 | 7 | 6 | 7 | 6 | 8 | 8 | 6 | 66.3 |
| autorenewal-compliance | 7 | 7 | 6 | 6 | 7 | 7 | 8 | 6 | 66.1 |
| membership-refuge | 7 | 5 | 5 | 7 | 5 | 9 | 9 | 5 | 64.9 |
| hvac-agreements | 7 | 5 | 6 | 5 | 5 | 9 | 8 | 5 | 62.7 |
| sponsorship-ops | 5 | 4 | 4 | 5 | 6 | 9 | 9 | 7 | 61.2 |
| affiliate-linkrot | 6 | 5 | 6 | 5 | 7 | 6 | 7 | 7 | 59.7 |
| backflow-compliance | 6 | 5 | 5 | 3 | 6 | 8 | 7 | 3 | 54.3 |

**Judge: Indie**

| Concept | Pain | Urg | WTP | Mkt | Diff | Build | CC-fit | Dist | Weighted |
|---|---|---|---|---|---|---|---|---|---|
| chargeback-evidence | 8 | 7 | 7 | 7 | 5 | 8 | 9 | 7 | 71.4 |
| threepl-audit | 7 | 6 | 7 | 6 | 7 | 8 | 9 | 6 | 69.3 |
| commission-recon | 7 | 4 | 8 | 6 | 7 | 8 | 9 | 5 | 67.4 |
| coi-tracking | 7 | 5 | 7 | 7 | 5 | 8 | 9 | 6 | 67.0 |
| eaa-accessibility | 6 | 8 | 6 | 7 | 6 | 7 | 8 | 7 | 66.9 |
| hvac-agreements | 7 | 5 | 7 | 6 | 6 | 8 | 8 | 5 | 64.6 |
| membership-refuge | 7 | 5 | 7 | 8 | 4 | 6 | 7 | 7 | 61.9 |
| autorenewal-compliance | 6 | 7 | 6 | 6 | 7 | 6 | 6 | 6 | 60.4 |
| sponsorship-ops | 5 | 3 | 4 | 5 | 5 | 9 | 8 | 8 | 58.5 |
| ai-cost-margin | 6 | 5 | 5 | 5 | 4 | 6 | 8 | 7 | 56.6 |
| affiliate-linkrot | 5 | 4 | 4 | 5 | 6 | 6 | 7 | 7 | 53.7 |
| backflow-compliance | 6 | 5 | 5 | 3 | 5 | 7 | 7 | 4 | 52.7 |

**Judge: CTO**

| Concept | Pain | Urg | WTP | Mkt | Diff | Build | CC-fit | Dist | Weighted |
|---|---|---|---|---|---|---|---|---|---|
| chargeback-evidence | 8 | 6 | 7 | 7 | 6 | 8 | 9 | 7 | 71.4 |
| coi-tracking | 8 | 6 | 7 | 7 | 5 | 8 | 9 | 6 | 69.3 |
| hvac-agreements | 7 | 5 | 7 | 6 | 6 | 9 | 9 | 5 | 67.6 |
| eaa-accessibility | 6 | 7 | 6 | 7 | 6 | 8 | 8 | 6 | 66.3 |
| commission-recon | 8 | 5 | 8 | 6 | 7 | 7 | 8 | 4 | 65.7 |
| membership-refuge | 7 | 5 | 6 | 7 | 5 | 8 | 9 | 6 | 65.7 |
| threepl-audit | 7 | 6 | 7 | 5 | 7 | 7 | 8 | 5 | 64.3 |
| autorenewal-compliance | 7 | 7 | 7 | 6 | 7 | 5 | 6 | 6 | 61.4 |
| sponsorship-ops | 5 | 4 | 4 | 6 | 5 | 9 | 9 | 7 | 61.1 |
| backflow-compliance | 7 | 5 | 6 | 4 | 6 | 8 | 8 | 4 | 60.3 |
| ai-cost-margin | 6 | 5 | 5 | 5 | 5 | 6 | 8 | 6 | 56.7 |
| affiliate-linkrot | 6 | 5 | 6 | 6 | 6 | 4 | 5 | 6 | 52.6 |

---

## 6. Per-judge rationale highlights

Condensed from the three judges' written rationales in `tournament-results.json` (VC / Indie / CTO respectively).

**1. DisputeKit (chargeback-evidence, 72.20)**
- *VC:* Quantified, growing pain and documented incumbent resentment at a 25% take rate; "best pull-per-dollar-of-build in the batch." But "differentiation is a pricing model, not a moat — Chargeflow can ship a flat tier," and Stripe improving native dispute tooling is a standing platform threat.
- *Indie:* Best proof of WTP on the list (merchants paying Chargeflow 25% and publicly furious); Stripe's public Disputes API + test mode makes it the cleanest end-to-end indie build. Win-rate credibility must be earned fast "or flat-fee looks like paying for losses."
- *CTO:* The rare concept fully buildable and verifiable by a non-specialist on day one (Stripe test mode exercises the whole loop with zero real money). Shopify App Store review gates the best channel.

**2. CertChase (coi-tracking, 68.53)**
- *VC:* Seven-figure downside risk, proven budget (myCOI at $1.5–3k/yr), large horizontal market. "A visibly crowding category — TrackMyVendor, Billy, COI File are all racing to the same SMB tier and LLM extraction is no moat."
- *Indie:* Standardized public form (ACORD 25) + LLM extraction ≈ near-perfect indie build; but the low end is crowding, the pain is seasonal, and a false "compliant" grade "carries scary liability optics."
- *CTO:* Magic-link loop needs no gated credentials; but "the product is fundamentally an email robot whose deliverability is a fragile single point of failure," and the false-pass liability tail is carried forever.

**3. MarginHawk (threepl-audit, 68.00)**
- *VC:* Hard-dollar recovery with a built-in deadline (30–90-day dispute window) and a killer first-session "you were overcharged $1,214" moment; per-logo ceiling modest.
- *Indie:* No gated APIs at all; LLM-parse-then-deterministic-math is a near-ideal Claude Code build. Rate-card transcription is heavy onboarding friction; "churn looms after a few clean months."
- *CTO:* Everything arrives as the customer's own files, deterministic dim-weight math gives an instant dollar number; but multi-format invoice parsing is a brittle funnel where "one mis-flagged charge kills trust."

**4. ShortPay (commission-recon, 67.97)**
- *VC:* Hard-dollar recovery ($10–16k/yr claimed leakage) against a non-consuming Excel incumbent; free first-statement audit is a great conversion mechanic. Boomer-heavy buyer, distribution is a grind.
- *Indie:* "Upload one statement, see your leakage" is a genuine one-session conversion; but no deadline means chronic-not-acute urgency, and "the buyer... doesn't search for the category — distribution is the whole risk."
- *CTO:* Zero-template LLM parsing is a structural edge over legacy per-carrier-template tools; but "extraction accuracy on money is existential — one miscounted statement kills trust."

**5. Statement (eaa-accessibility, 66.50)**
- *VC:* Live regulatory forcing function (EAA enforceable, French suits filed) + smart anti-overlay wedge; urgency "may decay to vitamin status if lawsuits stay rare."
- *Indie:* The auto-maintained statement/evidence file is a retention hook nobody sells at SMB price; fear-driven demand converts fast but churns when the fear fades; FR/DE localization is real labor.
- *CTO:* Whole stack open-source and ungated (Playwright + axe-core); but axe-core's ~30–40% detection ceiling "means the promise can never be 'compliant.'"

**6. TuneUp Keeper (hvac-agreements, 64.97)**
- *VC:* Dollar-denominated pain with a demoable 30-second wedge; "suite gravity is brutal — this is a feature Jobber/Housecall Pro can fold into a tier... a nice $30–50k MRR indie business, not a venture outcome."
- *Indie:* Proven budget (shops pay $59–600/mo for FSM); but double-entry friction and the card-re-collection migration are retention/onboarding killers.
- *CTO:* Near-ideal technical profile (CRUD + Stripe + cron, zero gated APIs); the double-entry problem is one "software can't fully solve."

**7. Clubhouse HQ (membership-refuge, 64.17)**
- *VC:* Genuinely hated PE-degraded incumbent with documented price hikes and a petition; but volunteer buyers with board cycles are "the slowest, most inertia-bound purchasers in software."
- *Indie:* High-intent SEO ("Wild Apricot alternative") and sticky-once-migrated customers; but the feature surface is the biggest build here and low-tech volunteer admins generate margin-eating support load.
- *CTO:* Textbook indie stack, no gated APIs; but no tech moat beyond migration UX, and the support/feature-parity tail grinds a solo maintainer at $29–99 ARPU.

**8. RenewGuard (autorenewal-compliance, 62.63)**
- *VC:* Real settlements ($2.5–7.5M) create fear-driven conversion and the Operate tier is genuinely sticky; but "a solo-maintained 20-state legal matrix is both the moat and the existential liability."
- *Indie:* Genuinely unowned combination (matrix + flow audit + mandated-reminder ops); but one statute error is reputationally fatal and UPL exposure looms.
- *CTO:* "The software is trivial; the thing that's hard is exactly the thing Claude Code can't safely own."

**9. Marginal (ai-cost-margin, 60.37)**
- *VC:* Rides a fast-growing spend category with a genuinely underserved wedge; but small AI agencies are "the churniest, most mortal segment in SaaS" and LiteLLM/Helicone are one feature away.
- *Indie:* The founder can live where the buyer congregates; but running a production LLM proxy is 24/7 ops — "the opposite of low operational burden."
- *CTO:* Pure dev-tooling build; but sitting in the critical path of clients' production LLM traffic is a heavy availability/security burden for an indie.

**10. SlotDeck (sponsorship-ops, 60.27)**
- *VC:* The sponsor portal is a legitimately viral loop; but "classic vitamin economics with a hard ceiling... fun indie business; not a fund-returner."
- *Indie:* Superb distribution and the easiest build on the list; but $29 ARPU from high-mortality creators whose real competitor is "my sheet works fine."
- *CTO:* Fully mockable, easiest build of the twelve; the two-sided bet (sponsors must actually use the portal) can quietly collapse the core value.

**11. RetestHQ (backflow-compliance, 55.77)**
- *VC:* Real mandated workflow, clean per-metro land-and-expand; but "a lifestyle-business TAM... nothing here becomes a company at seed scale."
- *Indie:* Hyper-reachable niche (cities publish prospect lists); but tiny market, offline buyers sold one phone call at a time, and FlowCert already has a 1,700-city head start.
- *CTO:* Technically clean; but the per-jurisdiction form-template treadmill is a permanent maintenance tax where a stale form recreates the fine risk the product sells against.

**12. LinkPatrol (affiliate-linkrot, 55.33)**
- *VC:* Detect-plus-repair loop genuinely novel vs AMZ Watcher; personalized free leak scan is a great cold-outreach mechanic; triple platform dependency plus a built-in churn cliff.
- *Indie:* Best growth loop here; but the build is hostage to Google OAuth verification/write quotas and Amazon PA-API qualification.
- *CTO:* "The gated-credentials minefield of the batch" — the fallback edges into fragile ToS-adjacent scraping; value decays once the catalog is cleaned.

---

## 7. What happened after the judging

The scores above decided **who got attacked first**, not who won. Full detail is in [`ADVERSARIAL_REVIEW.md`](./ADVERSARIAL_REVIEW.md); the outcomes:

| Round | Candidates | Outcome |
|---|---|---|
| 1 | Top 4 (DisputeKit, CertChase, MarginHawk, ShortPay) | **All four rejected** — market skeptics found disqualifying facts (platform-native substitutes, free-tier floors, technically unsound wedge, commoditized moat + circular evidence) |
| 2 | Ranks 5–8 (Statement, TuneUp Keeper, Clubhouse HQ, RenewGuard) | **All four rejected** — occupied categories, self-contradicting architecture, near-clone competitors, regulated-deliverable exposure |
| 3 | Four revival candidates engineered against the kill taxonomy | **Backsight selected**; three others rejected |

A telling pattern (Decision Log, D-008): the judges systematically rewarded "hard-dollar recovery" theses — but those same money-recovery categories attract fast-following competition and platform-native features, which is exactly what the skeptics' fresh web research exposed. This is why the tournament design refused to let a "seriously weakened" candidate win merely by out-scoring other weakened candidates.

---

## 8. Round 3: the revival candidates

After eight consecutive kills, the seven verified kill patterns were codified into a **kill taxonomy** (see `ADVERSARIAL_REVIEW.md` §5) and four new candidates were engineered against it: three revived, previously unskepticized problems from the original 34, plus one skeptic-prescribed pivot of a killed candidate (Decision Log, D-009).

| Revival concept | Origin in the 34 problems | What it proposed | Skeptic verdicts (impl / market) |
|---|---|---|---|
| **Registry Radar** (`str-eu-compliance`) | #9 (reg-compliance): EU short-term-rental registration compliance | Host-side compliance system of record for EU STR portfolios: curated registry-requirements DB, renewal deadlines, rule-change alerts, document vault. Per-unit pricing from €19/mo | seriously_weakened / seriously_weakened — **killed** |
| **Backsight** (`surveyor-jobtrack`) | #7 (niche-pros): land-surveyor job tracking — *dropped from the original shortlist* | Job pipeline that speaks surveying (fieldwork → drafting → licensed review → delivery), client status links, and a prior-work archive searchable by Section-Township-Range. Flat firm pricing $79/$149/$249 | **survives_with_fixes / seriously_weakened (zero fatal flaws) — WINNER** |
| **TerpDesk** (`interpreter-backoffice`) | #6 (niche-pros): interpreter-agency back office — also dropped from the original shortlist | Scheduling + dual-rate billing for small onsite interpreter agencies at 1/5th incumbent price. $79–$249/mo flat | seriously_weakened / **kill** (the hardest verdict of the tournament) — **killed** |
| **PlanPatrol** (`hvac-radar-pivot`) | Pivot of #0 / `hvac-agreements`, re-architected per round-2 skeptic prescriptions: integration-first, read-only, no SMS, no payments | Read-only "profit-leak radar" over the CSV exports the shop already produces; flags sold-but-never-scheduled members, owed visits, imminent lapses. $79/mo flat | survives_with_fixes / seriously_weakened — **killed** (market fatal flaws) |

**Why Backsight won** (Decision Log, D-010): it was the only concept in all three rounds whose **market skeptic returned zero fatal flaws**. Its market verdict was "seriously weakened" on correctable grounds — competitors exist and were named (Qfactor, SurveyOps, KudurruStone, Cyanic Job Book), the TAM claim was ~3× overstated (corrected to ~7,000 establishments per Census NAICS 541370), and the original evidence citations were vendor marketing — but nothing structural was false. Its implementability verdict was "survives with fixes," with a concrete, fully addressable fix list (license-clean S-T-R parser instead of pyTRS, principal-meridian disambiguation, address-first ingestion, repricing against KudurruStone). Every rejected competitor died on a structural falsehood: a free-tier floor, a platform-native substitute, a technically unsound wedge, a regulated deliverable, or an evidence base that collapsed under spot-checking.

The chosen trade is stated plainly in the Decision Log: preferring a concept with **surviving-but-modest economics** (~$590K ARR at 5% of ~7,000 firms) over concepts with bigger claimed TAMs and fatal flaws — execution risk over structural falsehood. The post-skeptic concept, with all mandatory fixes incorporated, is authoritative in [`../business/FINAL_CONCEPT.md`](../business/FINAL_CONCEPT.md); the build plan is in [`../product/MVP_BUILD_SPEC.md`](../product/MVP_BUILD_SPEC.md).
