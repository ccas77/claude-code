# Final Selected Concept: Backsight

> **One-liner:** Job tracking built for land-surveying firms — a pipeline that speaks surveying (fieldwork → drafting → licensed review → delivery), a client status link that kills "where's my survey?" calls, and a prior-work archive searchable by location so every new request instantly shows what the firm already knows about that ground.

*(The term "backsight" is a surveying fundamental: the sighting a surveyor takes back to a known point to orient every new measurement — exactly what this product does with a firm's past jobs. Working title; trademark/name-collision check required before launch.)*

## Why this concept won (tournament summary)

Backsight was the **only concept out of 12** across three adversarial rounds whose market skeptic found **zero fatal flaws**. Every other finalist died on a verified structural defect:

| Round | Concept | Fate | Killing fact (verified by skeptic web research) |
|---|---|---|---|
| 1 | Chargeback evidence automation | killed | Stripe Smart Disputes (Nov 2025, default-on) + Shopify native + ChargePay at $19.99/mo |
| 1 | COI tracking | killed | TrustLayer Starter & bcs give AI COI tracking away **free** at the low end |
| 1 | 3PL invoice audit | killed | Wedge technically unsound: carriers bill from cubiscanned cartons, not SKU dims |
| 1 | Commission reconciliation | killed | AI parsing commoditized (Fintary $199/mo, unLocked 332 feeds); evidence = vendor blogs |
| 2 | EAA accessibility monitor | killed | Eye-Able/AudioEye ship scan+statement at $49/mo; first EAA rulings went to defendants |
| 2 | HVAC agreements (standalone) | killed | Standalone architecture contradicts wedge; Jobber Core auto-schedules recurring visits |
| 2 | Membership refuge | killed | MemberDay is a $29/mo near-clone; Zeffy is free; SERPs saturated |
| 2 | Auto-renewal compliance | killed | Deliverable is legal judgment (FTC v. DoNotPay exposure); Recharge sends mandated reminders natively |
| 3 | Registry Radar (EU STR) | killed | Conforme.info ships identical positioning; Spain's Supreme Court annulled the NRUA registry 21 May 2026; launch markets have no renewal deadlines to track |
| 3 | TerpDesk (interpreter agencies) | **killed** (hardest verdict of the tournament) | Five purpose-built incumbents in the "empty" $50–200 gap; HIPAA business-associate status unmentioned |
| 3 | PlanPatrol (HVAC radar pivot) | killed | Weekly manual CSV upload is a structural churn engine; QBO sync already reconciles the two systems |
| 3 | **Backsight (surveyors)** | **WINNER — survives with fixes** | Market skeptic found competitors but **no fatal flaw**; implementability skeptic's objections are all engineering-addressable |

## The concept (post-skeptic, fixes incorporated)

**Customer:** Owner/licensed surveyor of a US firm with 1–5 field crews and 3–25 staff ($300K–$5M revenue), running 20–80 concurrent jobs (boundary, ALTA, topo at $500–$5,000 each) on a whiteboard plus email and a spreadsheet. The owner personally fields status calls from title companies and builders, and personally remembers "we shot that section in 2019."

**Painful workflow:**
1. **Job-status chaos** — field crews, drafting, and licensed review live in different tools (or none); title companies and builders call the owner for status; deadlines slip silently between stages.
2. **Prior-work amnesia** — the firm's most valuable asset is what it already knows about ground it has surveyed before (control points, prior boundary resolutions, plats). That knowledge lives in the owner's head and a shelf of file folders. When a request comes in for a parcel the firm surveyed in 2019, quoting should take minutes and the job should be cheaper than any competitor's — but only if anyone remembers.

**Wedge feature — Prior-Work Radar:** import the firm's historical job list (CSV), and Backsight indexes every job spatially — by address geocode and, where available, by Section-Township-Range parsed with our own (license-clean) PLSS parser against public-domain BLM PLSS data. Every new request instantly shows prior jobs on and around that parcel: *"You have 3 prior jobs in this section — quote with confidence, win it on price, deliver it at half the field time."*

**Retention features:** the surveying-native pipeline board (Request → Quote → Scheduled → Fieldwork → Drafting → Licensed Review → Delivered → Invoiced) and the tokenized read-only **client status link** that eliminates "where's my survey?" calls.

**Pricing (post-skeptic reposition):** flat per-firm, not per-user — $79/mo (up to 5 users), $149/mo (up to 15), $249/mo (unlimited) — deliberately flat against KudurruStone's per-user/role pricing so the math wins at team size, and far under Qfactor/SurveyOps annual contracts. Flat pricing is also the anti-add-on-creep message this buyer segment (per the SMB research) demonstrably resents.

**Honest market sizing (post-skeptic):** ~7,000 US establishments in NAICS 541370 (Census County Business Patterns; the skeptic corrected the scout's 25,000 figure), of which the 3–25-staff segment is the majority. At 5% penetration × ~$140/mo average → ~$590K ARR: a strong bootstrapped outcome, honestly not a venture-scale one. Adjacent expansion: septic designers, foresters, geotechnical field firms share the field→office→licensed-review shape.

**Mandatory fixes from the skeptics (all incorporated into the PRD):**
1. **No pyTRS** — its Modified Academic Public License prohibits commercial use. We ship our own regex-based S-T-R parser (it's a constrained grammar; public-domain BLM PLSS CadNSDI shapefiles provide the spatial join).
2. **Principal-meridian ambiguity** — "T2N R3W Sec 14" repeats across principal meridians; we resolve with a state→default-meridian table, flag ambiguity, and always prefer geocoded address when present.
3. **Address-first ingestion** — many firm spreadsheets have client + street address only; geocoding (US Census Geocoder, free, no key) is the primary spatial index; S-T-R parsing is enrichment, not a requirement.
4. **Honest competitive framing** — Qfactor, SurveyOps, KudurruStone, Cyanic Job Book et al. exist and are named in the competitor analysis; differentiation is the prior-work-monetization wedge + client status links + modern UX + flat pricing, not "no competition exists."

**Why it dodges the kill taxonomy:**
1. *Platform-native substitute:* none — there is no platform in this workflow to subsume it.
2. *Free-tier floor:* none found by adversarial search; competitors are paid micro-vendors.
3. *Technically sound wedge:* parsing + geocoding + spatial join is deterministic and fully demonstrable locally with sample data.
4. *Primary-source evidence:* buyer economics verified against public pricing pages and Census establishment counts; no vendor-blog statistics load-bearing.
5. *Regulated deliverables:* none — no legal language generation, no SMS, no payments migration. (The licensed review stage is the customer's professional duty; Backsight only tracks it.)
6. *Saturated SEO:* the micro-vendor category has thin content; distribution runs through state survey societies, NSPS chapters, r/Surveying (~100k+ members), and conference booths measured in hundreds of dollars.
7. *Structural churn:* jobs keep flowing; the archive gets more valuable every month (the moat compounds); firms rarely "graduate" out of the segment.
