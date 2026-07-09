# tropesite

A static, SEO- and AI-search-optimized book-recommendation site generator. It
turns a SQLite catalog of your books (across pen names, subgenres and trope
tags) — blended with **human-approved** comparable titles — into trope hub
pages, "books like X" pages, and individual book pages, engineered to get cited
by AI search assistants and rank for long-tail reader queries.

- **Zero runtime dependencies.** SQLite (`node:sqlite`), HTTP (`fetch`) and HTML
  generation are all built in. Requires **Node ≥ 22.5**.
- **Static output.** `dist/` is plain HTML/CSS — deploy to Cloudflare Pages or
  Vercel free tier. No server, no database in production.
- **All content in the initial HTML.** No JS is required to read any page, so AI
  crawlers that don't run JavaScript see everything.
- **Compliance is enforced, not assumed.** The `audit` command fails the build
  on any missing Amazon disclosure, untagged/cloaked affiliate link, affiliate
  link inside the email capture, broken internal link, or invalid schema.

> **Catalog status:** ships with a **clearly-labeled sample catalog** (fictional
> titles/authors) so every command runs today. Point `TROPESITE_DB` at your real
> `pinfactory.db`, or import your rows, to replace it. Nothing about real books
> is ever fabricated — see "No fabrication" below.

## Quick start

```bash
cd tropesite
cp .env.example .env          # fill in SITE_URL, AMAZON_ASSOC_TAG, etc.
node bin/tropesite.mjs seed   # load the sample catalog (idempotent)
node bin/tropesite.mjs plan   # review the proposed page list
node bin/tropesite.mjs generate --pilot   # draft 10 pages across 2 tropes
node bin/tropesite.mjs build  # render static site to dist/
node bin/tropesite.mjs review # preview at http://localhost:4321
node bin/tropesite.mjs audit  # compliance + crawlability report
```

(You can also `npm link` or add `bin/` to PATH to call `tropesite` directly.)

## Commands

| Command | What it does |
|---|---|
| `seed` | Load the sample catalog (idempotent placeholder data). |
| `plan` | Print the proposed page list (hubs ≥ 6 books, books-like, book pages). No generation. |
| `comps list [--status s]` | List comp titles by status (`proposed`/`approved`/`rejected`). |
| `comps review` | Show trope inventory gaps and comps awaiting your action. |
| `comps add --title --author --tropes "X,Y" [--asin] [--desc]` | Add a comp (lands as `proposed`). |
| `comps approve <id> --desc "…"` | Approve a comp. **A factual description is required.** |
| `comps reject <id>` | Reject a comp (kept for the audit trail). |
| `comps propose --trope <slug>` | Ask the engine to propose candidates (needs `ANTHROPIC_API_KEY`; never auto-approves). |
| `generate [--pilot] [--changed] [--limit N] [--no-images]` | Draft page content. `--changed` only redrafts pages whose source data changed. |
| `review [--port N]` | Local preview server for `dist/`. |
| `build [--no-images]` | Render the static site to `dist/`. |
| `audit` | Compliance / crawlability / schema / broken-link report (non-zero exit on failure). |
| `deploy [--target cloudflare\|vercel] [--dry-run]` | Audit-gated deploy helper. |

## Page anatomy (applied to every recommendation page)

- **H1** phrased as the reader's query ("Best Enemies to Lovers Dark Romance Books").
- A **2–3 sentence direct-answer summary** at the top (what AI engines extract):
  the trope plus the top 3 picks with one-line reasons.
- The full list: each book gets a heading, an 80–150 word specific writeup, and
  a clearly-labeled retailer link.
- **schema.org JSON-LD**: `ItemList` + `Book` on list pages; `Book` + `Product`
  on book pages; `FAQPage` on every page with an FAQ; `BreadcrumbList` + `WebSite`.
- **FAQ block** at the bottom (3–5 real reader questions).
- **Internal links**: every list page links to 3–6 sibling trope pages; book
  pages link back to every list they appear on.
- **Honest last-updated date** (updated only when a page's content actually changed).
- **OpenGraph + Twitter cards** on every page (also feeds Pinterest Rich Pins).

## No fabrication

- **Your books:** writeups are composed from your real metadata (blurb, tropes,
  heat level, content notes, subgenre). Import your true blurbs.
- **Comp titles (other authors):** the site uses **only** the human-confirmed
  `factual_description` you approve. The engine may *propose* candidates, but
  they never appear on the site until you approve one with a factual description.
- The content engine — whether using the Anthropic API or the built-in
  deterministic composer — is constrained to the supplied facts. Its system
  prompt forbids inventing plot, quotes, heat levels, prices, ratings, or
  retailer endorsement.
- No other authors' cover images are downloaded or hotlinked. Covers (yours or
  comps') are shown **only** via Amazon PA-API image URLs when that access is
  active; until then the site runs in text-only mode (`--no-images`).

## Content engine modes

- **With `ANTHROPIC_API_KEY`:** drafts richer, varied prose (model set by
  `ANTHROPIC_MODEL`, default `claude-sonnet-5`), constrained by a hard system
  prompt to the supplied facts, and varied per page so no two read as clones.
- **Without a key:** a deterministic composer assembles genuinely specific
  writeups from your metadata and the trope definitions. Neither mode fabricates.

## Data model

See `src/schema.sql`. Tables: `pen_names`, `subgenres`, `tropes`, `books`,
`book_tropes`, `comps`, `comp_tropes`, `pages`, `page_entries`, `meta`. Prices,
star ratings and review counts are intentionally **absent** (Amazon policy).

See **[SETUP.md](./SETUP.md)** for domain, Cloudflare/Vercel deploy, Google
Search Console, Bing Webmaster Tools, Amazon Associates + PA-API, and Pinterest
Rich Pins — with the current-doc facts each step was built against.
