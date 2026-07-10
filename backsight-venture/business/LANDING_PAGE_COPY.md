# Backsight — Landing Page Copy

> Voice guide for whoever implements this: plainspoken, technically respectful, zero hype. The reader is a licensed professional (PLS) who has been sold bad software before and distrusts adjectives. Every claim on the page must be one the product can demonstrate in the first ten minutes of a trial. No exclamation points anywhere on the page.

---

## Meta

- **Meta title (58 chars):** `Backsight — Job Tracking & Prior-Work Search for Surveyors`
- **Meta description (152 chars):** `Job tracking built for land surveying firms. A pipeline that speaks surveying, a client status link, and a searchable map of every job you've ever done.`

---

## Hero

**Headline:**

> ## Your firm has surveyed this ground before. Backsight remembers.

**Subhead:**

> Job tracking built for land surveying firms — a pipeline that runs fieldwork → drafting → licensed review → delivery, a status link that ends "where's my survey?" calls, and a searchable map of every job your firm has ever done.

**Primary CTA button:** `Start a 14-day trial` (no credit card required)
**Secondary CTA link:** `Or run the free Prior-Work Audit — import your job list, see your coverage map`

**Hero visual:** screenshot of the Prior-Work Radar map — an incoming request pinned in a section, three prior jobs highlighted in the same section, dated 2019, 2021, 2024.

**Trust line under CTA:** `Flat per-firm pricing. Field crews never count against your license. Your data exports any time, in full.`

---

## Pain Section 1 — The whiteboard doesn't scale past the parking lot

**Header:** Twenty-eight jobs, four crews, one whiteboard.

Every job in your shop moves through the same stages: request, quote, fieldwork, drafting, licensed review, delivery, invoice. But the whiteboard shows one word per job, the details live in email, and the due dates live in somebody's head. Nothing tells you a plat has been sitting in review for eleven days, or that three delivered jobs were never invoiced.

Backsight is a pipeline board with surveying's actual stages — not "lead / proposal / won" renamed. Advance a job from your desk or a crew's phone browser. A weekly stuck-jobs email flags anything idle too long at any stage, delivered-but-uninvoiced first.

**Section CTA:** `See the pipeline →`

## Pain Section 2 — You are the status hotline

**Header:** Title companies don't need to call you. They need a link.

Every closing that's waiting on your survey generates a phone call, and the person who answers it is usually the licensed surveyor whose time bills highest. Multiply by every active job.

Every Backsight job gets a tokenized, read-only status page — no login, no app, no texting. The title company, builder, or attorney bookmarks it and watches the progress bar move: scheduled, fieldwork complete, in drafting, under review, delivered. When the stage changes, they see it before they think to call.

**Section CTA:** `See a live client status page →`

## Pain Section 3 — Your most valuable asset is a memory

**Header:** "We shot that section in 2019" shouldn't depend on who's in the office.

The most valuable thing your firm owns isn't the GNSS gear — it's what you already know about ground you've surveyed before: control you set, corners you found, boundary resolutions you already worked out, plats already drafted. Today that asset lives in one person's memory and a shelf of folders. When that person is in the field, or retires, the asset is unreadable.

Backsight turns your job history into an index you can search by location — so the knowledge outlives the whiteboard and the memory.

---

## Wedge Feature Story — Prior-Work Radar

**Header:** Import your job list. Backsight maps everything your firm has ever surveyed.

1. **Import your history.** Bring the spreadsheet you already have — job number, client, address, county, whatever's in it. No legal descriptions required: addresses geocode automatically, and anything the importer can't place, you drop on the map by hand.
2. **Backsight indexes it spatially.** Where your records carry Section-Township-Range, our parser reads it and joins it to public-domain BLM PLSS section data. Ambiguous descriptions get flagged for your confirmation, never silently guessed — a wrong-section match is worse than no match, and we built the product knowing that.
3. **Every new request checks the archive.** A request comes in; the radar instantly shows every prior job in that section and within a configurable radius — year, type, deliverables, original fee.

**The payoff paragraph:**

> When the radar hits, you're quoting a job your firm has already partly done. You know the ground, you may hold control there, and the research is already paid for. Quote it in minutes instead of hours, win it on price if you want to, and deliver it in a fraction of the field time. One radar hit that converts to a job can cover a year of Backsight.

**Honesty note (keep on page — this audience respects it):** PLSS section search covers the 30 public-land-survey states. In Texas and the metes-and-bounds states, the radar works from geocoded addresses, subdivision references, and map pins instead. If your archive is address-only, that's the normal case, not the degraded one.

**Section CTA:** `Run the free Prior-Work Audit on your own job list →`

---

## Social Proof (placeholders — do not fabricate)

