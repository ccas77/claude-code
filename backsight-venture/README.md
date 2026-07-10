# Backsight — Venture Package

> **Job tracking built for land-surveying firms** — a pipeline that speaks surveying (fieldwork → drafting → licensed review → delivery), a client status link that kills "where's my survey?" calls, and a prior-work archive searchable by location, so every new request instantly shows what the firm already knows about that ground.

This folder is a complete, self-contained SaaS venture package: evidence-based market research, an adversarially tested business case, a full go-to-market plan, and a runnable local MVP. It was produced end-to-end by a multi-agent research and build process on 2026-07-10; every factual claim traces to a cited source, and every major decision is logged.

## Executive summary

**The problem.** Small US land-surveying firms (1–5 field crews, 3–25 staff, $300K–$5M revenue) run 20–80 concurrent jobs across a whiteboard, a spreadsheet, and the owner's memory. Two costs follow: (1) *status chaos* — title companies and builders call the owner for updates, and jobs silently stall between field, drafting, and licensed review; (2) *prior-work amnesia* — the firm's most valuable asset, what it already knows about ground it surveyed before (control, prior boundary resolutions, plats), lives in the owner's head and paper files, so quoting ignores it and retirements erase it.

**The product.** Backsight is a vertical SaaS with three parts: a surveying-native job pipeline, a public tokenized client status page (the "pizza tracker" a title company refreshes instead of calling), and the wedge — **Prior-Work Radar**: import the firm's historical job list and every job is indexed spatially (address geocoding first; Section-Township-Range parsing where available). Every new request instantly surfaces prior jobs on or near that parcel: *"You have 3 prior jobs in this section — quote in minutes, win it on price, deliver at half the field time."*

**Why this won.** 8 parallel research scouts surfaced 34 evidenced problems across 8 hunting grounds; 12 became sharpened concepts scored by a 3-persona judge panel; the top candidates then faced dual adversarial skeptics doing fresh web research. The skeptics **killed 11 of 12 concepts** on verified structural defects (platform-native substitutes, free-tier floors from funded competitors, technically unsound wedges, evidence tracing to SEO farms, regulated deliverables). Backsight was the only concept whose market skeptic found **zero fatal flaws** — its objections were engineering-fixable and are incorporated into the PRD. The full autopsy record is in [`research/ADVERSARIAL_REVIEW.md`](research/ADVERSARIAL_REVIEW.md).

**The market, honestly.** ~7,000 US surveying/mapping establishments (NAICS 541370, skeptic-corrected from an initial 25,000 estimate), mostly small firms; competitors are paid micro-vendors (Qfactor, SurveyOps, KudurruStone, Cyanic Job Book) with dated UX, per-user pricing, and no free tier — a fragmented category with no dominant, well-loved incumbent and no VC free-floor. At 5% penetration and ~$140/mo flat pricing, Backsight is a ~$590K-ARR bootstrapped business with adjacent-vertical expansion paths (septic design, forestry, geotech). This is deliberately an indie-scale, evidence-defensible opportunity rather than a venture-scale story with fatal flaws.

**Pricing.** Flat per-firm (anti add-on-creep, anti per-user): $79/mo (≤5 users), $149/mo (≤15), $249/mo (unlimited). Rationale and competitor anchoring: [`business/PRICING_STRATEGY.md`](business/PRICING_STRATEGY.md).

**Distribution.** State survey societies and NSPS chapters, r/Surveying, conference booths measured in hundreds of dollars, a free "Prior-Work Audit" lead magnet, and a built-in referral loop: every client status link puts Backsight in front of title companies and builders who deal with many surveying firms.

**Status.** Local MVP in [`product/app/`](product/app/) (Next.js + SQLite + Leaflet; `npm install && npm run seed && npm run dev`). Real: pipeline, radar with license-clean PLSS parser, client status pages, dashboards, seeded realistic data. Mocked and documented: auth, email (outbox), live geocoding, billing.

## Folder guide

| Path | Contents |
|---|---|
| `research/MARKET_RESEARCH_BRIEF.md` | Research method, all 8 hunting grounds, 34 problems, market context, citations |
| `research/PROBLEM_VALIDATION.md` | The surveyor pain: evidence chain, skeptic corrections, open interview questions |
| `research/COMPETITOR_ANALYSIS.md` | Verified competitor table incl. all 6 vertical micro-vendors |
| `research/GAP_ANALYSIS.md` | The residual gap Backsight occupies; claims labeled VERIFIED vs HYPOTHESIS |
| `research/TOURNAMENT.md` | 12-candidate tournament, judge panel, weighted scores, full ranking |
| `research/ADVERSARIAL_REVIEW.md` | All 3 skeptic rounds, fatal flaws, evidence checks, the 7-pattern kill taxonomy |
| `research/*.json` | Raw structured outputs of every research/judging/skeptic agent run |
| `business/FINAL_CONCEPT.md` | The selected concept with post-skeptic fixes (authoritative) |
| `business/CUSTOMER_PERSONA.md` | Buyer + daily-user personas with evidence traceability |
| `business/PRICING_STRATEGY.md`, `GO_TO_MARKET.md`, `CUSTOMER_ACQUISITION.md`, `SALES_ONBOARDING_FLOW.md`, `METRICS_SUCCESS_CRITERIA.md`, `RISK_REGISTER.md`, `LANDING_PAGE_COPY.md` | The full commercial plan |
| `product/PRD.md`, `MVP_SCOPE.md`, `TECH_ARCHITECTURE.md` | Product requirements, scope boundaries, architecture |
| `product/CLAUDE_CODE_IMPLEMENTATION_PLAN.md` | How a non-specialist continues building with Claude Code |
| `product/MVP_BUILD_SPEC.md` | The spec the MVP was built against |
| `product/app/` | **The runnable MVP** — see its README for the 3-command quickstart and demo script |
| `decisions/DECISION_LOG.md` | Every executive decision (D-001…) with reasoning |

## Run the demo

```bash
cd product/app
npm install
npm run seed
npm run dev   # open http://localhost:3000
```

The landing page is at `/`, the product at `/app`, and a public client status page at `/status/<token>` (links are on each job). The seeded firm is "Whitfield Land Surveying" of Fort Collins, CO, with ~85 jobs from 2019–2026. Follow the 7-step demo script in `product/app/README.md` — step 4 (Prior-Work Radar search) is the aha moment.

## What a stranger should take away

1. The pain is real and evidenced — and the parts of the original evidence that didn't survive verification are flagged, not hidden.
2. The category is buyable (firms already pay micro-vendors) but not owned; the wedge (prior-work monetization) is technically sound and demonstrated in the MVP.
3. The business is continuable by a non-specialist: no gated APIs, no licensing, no proprietary data; the implementation plan gives milestone-by-milestone Claude Code prompts.
4. The biggest risks are honest ones — TAM ceiling, incumbent response, archive-import quality — and each has a mitigation and an early-warning signal in the risk register.
