# Market Research Brief — Backsight

**Venture:** Backsight — job tracking + prior-work intelligence for small US land-surveying firms
**Date:** 2026-07-10
**Status:** Final. Reflects the full research record: 8-scout evidence scan → 12-candidate tournament → three adversarial skeptic rounds → winner selection.

---

## 1. Method

### 1.1 Evidence-first, ideas last

Before a single product idea was generated, eight research scouts ran **in parallel over eight mutually exclusive "hunting grounds"** chosen to span the three classic sources of software opportunity: underserved niches, newly created pain (regulation, AI), and incumbent failure (see `decisions/DECISION_LOG.md`, D-002):

| # | Hunting ground | Thesis |
|---|---|---|
| 1 | SMB trades | Owner-operator field businesses squeezed between spreadsheets and enterprise suites |
| 2 | Niche professions | Licensed/credentialed small firms ignored by horizontal SaaS |
| 3 | New 2024–26 regulations | Compliance obligations created by law faster than tooling |
| 4 | AI-era ops pain | New operational problems created by AI adoption itself |
| 5 | Creators / solopreneurs | One-person media businesses running revenue ops in spreadsheets |
| 6 | E-commerce sellers | Margin leaks and compliance burdens on small DTC brands |
| 7 | Devtools / B2B ops | Engineering-adjacent operational pain in small software companies |
| 8 | Hated incumbents | Categories where the dominant vendor is actively resented |

The scan returned **34 evidenced problems** (`research/raw-scan-full.json`).

### 1.2 Discipline rules enforced at research time

- **Citation discipline (D-004):** every problem carries structured evidence objects (`claim` + `source_url`); scouts were instructed never to invent sources. Claims were later spot-checked by adversarial skeptics with fresh web access, and several were flagged or refuted (Section 5).
- **Buildability filter (D-003):** no licensed professions, no gated APIs, no proprietary data, no hardware, no fragile scraping as core value — enforced as a hard filter on what scouts could return, then independently re-verified by implementability skeptics.

### 1.3 Tournament and adversarial review

Twelve of the 34 problems were shortlisted (D-006), merging two independent-scout convergences (COI tracking; per-client AI cost attribution). Three persona judges with deliberately conflicting priors (seed VC, bootstrapped indie hacker, pragmatic CTO) scored all 12 on eight criteria, weighted toward buildability and willingness to pay (D-007). The top four then faced **two independent skeptics each** (implementability and market), doing fresh web research including spot-checks of the original citations. When all four died (D-008), ranks 5–8 got the identical treatment (D-009). When those died too, the seven verified kill patterns were codified into a **kill taxonomy** and a final revival round ran four concepts engineered against it — from which Backsight emerged as the only concept of 12 whose market skeptic found **zero fatal flaws** (D-010).

---

## 2. The landscape: 34 problems across 8 grounds

A compressed tour of what the scan found, with representative citations. (Full evidence: `research/raw-scan-full.json`.)