> **[PLACEHOLDER — do not ship fabricated quotes.]** Populate this section only with real, attributed quotes gathered from design-partner firms during the founder-led phase. Target format:
>
> - *"[Quote about a radar hit that won a job]"* — [Name], PLS, [Firm], [Town, State]
> - *"[Quote about status calls stopping]"* — [Name], Office Manager, [Firm], [State]
> - *"[Quote from a title company about the status link]"* — [Name], [Title Co.]
>
> Until three real quotes exist, replace this section with a factual strip: `Built for firms of 3–25 people · Runs on public-domain BLM PLSS data · Your data exports in full, any time`.

---

## Pricing Section

**Header:** Flat per-firm pricing. Crews never count against a license.

| | **Solo — $79/mo** | **Firm — $149/mo** | **Practice — $249/mo** |
|---|---|---|---|
| Users | Up to 5 | Up to 15 | Unlimited |
| Pipeline, radar, status links | ✓ | ✓ | ✓ |
| Historical import + coverage map | ✓ | ✓ | ✓ |
| QuickBooks Online invoice push | — | ✓ | ✓ |
| Client-branded status pages | — | — | ✓ |
| Full data export (CSV + files) | ✓ | ✓ | ✓ |

- 14-day free trial on any tier. No credit card to start.
- Annual billing: 2 months free.
- No per-user math, no add-on creep, no "contact sales." The price on this page is the price.

**Pricing CTA:** `Start your trial`

---

## FAQ

**1. Can I import our existing job history, and how messy can it be?**
Messy is the expected case. The importer takes CSV or spreadsheet exports with whatever columns you have. Addresses are geocoded automatically; Section-Township-Range text is parsed where present; anything unplaceable lands in a review queue where you drop a pin or skip it. You don't need legal descriptions in your spreadsheet — most firms don't have them there, and the product is designed around that.

**2. We're a three-person shop. Is this for us?**
Yes — you're who the Solo tier is for. The smaller the firm, the more the institutional memory lives in one head, and the more a searchable archive is worth. If a whiteboard is genuinely still working for you, keep it; the usual tipping point is the second crew or the first time a status call interrupts a boundary resolution.

**3. What happens in Texas and other non-PLSS states?**
The Public Land Survey System covers 30 states. Outside them (Texas, the original colonies, and a few others), section search doesn't apply, so the radar runs on geocoded addresses, subdivision/lot-block references, and manual map pins. Job tracking and client status links work identically everywhere.

**4. What if a legal description is ambiguous?**
"T2N R3W Sec 14" exists under multiple principal meridians. Backsight resolves township/range against your job's state and county, and when a description is still ambiguous it flags the row for your confirmation instead of guessing. We'd rather ask than silently index the wrong section.

**5. Do my field crews need accounts? Do they count against my user limit?**
Crews update stage and attach field notes/photos from a phone browser — no app install. Pricing is flat per firm by tier; we will never charge per crew.

**6. Can clients see my whole pipeline through the status link?**
No. Each status link is a tokenized, read-only page for one job: current stage, progress, expected delivery, and your office contact. No fees, no notes, no other jobs. You can revoke a link at any time.

**7. What happens to our data if we leave?**
Full export — every job, event history, and attachment — in open formats (CSV + files), self-serve, at any time, on any tier. Your archive is your firm's asset; treating it as a hostage would be a bad way to run a company that sells to licensed professionals.

**8. Does Backsight do CAD, adjust traverses, or talk to my data collector?**
No. Backsight is practice management: jobs, stages, clients, history, invoicing handoff to QuickBooks Online. Carlson, Civil 3D, and your data collector do what they do; Backsight tracks the business around them.

---

## Closing CTA Block

**Header:** Find out what your firm already knows.

> Import your job list. In about ten minutes you'll be looking at a map of every parcel your firm has touched — and the next request that lands on ground you've already surveyed will tell you so.

**Primary CTA:** `Start a 14-day trial`
**Secondary CTA:** `Run the free Prior-Work Audit`

**Footer line (also appears on every client status page):** `Tracked with Backsight — job tracking for land surveying firms.`

---

### Copy sourcing notes (internal, not for page)

- ICP, stage names, pricing, and wedge framing per `business/FINAL_CONCEPT.md` (authoritative).
- PLSS covers 30 states / excludes Texas and colonial states: verified by adversarial review, https://en.wikipedia.org/wiki/Texas_land_survey_system — hence the honesty note and FAQ 3.
- BLM PLSS data is public domain: verified by adversarial review, https://gbp-blm-egis.hub.arcgis.com/datasets/BLM-EGIS::blm-national-plss-public-land-survey-system-polygons
- Meridian-ambiguity handling (FAQ 4) and address-first import (FAQ 1) are the skeptic-mandated fixes; the copy sells them as design choices because they are.
- The "no per-user math" line is a deliberate contrast with KudurruStone's per-user/role pricing (verified by adversarial review; competitor sites blocked automated fetch, figures per skeptic search-index research) — but we never name competitors on the page.
- Full-data-export promise (FAQ 7) implements the skeptic's lock-in/backup mitigation and is a sales asset.
