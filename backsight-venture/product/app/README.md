# Backsight — MVP demo

Job tracking, public client status pages, and **Prior-Work Radar** for small land
surveying firms. This is a locally runnable demo seeded with a fictional firm:
**Whitfield Land Surveying, PLS** (Fort Collins, Larimer County, Colorado — 6th PM).

Everything works offline except OpenStreetMap tiles, and the map degrades
gracefully to a coordinate grid when tiles can't load. No accounts, no API keys,
no external services.

## Prerequisites

- **Node 22** (`node --version` → v22.x)
- That's it. SQLite is a file; map tiles need no key.

## Quickstart (3 commands)

```bash
npm install
npm run seed     # optional — the DB auto-creates and seeds on first run too
npm run dev
```

Open http://localhost:3000. Run `npm test` for the PLSS parser suite and
`npm run build` for a production build. `npm run seed` is idempotent — run it
any time to reset the demo data.

## Demo script (7 steps, one per page)

1. **Landing — `/`** — the pitch: "Your firm has surveyed this ground before.
   Backsight remembers." Skim the problem bullets and $79/$149/$249 flat pricing,
   then click **Open the demo**.
2. **Dashboard — `/app`** — KPI tiles show ~29 active jobs, **2 overdue**, and an
   **unbilled $** figure from delivered-but-uninvoiced work. "Needs attention"
   flags the overdue jobs plus plat **2026-0118, stuck in review ~15 days**.
3. **Pipeline — `/app/jobs`** — kanban board across all stages. Find
   **2026-0142** in the Request column: it carries a teal **Prior work nearby**
   badge. Open a card's ⋮ menu and advance a job to *Scheduled* — that writes a
   status-history event **and** a client notification. Try the type/crew filters
   and the List toggle.
4. **Job detail — `/app/jobs/…`** — open **2026-0142** (click it on the board).
   Full record, mini-map, status timeline, stage controls, and a prior-work panel
   showing the **3 historical Bingham Hill Rd jobs in the same section
   (T7N R69W S14)**. Click **Copy client share link**.
5. **Prior-Work Radar — `/app/radar`** — the wedge. Click the first "try these"
   chip, **`T7N R69W S14`** — parsed live by the from-scratch PLSS parser — and
   get 3 same-section hits with year, type, deliverables, and original quotes.
   Also try the address and coordinate chips, and a garbage string to see the
   loud failure (never a guess).
6. **Public status page — `/status/demo-status`** — what a title company
   refreshes instead of calling: firm-branded progress bar for job 2026-0127,
   current stage, last update, expected delivery, office contact. No pricing,
   notes, or navigation. (This is the link the Copy button produces.)
7. **Outbox — `/app/outbox`** — the notification you triggered in step 3 sits on
   top, proving the email loop without SMTP. Finish at **`/app/settings`**:
   switch between Dana and Marcus (cookie-based mock auth) and read the
   **"What's real vs. mocked"** panel.

## What's mocked (by design)

| Area | Status |
| --- | --- |
| PLSS T-R-S parser (`lib/plss.ts`) | **Real** — original, license-clean, vitest-covered (no pyTRS) |
| Pipeline engine, radar, status pages | **Real** |
| Geocoding | Mocked — jobs pre-seeded with coordinates; Census Geocoder stubbed with a TODO in `lib/geocode.ts` |
| Email | Mocked — notifications land in the `outbox` table (`/app/outbox`) |
| Auth | Mocked — demo-user cookie switcher in Settings |
| Billing | Mocked — display-only pricing |

## Project structure

```
app/
  page.tsx                 Landing page (marketing)
  app/                     The product (dashboard shell + nav)
    page.tsx               Dashboard: KPIs, pipeline counts, needs-attention, activity
    jobs/page.tsx          Pipeline: kanban board + list view, filters, stage menu
    jobs/[id]/page.tsx     Job detail: record, mini-map, timeline, prior work, share link
    radar/page.tsx         Prior-Work Radar: address / lat,lng / S-T-R search
    outbox/page.tsx        Mock-email outbox
    settings/page.tsx      Firm profile, user switcher, real-vs-mocked panel
  status/[token]/page.tsx  Public client status tracker (no auth)
components/                Map (Leaflet + offline grid fallback), stage actions, copy button
lib/
  plss.ts / plss.test.ts   PLSS parser (from scratch) + vitest suite
  db.ts                    better-sqlite3 schema + auto-create/auto-seed
  seed.ts                  Deterministic demo dataset (12 clients, ~85 jobs, demo hooks)
  queries.ts               Dashboard, prior-work, and radar queries
  actions.ts               Server actions: stage-transition engine, user switcher
  geo.ts                   Haversine + approximate PLSS section geometry
  geocode.ts               Census Geocoder stub (documented TODO)
scripts/seed.ts            `npm run seed` — idempotent reset
data/backsight.db          SQLite file (gitignored; created on first run)
```
