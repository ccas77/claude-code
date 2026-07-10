# Backsight — Customer Acquisition Plan

**Date:** 2026-07-10 · Companion to `GO_TO_MARKET.md` (channels) and `SALES_ONBOARDING_FLOW.md` (conversion mechanics).

Ground rules inherited from the research: the serviceable market is **~2,000–4,000 firms** (skeptic-corrected from NAICS 541370's ~7,000 firms — verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping), buyers are slow-adopting field professionals (a decade-old vertical vendor, Qfactor, remains obscure — verified by adversarial review), and category SEO is contested by SurveyOps's programmatic pages (verified by adversarial review, https://survey-ops.com/land-surveying-job-management-software). So: high-trust channels, patient funnel, founder-led early.

---

## 1. The lead magnet: the free Prior-Work Audit

**Offer:** *"Import your job list. Get a map of everything your firm has ever surveyed — free."*

Upload the spreadsheet the firm already has → Backsight geocodes/parses/pins it → the firm gets an interactive **coverage map** plus a one-page audit: jobs indexed, sections with repeat work ("you've been in Section 14, T7N R69W four times"), clusters that suggest quotable ground, and rows the importer couldn't place. Converting to a trial keeps the imported archive; walking away gets a PNG of the map and a clean CSV back.

Why this and not an S-T-R lookup tool: the lookup slot is already owned by randymajors.org, Earth Point, and Township America (verified by adversarial review, https://www.earthpoint.us/Townships.aspx, https://townshipamerica.com/). The skeptic's explicit recommendation — adopted here — was to replace it with *"a free 'import your job history, get a map of everything your firm has ever surveyed' one-shot tool that is itself the onboarding funnel"* (`research/revival-round3-results.json`). The audit **is** the product's first-run experience wearing a marketing hat: it demos the exact wedge no competitor advertises, and its output is inherently shareable (owners show the coverage map to partners and peers).

Mechanics:
- No credit card; email required (the map is emailed as well as shown).
- Runs on address geocoding first (US Census Geocoder, free — `FINAL_CONCEPT.md` fix #3); legal descriptions are bonus, never required.
- Every completed audit triggers a personal founder email offering a 15-minute "walk your map" call — the top of the founder-led motion.
- Guardrail: the audit is one-shot and read-only. Ongoing radar-on-new-requests, pipeline, and status links require the trial — the free taste must not become a free tier (`PRICING_STRATEGY.md` §3).

---

## 2. Funnel math (all rates are assumptions — no cohort data exists yet)

Model for months 1–12, blended across channels. **Every number in the "assumed rate" column is an explicit assumption to be replaced by observed data at the day-90 and month-6 checkpoints.**

| Stage | Definition | Assumed rate | Year-1 volume |
|---|---|---|---|
| Reached | Sees Backsight (newsletter, booth, forum, status-link footer, referral) | — | ~6,000 impressions of the ~2,000–4,000-firm SAM (multiple touches per firm) |
| Engaged lead | Runs the Prior-Work Audit **or** books a demo | 5% of reached → | **300 audits/demos** |
| Trial | Starts the 14-day trial | 50% of engaged → | **150 trials** |
| Activated | Meets activation definition (`SALES_ONBOARDING_FLOW.md` §4: import + radar hit + pipeline live + status link shared) | 55% of trials → | **~82 activated** |
| Paying | Converts to any paid tier | 75% of activated (≈41% of trials) → | **~62 paying firms** |
| Retained @12mo | Still subscribed | 97.5%/mo logo retention (assumption) → | **~55 net** |

Cross-checks on plausibility:
- 62 paying firms ≈ **1.6–3.1% of SAM** in year 1 — aggressive but not absurd for a founder-led vertical launch; `FINAL_CONCEPT.md`'s long-run scenario is 5% penetration.
- The 41% trial→paid assumption is high for horizontal SaaS but reflects a concierge-touched, high-intent funnel (audits are self-selected owners with their own data already in). **If observed trial→paid is <20% with ≥50 trials, the funnel model is wrong — re-plan** (tripwire mirrored in `METRICS_SUCCESS_CRITERIA.md`).
- Whiteboard inertia is the named adoption risk (`FINAL_CONCEPT.md`); the audit exists precisely to convert inertia into curiosity with the firm's own data.

### Channel mix assumption for the 300 engaged leads

| Channel | Share | Leads | Basis |
|---|---|---|---|
| State societies (newsletters, webinars, member code) | 30% | 90 | 5 wave-1 states × newsletter reach (assumption) |
| Conference booths (5 events) | 20% | 60 | ~12 booth audits/demos per event (assumption) |
| r/Surveying + RPLS participation | 15% | 45 | steady trickle, high intent (assumption) |
| Referrals + status-link footer | 20% | 60 | back-loaded to H2 as installed base grows (assumption) |
| Podcasts, QBO App Store, dealers, misc. | 15% | 45 | assumption |

---

## 3. CAC targets vs LTV at flat pricing

**LTV model (all assumptions labeled):**
- Blended ARPA: **$140/mo** (`FINAL_CONCEPT.md` planning figure).
- Monthly logo churn: **2.5%** (assumption → ~40-month average lifetime; no vertical benchmark exists in our research — the compounding-archive moat argues for lower churn over time, per `FINAL_CONCEPT.md`, but that is a thesis, not data).
- Gross margin: **~85%** (assumption; hosting + geocoding are cheap, support is founder time).
- **Gross-margin LTV ≈ $140 × 40 × 0.85 ≈ $4,760.**

**CAC targets:**

| Guardrail | Target | Meaning at $140 ARPA |
|---|---|---|
| Blended CAC (all spend + valued founder time ÷ new customers) | **≤ $1,200** | LTV:CAC ≥ ~4:1 |
| Cash CAC (out-of-pocket only, excl. founder time) | **≤ $500** | Payback ≤ ~4 months of revenue |
| Per-channel kill line | Any channel with cash CAC > $2,000 after 2 quarters gets cut | — |

Year-1 sanity check: planned cash spend ≈ $15–20K (5 booths ~$5–7K, newsletters/sponsorships ~$4K, referral credits ~$3K, tools/design-partner subsidies ~$4K — all estimates) ÷ 62 customers ≈ **$240–320 cash CAC**. The binding constraint is founder time, not dollars — which is correct for a bootstrapped niche play. **Honest caveat:** if founder time is priced at even $75/hr, blended CAC in the founder-led phase will exceed $1,200; that is the deliberate, temporary cost of building the reference base and does not scale past customer ~50 (see `SALES_ONBOARDING_FLOW.md` §6).

---

## 4. Content strategy (explicitly not saturated-SEO-dependent)

The kill taxonomy bans panic-SEO distribution (D-009, `decisions/DECISION_LOG.md`), and the category's commercial keywords are SurveyOps's programmatic turf (verified by adversarial review). Content therefore exists to build *trust and referability in community channels*, not rankings:

1. **The coverage map as content.** Every audit produces a shareable artifact. Anonymized "firm archaeology" posts — "this 3-person Wisconsin firm didn't know it had surveyed the same section 11 times" — are the flagship recurring format for newsletters, talks, and forums (with permission, always).
2. **Practice-economics essays, not keyword pages.** One well-researched piece per month aimed at owners: quoting repeat ground, the real cost of status calls, succession and the retiring owner's memory (the archive-as-succession-asset angle), delivered-but-uninvoiced leakage. Distributed via society newsletters and forum posts, not optimized for Google.
3. **The honest-research story.** The tournament itself — 34 problems, 12 concepts, adversarial review, why surveying won — is a credibility asset for podcasts and conference talks with this rigor-respecting audience.
4. **Long-tail SEO as a byproduct only.** Publish the essays on our site with clean titles and let non-contested long-tail queries accrue; spend zero effort on the contested head terms.
5. **What we don't do:** listicles ("Best surveying software 2026" — the format the skeptics repeatedly exposed as vendor slop, e.g. the flagged CQ and QuoteIQ pages in our own original evidence), comparison-page warfare, AI-generated volume content.

---

## 5. First-100-customers playbook

Sequenced, cumulative. Numbers are targets (assumptions), reconciled with `GO_TO_MARKET.md` and `METRICS_SUCCESS_CRITERIA.md`.

**Customers 1–10 (months 1–2): design partners.**
Recruited personally from the 15 interview-gate owners and their referrals. 50% off for 12 months, founder does the import concierge-style on a screen-share, weekly check-ins. Goal is not revenue — it's 3 permissioned proof stories, real-spreadsheet parser hardening (the skeptic's "stress-test the wedge on real data" instruction), and the first radar-hit-won-a-job anecdote.

**Customers 11–35 (months 2–5): the audit engine + societies.**
Public launch per `GO_TO_MARKET.md` days 31–60. Every audit → personal email → 15-min map walk → trial with concierge import. Founder closes every deal personally (`SALES_ONBOARDING_FLOW.md` demo script). Newsletter mentions in all 5 wave-1 states; first 2 booths. Watch metric: audit→trial ≥40%, else the audit output isn't compelling enough — fix the artifact before buying more reach.

**Customers 36–70 (months 5–9): repeatability + referral flywheel.**
Referral program live (give-a-month/get-a-month); status-link footers now on hundreds of client-facing pages; 2–3 more booths; first GNSS-dealer bounty deals; QBO App Store listing live. Founder still demos but onboarding is now self-serve-first with concierge as fallback. Watch metric: ≥25% of new trials citing a referral/status-link/word-of-mouth source — the compounding channels must be visible by now or the model is booth-dependent and caps out.

**Customers 71–100 (months 9–12+): second wave.**
Wave-2 PLSS states via the same society playbook; webinar-per-society cadence; the proof library (10+ real stories) carries conversion so founder time shifts toward product. Begin Texas/GLO scoping only if wave-1 retention is healthy (`METRICS_SUCCESS_CRITERIA.md` month-12 gate).

**Playbook-wide rules:**
- Every closed-lost gets a 5-question win/loss note (tool used today, price reaction, competitor evaluated, missing feature, would-they-audit-anyway).
- No customer counts as "acquired" until activated (`SALES_ONBOARDING_FLOW.md` §4) — a paying-but-empty account is churn on a delay.
- If months 1–4 close <15 customers total, trigger the slow-start review in `METRICS_SUCCESS_CRITERIA.md` rather than spending more on reach.

---

### Source notes
- SAM correction and competitor/SEO/lead-magnet landscape: round-3 skeptic verdicts, `research/revival-round3-results.json` (verified by adversarial review; URLs inline).
- Audit-as-lead-magnet design: skeptic improvement adopted verbatim from the same file.
- ARPA, penetration scenario, whiteboard-inertia risk, channel seeds: `business/FINAL_CONCEPT.md`.
- All conversion rates, churn, margin, spend, and volume figures in §2–§3 and §5 are **assumptions**, labeled as such, pending real cohort data.
