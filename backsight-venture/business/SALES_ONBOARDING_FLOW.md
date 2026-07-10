# Backsight — Sales & Onboarding Flow

**Date:** 2026-07-10 · Covers: self-serve trial, the 10-minute aha, onboarding checklist, activation definition, expansion triggers, and the founder-led motion for the first 50 customers.

Design constraints inherited from research: the buyer is a field professional with whiteboard inertia (`FINAL_CONCEPT.md` risk), a purpose-built competitor was abandoned as *"too slow"* by an RPLS forum user (verified by adversarial review, `research/revival-round3-results.json`) — so every step below is optimized for speed-to-value — and import must assume legal descriptions are absent (skeptic fix: address-first, per `FINAL_CONCEPT.md` fix #3).

---

## 1. Self-serve trial flow

```
Landing page ─┬─> "Start 14-day trial" ──────────────┐
              └─> "Free Prior-Work Audit" ─> audit ──┤ (audit account converts in place;
                                                     ▼  imported data carries over)
                                    Create account (email + firm name + state)
                                                     ▼
                                    Seeded demo firm loads INSTANTLY
                                    (Whitfield Land Surveying, ~85 jobs, per MVP spec)
                                                     ▼
                                    Guided 3-stop tour (≤3 min):
                                    ① radar search that hits ② pipeline board ③ a live status page
                                                     ▼
                                    "Now do it with YOUR jobs" → CSV import wizard
                                                     ▼
                                    Coverage map + first radar search on own data
                                                     ▼
                                    Day-14: pick a tier (card required only here)
```

Rules:
- **No credit card to start; card only at conversion.** No feature gates inside the trial (trial = Practice-tier capabilities).
- **The demo firm is pre-seeded, never empty.** An empty state kills field-professional patience; the seeded firm (per `product/MVP_BUILD_SPEC.md`) has deliberate hooks — a request-stage job with 3 prior jobs in the same section, overdue jobs, a stuck-in-review job, unbilled delivered work — so every screen makes its point immediately.
- **Demo data is clearly labeled and one-click removable** once real data is in.
- Trial extension: one no-questions 7-day extension self-serve (owners disappear into fieldwork weeks; punishing that is churn).

## 2. The 10-minute aha

The aha is scripted as three beats, in order — seeded proof, own data, own radar hit:

| Minute | Beat | What the user sees |
|---|---|---|
| 0–3 | **Seeded radar hit.** Tour opens on the Radar page with a pre-wired example search ("try these" row, per MVP spec). | An incoming request pinned in a section with 3 prior jobs highlighted — years, types, original fees. The concept lands: *the archive quotes the job.* |
| 3–8 | **Import own CSV.** Wizard: upload → column-map (saved templates for common layouts) → geocode/parse progress → review queue for unplaced rows (pin or skip). | Their own firm's coverage map materializing. This is the emotional peak — owners recognize thirty years of work appearing on one map. |
| 8–10 | **Radar on own ground.** Prompt: "Type the address or section of the last request you quoted." | Either a hit (**the aha**: "we've been there before — and now the software knows it") or a clean miss with adjacent-work shown (still credible; prompts a second search). |

Instrumentation: time-to-import-complete, % rows auto-placed, first-own-radar-search rate, and hit rate on first search are the four numbers reviewed weekly (feeds `METRICS_SUCCESS_CRITERIA.md`). If median time-to-own-coverage-map exceeds 10 minutes, that's a product bug, not a marketing problem.

## 3. Onboarding checklist (in-app, 7 items)

Shown as a progress card on the dashboard until complete; each item deep-links to the action.

1. ☐ Import your job history (or finish the audit import) — *target: ≥50 jobs in*
2. ☐ Resolve the import review queue (pin or skip every unplaced row)
3. ☐ Run a radar search on real ground you're quoting
4. ☐ Put your active jobs on the pipeline board (importer flags likely-active rows)
5. ☐ Share one client status link (email it to yourself first if you like)
6. ☐ Invite your office manager / a crew chief
7. ☐ Turn on the weekly stuck-jobs digest (on by default; confirm recipients)

Concierge overlay (first 50 customers): the founder does items 1–2 *with* the customer on a 30-minute screen-share — see §6. Post-50, a "book a free import session" link remains but self-serve is the default path.

## 4. Activation definition

A trial firm is **activated** when, within 14 days of signup:

1. **≥50 historical jobs imported** and ≥60% spatially placed (auto or manual), AND
2. **≥1 radar search run on the firm's own data** by a firm user (not the founder), AND
3. **≥5 active jobs being tracked** with ≥3 stage advancements performed, AND
4. **≥1 client status link shared externally** (link opened by a non-firm viewer).

Rationale: (1) is the archive moat being seeded, (2) is the wedge experienced, (3) is the daily-use habit, (4) is the retention feature reaching the client side and priming the referral loop. All four are measurable in-product. Firms with fewer than 50 historical jobs (young firms) activate on 25 imported + the other three criteria.

**Activation is the unit of acquisition** (`CUSTOMER_ACQUISITION.md` §5): a paying, non-activated firm is treated as at-risk from day one.

## 5. Expansion triggers (instrumented, human-followed-up)

| Trigger (automatic detection) | Action |
|---|---|
| Solo firm adds 5th user or invite #6 bounces off the cap | In-app: "Firm tier removes the cap — crews never count extra"; founder email if design partner |
| Firm marks jobs `delivered` but no invoice within 7 days, repeatedly | Surface QBO push (Firm tier) — "delivered-but-uninvoiced" is the dollar-denominated upgrade story |
| Status links opened >50 times/month by external viewers | Practice-tier prompt: client-branded status pages ("your title companies are already watching — put your logo on it") |
| Monthly subscriber passes month 4 with healthy usage | Annual offer (2 months free) — churn insulation, per `PRICING_STRATEGY.md` P3 test |
| Firm's radar hit converts to a job (user marks "won — prior work used") | Ask for the story (proof library) + referral nudge (give-a-month/get-a-month) |
| Usage drops to zero for 14 days (any tier) | Counter-expansion: personal "did fieldwork season eat you?" email — retention save, not upsell |

## 6. Founder-led sales motion — first 50 customers

**Posture:** the founder is a researcher who built the tool the research demanded, not a rep. Every demo doubles as a validation interview (win/loss questions logged per `CUSTOMER_ACQUISITION.md` §5).

**Cadence:** every completed Prior-Work Audit or demo request → personal email within 24h offering a 15-minute call → 30-minute concierge import session for trials → day-7 check-in → day-13 conversion call. Max ~10 concurrent trials in concierge mode (founder capacity — assumption).

### Demo script (15–20 minutes, screen-share)

**[0–2 min] Open with their world, not the product.**
> "Before I show anything — how do you track jobs today, and who fields the 'where's my survey?' calls?"
(Log answers verbatim. If they say the whiteboard works fine and they're 2 people with one crew, say so honestly: "You might not need us yet — run the free audit anyway and keep the map." That honesty is the brand, and this market talks.)

**[2–6 min] Seeded radar hit.**
> "This is a demo firm in Fort Collins. A request just came in on this parcel — watch." *(Run the wired search: 3 prior jobs light up in the section.)* "Three prior jobs on that ground: control likely set, boundary already resolved once, research paid for. You'd quote this in minutes and could win it on price because your cost is genuinely lower. That's the whole idea: your firm already knows things — this makes the knowing searchable."

**[6–10 min] Their data, live.**
> "Send me the spreadsheet you already keep — whatever columns it has. No legal descriptions needed; addresses are enough, and anything we can't place we pin by hand together."
*(Import live if they brought a file — the coverage map appearing is the close. If not, book the 30-min import session before ending the call.)*

**[10–13 min] Pipeline + status link.**
> "Day to day it's this board — your actual stages, fieldwork through licensed review. Crews advance jobs from a phone browser; nobody counts against your license. And every job gets this —" *(open a status page)* "— a read-only link your title company bookmarks instead of calling you. The footer says 'Tracked with Backsight,' which is how your clients' other surveyors find us — fair warning."

**[13–15 min] Price, straight.**
> "Flat per firm: $79, $149, or $249 by team size — the price is on the website, it doesn't move, there are no add-ons, and your full data exports any time. For your size that's the $X tier. One radar-assisted win or one caught uninvoiced job covers a year. Fourteen-day trial, no card — worst case you keep the coverage map. Want me to import your history this week?"

**Objection handling (from verified research):**
- *"We use ClickUp / a spreadsheet and it's fine"* (verified real behavior, RPLS forum) → "It is fine — for tracking. It can't search your archive by ground. Run the audit; if the map doesn't show you money, don't buy."
- *"How are you different from SurveyOps / KudurruStone?"* → Name them respectfully (never claim they don't exist — skeptic-mandated): "They track jobs going forward. We also import your history and make it quotable, and we price flat per firm instead of per user." (Comparison one-pager only after manual competitor demos — `GO_TO_MARKET.md` day-1 task.)
- *"We're in Texas / no PLSS here"* → Honest answer per landing FAQ 3: address/subdivision/pin search works; section search doesn't; "you're wave 3, and I'll tell you when that's real rather than sell you a weak version now."
- *"What if you disappear?"* → Full self-serve export on every tier + documented offsite backups (skeptic-mandated, `research/revival-round3-results.json` improvements).

**Exit criteria for founder-led mode (at ~customer 50):** proof library ≥10 permissioned stories, self-serve activation ≥50% without concierge, demo script converted into a 6-minute recorded walkthrough, import wizard handles the 10 most common spreadsheet layouts unassisted. Founder time then rebalances toward product and the wave-2 society circuit (`GO_TO_MARKET.md`).

---

### Source notes
- Seeded-demo contents and hooks: `product/MVP_BUILD_SPEC.md`.
- Address-first import, meridian-ambiguity confirmation UX, export/backup promises: skeptic-mandated fixes in `FINAL_CONCEPT.md` and `research/revival-round3-results.json`.
- "Too slow"/ClickUp objection evidence and never-claim-no-competitors rule: round-3 market skeptic (verified by adversarial review; rpls.com blocked automated fetch, per skeptic notes).
- All conversion cadences, capacity numbers, and thresholds are **assumptions** pending live data.