### SMB trades (4 problems)
Maintenance-agreement tracking for small HVAC/plumbing shops (ServiceTitan at $250–$500/tech/mo with $5K–$50K implementation is the only "proper" fix — https://fieldcamp.ai/reviews/servicetitan/); COI collection for small GCs; backflow test-report filing (a 15-minute test drags ~30 minutes of per-city paperwork — https://flowcert.co/blog/how-to-become-certified-backflow-tester); quote-to-BEO workflow for independent caterers (~13,263 US catering businesses, no player over 5% share — https://www.ibisworld.com/united-states/industry/caterers/1682/).

### Niche professions (4 problems)
COI tracking for small property managers (myCOI starts ~$500+/mo, designed for 200+ certificates — https://trackmyvendor.com/mycoi-alternatives); carrier commission reconciliation for small insurance agencies (claimed $10K–$16K/yr leakage — https://unlockedcrm.ai/blog/insurance-commission-reconciliation-guide — later flagged as vendor marketing); interpreter-agency back-office; and **job-status/workflow tracking for small land surveying firms** — the eventual winner's root problem (see Section 4).

### New regulations (4 problems)
EAA/WCAG monitoring for SMB e-commerce (FTC hit accessiBe with a $1M penalty in April 2025 — verified by adversarial review, https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-approves-final-order-requiring-accessibe-pay-1-million); EU STR registration tracking (Regulation (EU) 2024/1028 applicable 20 May 2026 — https://eur-lex.europa.eu/EN/legal-content/summary/online-short-term-accommodation-rental-services-data-collection-and-sharing.html); US auto-renewal-law compliance (HelloFresh $7.5M consent judgment — verified by adversarial review, https://da.lacounty.gov/media/news/hellofresh-pay-75-million-deceptive-subscription-practices-consumer-protection-lawsuit); GPSR documentation for handmade sellers (https://help.etsy.com/hc/en-us/articles/28211364687383-What-is-the-General-Product-Safety-Regulation-GPSR).

### AI-era ops (5 problems)
EU AI Act Article 50 disclosure workflow (obligations from 2 August 2026 — https://artificialintelligenceact.eu/transparency-rules-article-50/); support-AI answer QA (Cursor's bot invented a nonexistent policy, causing viral backlash — https://fortune.com/article/customer-support-ai-cursor-went-rogue/); knowledge-base freshness auditing; shadow-AI governance for SMBs (https://www.ibm.com/think/topics/shadow-ai); per-client LLM cost attribution (documented runaway bills up to $1.3M in 30 days — https://www.kucoin.com/news/flash/ai-token-bills-explode-500m-1-3m-and-18k-in-one-night).

### Creators / solopreneurs (4 problems)
Brand-deal receivables chasing (30–90-day payment terms, still paid late — https://digiday.com/marketing/in-a-booming-influencer-economy-creators-seek-standardization-for-payment-terms/); sponsorship ops below Sponsy/Passionfroot pricing (https://www.sponsorflo.ai/blog/podcast-sponsorship-management-guide); usage-rights expiry tracking; affiliate link-rot monitoring for YouTubers (https://www.youfiliate.com/blog/broken-affiliate-links-costing-you-money).

### E-commerce sellers (4 problems)
Landed-cost/HTS calculators after the end of de minimis (https://www.unicargo.com/de-minimis-ended-2026-tariffs-guide-amazon-fba/); 3PL invoice auditing (dim-weight overcharges framed as the most common billing error — https://www.seleryfulfillment.com/the-hidden-3pl-fees/); GPSR listing compliance; flat-fee chargeback evidence automation (chargebacks projected at $33.79B in 2025 — https://www.chargeback.io/blog/chargeback-statistics).

### Devtools / B2B ops (4 problems)
API breaking-change radar; security-questionnaire answering for pre-SOC2 vendors (recurring founder complaint — https://news.ycombinator.com/item?id=36488436); EU Cyber Resilience Act readiness (reporting obligations from 11 September 2026 — https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act); per-customer AI cost metering (top 10% of users drive ~60% of AI costs — https://www.drivetrain.ai/post/unit-economics-of-ai-saas-companies-cfo-guide-for-managing-token-based-costs-and-margins).

### Hated incumbents (5 problems)
Wild Apricot refugees (20% Payment System Servicing Fee on orgs using outside payment processors — verified by adversarial review against Wild Apricot's own help center, https://support.wildapricot.com/hc/en-us/articles/24303136407821-Payment-System-Servicing-Fee); youth-sports orgs stranded by the SportsEngine→PlayMetrics consolidation (https://home.playmetrics.com/blog/playmetrics-acquires-sportsengine-versant); HOA treasurer tooling; pet-boarding software fleeing Gingr's rollup; day-camp registration priced out by CampMinder ($2,500–$10,000+ annual licenses — https://www.campnetwork.com/camp-registration-software-comparison).

---

## 3. The tournament: how 11 concepts died and 1 survived

### 3.1 Judge ranking (weighted average of 3 persona judges, 12 concepts)

| Rank | Concept | Score | Outcome |
|---|---|---|---|
| 1 | Chargeback evidence automation | 72.2 | Killed (round 1) |
| 2 | COI tracking | 68.5 | Killed (round 1) |
| 3 | 3PL invoice audit | 68.0 | Killed (round 1) |
| 4 | Commission reconciliation | 68.0 | Killed (round 1) |
| 5 | EAA accessibility monitor | 66.5 | Killed (round 2) |
| 6 | HVAC agreements | 65.0 | Killed (round 2) |
| 7 | Membership refuge (Wild Apricot) | 64.2 | Killed (round 2) |
| 8 | Auto-renewal compliance | 62.6 | Killed (round 2) |
| 9 | AI cost/margin attribution | 60.4 | Not escalated |
| 10 | Sponsorship ops | 60.3 | Not escalated |
| 11 | Backflow compliance | 55.8 | Not escalated |
| 12 | Affiliate link-rot | 55.3 | Not escalated |

### 3.2 Representative kill facts (all found by skeptics doing fresh web research)

- **Chargeback:** Stripe launched Smart Disputes (Nov–Dec 2025, enabled by default) doing the concept's core loop natively; ChargePay already sells flat-fee AI chargeback automation from $19.99/mo. The concept's foundational claim ("Stripe native forms are blank text boxes") was simply no longer true.
- **COI tracking:** TrustLayer Starter and bcs now give away free AI-parsing COI tiers to exactly the sub-200-certificate segment the concept claimed incumbents "structurally cannot serve."
- **3PL audit:** technically unsound wedge — billable dim weight comes from the 3PL's cubiscanned carton, not the merchant's SKU dimensions, so "recompute the correct charge" systematically produces false positives.
- **Commission recon:** zero-template AI parsing already commoditized (Fintary, unLocked with 332 carrier feeds); every one of the four cited evidence sources was content marketing by a vendor selling the same solution.
- **EAA monitor:** AudioEye sells self-serve continuous monitoring with statement generation at $49/mo — the exact price point the concept claimed honest players ignored.
- **HVAC agreements:** the standalone architecture contradicted its own wedge; Jobber Core already auto-schedules recurring visits (verified by adversarial review, https://help.getjobber.com/hc/en-us/articles/360048155913-The-Core-Plan); the anchor statistic traced to a programmatic-SEO content farm.
- **Membership refuge:** MemberDay is a near-clone at $29/mo; Zeffy is free; the "Wild Apricot alternative" SERP is saturated by funded players.
- **Auto-renewal compliance:** the recurring deliverable is legal judgment applied to a merchant's specific flows (unauthorized-practice-of-law exposure), and Recharge already sends the mandated reminders natively. The underlying legal facts were confirmed (California AB 2863 effective July 1, 2025 — verified by adversarial review, https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025; FTC rulemaking restarted January 2026 — https://www.gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/) — the pain was real; the product was undeliverable by a non-law-firm.

### 3.3 The kill taxonomy and the revival round

Eight autopsies yielded seven verified kill patterns (D-009): platform-native substitutes; free-tier floors from funded players; technically unsound wedges; vendor-content-marketing evidence; regulated deliverables; saturated panic-SEO distribution; structural churn. Round 3 ran four concepts engineered against that taxonomy:

| Round-3 concept | Verdict | Killing fact |
|---|---|---|
| Registry Radar (EU STR compliance) | Killed | Conforme.info already ships the identical "regulatory system of record" positioning (verified by adversarial review, https://conforme.info/); Spain's Supreme Court annulled the national registry, judgment 620/2026 of 21 May 2026 (https://skift.com/2026/05/22/spains-top-court-voids-national-short-term-rental-registry/); the launch markets' registrations mostly have **no renewal deadlines** — the retention engine tracked obligations that don't exist |
| TerpDesk (interpreter agencies) | Killed — the tournament's only outright "kill" verdict | The "empty $50–200/mo gap" is occupied by at least five purpose-built incumbents, e.g. Eclipse Scheduling from ~$125/mo all-inclusive (verified by adversarial review, https://interpreterscheduling.com/pricing/); HIPAA business-associate status for medical interpreting was never addressed; the pricing evidence traced to AI-generated listicle farms (Gitnux/ZipDo) |
| PlanPatrol (HVAC radar pivot) | Killed | Weekly manual CSV upload is a structural churn engine; Jobber/Housecall Pro already sync with QuickBooks Online, dissolving the "two systems no vendor will reconcile" premise |
| **Backsight (surveyors)** | **Winner — survives with fixes** | Market skeptic: "seriously weakened" but **zero fatal flaws** — the only concept of 12 with none; implementability skeptic: "survives with fixes," all engineering-addressable |

---

## 4. Market context: small US land-surveying firms

The winning segment. All figures below are either skeptic-verified or explicitly labeled as estimates.

### 4.1 Establishment counts (skeptic-corrected)

- The original scout claimed "~25,000+ small surveying establishments." **Refuted.** Census County Business Patterns data for NAICS 541370 (Surveying and Mapping, except Geophysical) shows **~7,000 firms / ~7,382 establishments** (2020 CBP), with a second directory source showing ~6,191 active companies (verified by adversarial review, https://siccode.com/naics-code/541370/surveying-mapping). The 25,000 figure appears to conflate establishments with licensed individual surveyors.
- Serviceable market after segmenting to 1–5-crew firms in PLSS states (the wedge does not cover Texas or the colonial metes-and-bounds states — verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system): plausibly **2,000–4,000 firms** (skeptic estimate).
- Honest revenue ceiling (estimate, per `business/FINAL_CONCEPT.md`): 5% penetration of ~7,000 establishments at ~$140/mo average ≈ **~$590K ARR** — a strong bootstrapped outcome, honestly not a venture-scale one.

### 4.2 Firm profile and tech spend

- Target firm: 1–5 field crews, 3–25 staff, $300K–$5M revenue (estimate from concept research), running 20–80 concurrent jobs (boundary, ALTA, topo) at $500–$5,000 each.
- These are licensed professional firms that already spend heavily on technical tooling — the scout noted GNSS receivers run $10–30K (scout estimate; adjacent software price anchors cited were Jobber at ~$40–200/mo and BQE Core at ~$25–50/user/mo) — while business-operations software for the vertical barely exists (scout framing via https://myquoteiq.com/top-8-softwares-for-land-surveying-businesses-in-2026/, itself flagged as a vendor listicle; see 5.2).

### 4.3 Buyer behavior (adversarial-review findings)

The market skeptic's fresh research materially reshaped the demand picture:

- **The vertical is occupied but fragmented.** At least six vertical practice-management products exist: Qfactor (founded 2016), KudurruStone, Cyanic Job Book, Info-Retriever by AGT, CQ, and SurveyOps (verified by adversarial review; SurveyOps confirmed at https://survey-ops.com/land-surveying-job-management-software). "No dominant player" is true; "no vertical solution" is false. All incumbents have near-zero review footprints — which is simultaneously evidence of a real gap and of a hard-to-reach buyer.
- **Whiteboard inertia is real and documented.** On the RPLS.com practice-management forum threads found by the skeptic, one surveyor abandoned KudurruStone (a purpose-built vertical tool) as "too slow," while others run their firms on ClickUp at ~$3/user/mo. A decade-old vertical vendor (Qfactor) remaining obscure suggests slow sales cycles and a buyer who satisfices on cheap generic tools.
- **Pricing reality check.** KudurruStone charges per-user by role (a 10-person firm ≈ $100/mo per the skeptic's review of its site) — below Backsight's original anchoring against BQE Core. This drove the post-skeptic flat-pricing reposition ($79/$149/$249 per firm).
- **The "free S-T-R lookup" lead magnet is a saturated space:** randymajors.org, Earth Point (verified by adversarial review, https://www.earthpoint.us/Townships.aspx), MapScaping, and BLM's own viewers are the tools surveyors already bookmark. Distribution must run instead through state societies under NSPS, r/Surveying, RPLS forums, surveying podcasts, and GNSS-dealer partnerships.

### 4.4 Implementability facts (skeptic-verified)

- **BLM PLSS CadNSDI data is genuinely public-domain and bulk-downloadable** — township/range/section polygons, no API key, no license fee (verified by adversarial review, https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons).
- **QuickBooks Online invoice push is a public OAuth API** with a fast, form-based production gate (verified by adversarial review, https://help.developer.intuit.com/s/article/New-app-assessment-process-FAQ).
- **The only mature open-source legal-description parser, pyTRS, prohibits all commercial use** under a Modified Academic Public License (verified by adversarial review, https://github.com/JamesPImes/pyTRS). Backsight ships its own license-clean parser.
- Township America operates a free Township/Range lookup and a commercial PLSS geocoding API — proof the technical approach works, and a buy-vs-build option (verified by adversarial review, https://townshipamerica.com/).

---

## 5. What survived adversarial review, and what died

### 5.1 Survived

1. **The pain itself.** Whiteboard-plus-email job tracking, status-call interruptions, delayed invoices, and prior-work amnesia are corroborated by the existence of six independent vertical vendors betting on the same problem — the strongest form of demand evidence the review produced.
2. **The buildability thesis.** Every required dataset and API is public and credential-free (BLM CadNSDI, US Census Geocoder, QBO OAuth); nothing in the core loop depends on scraping; no regulatory regime touches a job-tracking vendor (skeptic verified by absence, moderate confidence).
3. **Market fragmentation with no free-tier floor.** No VC-funded free tier exists in this vertical; competitors are paid micro-vendors — the exact opposite of the pattern that killed COI tracking and chargeback automation.
4. **The residual wedge.** No incumbent leads with automated parsing/spatial indexing of a firm's messy **historical** job spreadsheet — they map jobs going forward or require manual entry. Prior-work monetization at import time, plus flat non-per-seat pricing, is the defensible remainder.

### 5.2 Died or was corrected

1. **TAM: ~25,000 → ~7,000 establishments** (Section 4.1). All downstream economics were recomputed on the honest number.
2. **"No vertical solution exists" → false.** Six vertical products named; competitive framing rebuilt to acknowledge all of them (`business/FINAL_CONCEPT.md`, fix #4).
3. **Wedge uniqueness overclaimed.** Qfactor's Map View shows past-project locations; Cyanic Job Book offers legal-address search; SurveyOps markets S-T-R job organization on the very page the scout cited as gap evidence. Differentiation narrowed to historical-archive ingestion depth + client status links + flat pricing.
4. **All three original scout citations flagged as vendor content marketing** (CQ's blog, SurveyOps' landing page, QuoteIQ's listicle). They establish that vendors believe in the pain, not independent demand volume — a gap that only customer interviews can close (see `research/PROBLEM_VALIDATION.md`).
5. **pyTRS assumed usable → refuted** (license prohibits commercial use); build timeline re-planned from 6–8 weeks to 12–16 weeks for a sellable v1.
6. **Lead-magnet plan (free S-T-R map) dropped** — slot occupied by randymajors.org / Earth Point / MapScaping.
7. **Principal-meridian ambiguity and address-only spreadsheets** — two silent-failure modes the concept had not modeled — became mandatory product fixes (state→meridian resolution table; address-first geocoding via the free US Census Geocoder).

### 5.3 Why this winner, despite modest economics

Backsight's surviving risks are **execution risks** (micro-vendor competition, TAM ceiling, whiteboard inertia) rather than **structural falsehoods** (free-tier floors, platform-native substitutes, evidence built on SEO farms) — the trade the selection process was explicitly designed to make (D-010). It is also the strongest fit for the buildability constraint: the wedge (parse → geocode → spatial join → radar UI) is deterministic, demonstrable offline with sample data, and involves zero gated access, zero licensing exposure, and zero regulated deliverables.

---

*Companion documents: `research/PROBLEM_VALIDATION.md` (problem deep-dive and interview plan), `business/CUSTOMER_PERSONA.md` (buyer and user personas), `business/FINAL_CONCEPT.md` (authoritative product direction), `decisions/DECISION_LOG.md` (full decision record).*
