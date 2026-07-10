# Backsight MVP — Build Specification

Target: a locally runnable demo app in `backsight-venture/product/app/` that a stranger can start with `npm install && npm run dev` (Node 22). No external credentials required; everything demonstrable offline except map tiles (graceful fallback required).

## Stack (fixed)
- Next.js 14+ (App Router, TypeScript), Tailwind CSS
- SQLite via `better-sqlite3` (file `data/backsight.db`, auto-created + seeded on first run or via `npm run seed`)
- Leaflet via `react-leaflet` for maps, OpenStreetMap tiles; if tiles fail to load (offline), the map area must still render job markers on a plain coordinate grid background (CSS fallback), never a broken UI
- No auth provider: a demo-user switcher (owner "Dana Whitfield, PLS", office manager "Marcus Lee") stored in a cookie. Documented as mocked.

## Data model (SQLite)
- `clients` (id, name, kind: title_co|builder|homeowner|attorney|government, contact_email, phone)
- `jobs` (id, job_number e.g. "2026-0142", client_id, type: boundary|alta|topo|construction_staking|subdivision_plat|elevation_cert, stage: request|quoted|scheduled|fieldwork|drafting|review|delivered|invoiced, quote_amount, address, county, state, lat, lng, plss_trs nullable e.g. "T7N R69W S14", plss_meridian nullable e.g. "6th PM", crew nullable, due_date, created_at, delivered_at nullable, notes, share_token unique)
- `job_events` (id, job_id, at, actor, from_stage, to_stage, note) — status history
- `attachments` (id, job_id, filename, label) — metadata only, no real files needed
- `outbox` (id, at, to_email, subject, body, job_id) — “sent” notifications land here (mocked email)

## Seed data (`scripts/seed.ts`, run via `npm run seed`)
Fictional firm: **Whitfield Land Surveying, PLS** — Fort Collins, Larimer County, Colorado (PLSS state, 6th Principal Meridian).
- 12 clients (2 title companies, 3 builders, 1 municipality, 5 homeowners, 1 attorney)
- ~85 jobs spanning 2019–2026: ~60 delivered/invoiced historical, ~25 active spread across all stages. Coordinates: realistic lat/lng scatter around Fort Collins (40.35–40.75 N, -105.30 – -104.90 W). ~70% of jobs have plss_trs values consistent with that area (Townships 6N–9N, Ranges 68W–70W, sections 1–36); the rest address-only (tests the fallback).
- Deliberate demo hooks: (a) at least 3 historical jobs share the same section as one incoming `request`-stage job so Prior-Work Radar shows a hit; (b) 2 active jobs overdue (due_date past); (c) 1 job sitting in `review` >10 days (bottleneck callout); (d) unbilled: several `delivered` but not `invoiced`.

## Core lib: PLSS parser (`lib/plss.ts`) — LICENSE-CLEAN, written from scratch
Parse strings like "T7N R69W Sec 14", "T7N, R69W, S14", "Township 7 North, Range 69 West, Section 14", "NE1/4 SW1/4 S14 T7N R69W" → `{township: 7, townshipDir: 'N', range: 69, rangeDir: 'W', section: 14, quarters?: string[]}` or null. Include a state→default principal meridian table (CO→6th PM etc.) and an `ambiguous: true` flag when state unknown. Unit tests with vitest (≥12 cases incl. failures). Do NOT use or port pyTRS (license-restricted); write original code.

## Pages (App Router)
1. `/` — **Landing page** (marketing): hero ("Your firm has surveyed this ground before. Backsight remembers."), problem bullets, product screenshots placeholders (styled divs), 3-tier pricing ($79 / $149 / $249 flat per firm), FAQ (incl. "what's mocked in this demo?"), CTA → `/app`. Professional, restrained design (surveying = precision: dark slate + orange accent), responsive.
2. `/app` — **Dashboard**: KPI tiles (active jobs, overdue, avg days in stage, unbilled $), pipeline column counts, "needs attention" list (overdue, stuck-in-review), recent activity feed from job_events.
3. `/app/jobs` — **Pipeline board**: kanban columns per stage, cards (job #, client, type, county ref, due date, badges for overdue/prior-work-nearby), advance/regress via card menu (writes job_events, inserts outbox row notifying client on key transitions). Filter by type/crew. A list-view toggle.
4. `/app/jobs/[id]` — **Job detail**: full record, mini-map, status timeline, stage controls, prior-work panel (same-section + within-2km list), copy client-share-link button, attachments list, notes.
5. `/app/radar` — **Prior-Work Radar** (the wedge): search box accepting an address (matches seeded addresses / lat,lng) OR an S-T-R string (parsed live with lib/plss). Results: map with hit markers + ranked list (same section first, then distance), each showing year, type, deliverables, original quote. Empty-state explains the value. Include a "try these" row of 3 example searches wired to demo hooks.
6. `/status/[token]` — **Public client status page** (no auth): firm-branded read-only tracker — progress bar across stages, current stage, last update, expected delivery, office contact. This is the page a title company refreshes instead of calling.
7. `/app/settings` — firm profile (name/logo text), user switcher, and a **"What's real vs. mocked"** panel (parser: real; geocoding: pre-seeded, Census Geocoder integration stubbed at `lib/geocode.ts` with documented TODO; email: outbox table; billing/auth: mocked).
8. `/app/outbox` — list of "sent" notifications (proves the notification loop without SMTP).

## Quality bar
- `npm run build` must pass clean; `npm test` (vitest) green.
- Seed idempotent (`npm run seed` resets).
- README.md in `product/app/`: prerequisites, 3-command quickstart, demo script walkthrough (7 steps hitting each page's hook), what's mocked, project structure map.
- No external network calls at runtime except OSM tiles (with fallback). No API keys anywhere.
