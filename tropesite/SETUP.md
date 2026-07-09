# tropesite — SETUP

A step-by-step walkthrough for taking tropesite live: catalog, domain, deploy,
search consoles, Amazon Associates + PA-API, and Pinterest Rich Pins. Each
external requirement was verified against current docs in **July 2026**; re-check
the linked source before launch, since these programs change wording and bot
lists over time.

---

## 0. Prerequisites

- Node **≥ 22.5** (built-in `node:sqlite`). Check: `node --version`.
- Your `pinfactory` SQLite catalog (or use the bundled sample to start).
- An Amazon Associates account (see §5), a domain, and a Cloudflare or Vercel account.

```bash
cd tropesite
cp .env.example .env      # then edit
```

---

## 1. Wire in your catalog

The generator reads a SQLite database whose shape is documented in
`src/schema.sql`. Two ways to use your real data:

- **Point at it:** set `TROPESITE_DB=/path/to/pinfactory.db` in `.env`. If your
  pinfactory tables differ, either add the extension tables tropesite needs
  (`comps`, `comp_tropes`, `pages`, `page_entries`) to that DB, or write a small
  importer that copies pinfactory rows into a tropesite DB using this schema.
- **Import:** map pinfactory's books / pen names / subgenres / trope tags /
  destination URLs onto `books`, `pen_names`, `subgenres`, `tropes`,
  `book_tropes`. Bring your **real blurbs** into `books.blurb` — the content
  engine drafts from them.

Then:

```bash
node bin/tropesite.mjs plan     # confirm the proposed page list looks right
```

Only trope/subgenre combinations with **≥ 6 books** (yours + approved comps)
become pages (`MIN_BOOKS_PER_PAGE`).

---

## 2. Comp-title intake

Comps are other authors' well-known books, blended into your lists. They are the
main lever for reaching the 6-book threshold on more tropes.

```bash
node bin/tropesite.mjs comps review          # see which tropes are thin
node bin/tropesite.mjs comps add --title "Some Title" --author "Author" \
     --tropes "Enemies to Lovers" --asin B0XXXXConfirm
node bin/tropesite.mjs comps approve <id> --desc "One or two TRUE sentences."
```

Rules enforced by the tool:
- A comp is invisible until **approved**.
- Approval **requires** a human-confirmed `factual_description` — the only prose
  the site will ever use about that book.
- No comp cover images are stored or hotlinked; covers come only via PA-API (§6).

---

## 3. Generate & review

```bash
node bin/tropesite.mjs generate --pilot   # 10 pages across your 2 strongest tropes
node bin/tropesite.mjs build
node bin/tropesite.mjs review              # http://localhost:4321 — read the drafts
```

When happy, scale up: `node bin/tropesite.mjs generate` (all pages), then
`build`. Use `generate --changed` on subsequent runs to redraft only pages whose
underlying data changed (keeps the "last updated" date honest).

Set `ANTHROPIC_API_KEY` in `.env` for LLM-drafted copy; without it the
deterministic composer is used. Neither fabricates.

---

## 4. Deploy (Cloudflare Pages or Vercel)

`dist/` is a plain static folder. `deploy` runs the audit gate first.

**Cloudflare Pages**
```bash
npm i -g wrangler && wrangler login
node bin/tropesite.mjs deploy --target cloudflare   # or: wrangler pages deploy dist --project-name tropesite
```
Or connect the repo in the Cloudflare dashboard with **build command**
`node bin/tropesite.mjs build` and **output directory** `dist`.

**Vercel**
```bash
npm i -g vercel && vercel login
node bin/tropesite.mjs deploy --target vercel
```
Or import the repo in Vercel: build command `node bin/tropesite.mjs build`,
output directory `dist`.

Point your domain's DNS at the provider and set `SITE_URL` in `.env` to the
final HTTPS URL **before** the last `build` (canonical URLs, sitemap and JSON-LD
all use it).

---

## 5. Amazon Associates

Verified July 2026 against Amazon Associates Program Policies / Operating
Agreement. **Re-read the current text before launch** — links:
- Program policies: <https://affiliate-program.amazon.com/help/operating/policies>
- Operating Agreement changes: <https://affiliate-program.amazon.com/help/operating/compare>

**Do this:**
1. **Register this site's domain** (and your Pinterest account, if pins link to
   Amazon) in your Associates account profile. Links from unlisted sites can
   violate the agreement.
2. Put your tracking ID(s) in `.env` (`AMAZON_ASSOC_TAG`, plus optional
   per-section IDs). tropesite builds plainly-identifiable `amazon.com/dp/ASIN?tag=…`
   links — **no shorteners, no redirects, no cloaking**.
3. The required disclosure — **exactly**
   *"As an Amazon Associate I earn from qualifying purchases."* — renders
   site-wide in the footer and on every page with affiliate links. Do not
   paraphrase it. `audit` fails any affiliate page missing it.
4. **Prices/ratings:** tropesite displays none (they go stale and violate
   policy). Keep it that way unless you pull live prices via PA-API with the
   required timestamp/disclaimer.
5. **Email:** the newsletter/email capture links to **site pages only**, never
   Amazon. `audit` fails any Amazon/affiliate link found in an email-capture block.
6. **International:** OneLink is enabled by default (`AMAZON_ONELINK=true`) so
   non-US clicks route to the visitor's local marketplace and still monetize.
   Configure marketplace subtags in your Associates OneLink dashboard and mirror
   them in `AMAZON_ONELINK_TAGS` for documentation.
7. **New-account review window:** a new Associates account must generate
   qualifying sales within the initial review window (currently ~180 days / ~3
   sales — verify) or it's closed. The site works fully before PA-API access
   exists; run with `--no-images`.

Run `node bin/tropesite.mjs audit` — it produces a pass/fail compliance report
covering every item above.

---

## 6. Product Advertising API (PA-API) — cover images

PA-API is the **only** compliant way to display Amazon product cover images
(yours and comps'). It requires an Associates account **with qualifying sales**,
so you likely won't have access at launch — that's fine:

- **Until then:** build with `--no-images` (text-only entries). This is the default.
- **Once active:** store each item's `cover_asin`, wire PA-API image URLs into
  the renderer, and add `og:image` (also improves Rich Pins). Never download,
  re-host, or hotlink covers from anywhere else.

Docs: <https://webservices.amazon.com/paapi5/documentation/>

---

## 7. Google Search Console

1. Go to <https://search.google.com/search-console> → **Add property** →
   **Domain** (preferred) or **URL prefix** = your `SITE_URL`.
2. Verify (DNS TXT record for a Domain property, or the HTML-file/tag method).
   For a static host, the DNS method is simplest.
3. **Sitemaps** → submit `sitemap.xml` (tropesite writes it to the site root).
4. Use **URL Inspection** on a couple of pages → **Request indexing**.
5. `robots.txt` already allows `Googlebot`. `Google-Extended` is also allowed so
   Google's AI surfaces can use your content — remove it from `src/robots.mjs`
   if you want to opt out of that.

---

## 8. Bing Webmaster Tools (not optional)

Several AI assistants retrieve via Bing's index, so Bing coverage matters as much
as Google.

1. Go to <https://www.bing.com/webmasters> → sign in → **Add site** = `SITE_URL`.
   You can **import from Google Search Console** to skip re-verification.
2. Otherwise verify via DNS CNAME/TXT or the meta-tag/XML-file method.
3. **Sitemaps** → submit `https://your-domain.com/sitemap.xml`.
4. Use **URL Inspection / Submit URL** for your top pages.
5. `robots.txt` already allows `Bingbot`.

---

## 9. Pinterest Rich Pins

Verified July 2026. Pinterest retired its own validator; use the URL debugger:
<https://developers.pinterest.com/tools/url-debugger/>

- Every page emits OpenGraph tags (`og:title`, `og:description`, `og:type`,
  `og:url`). Book pages use `og:type=book`.
- **Note on Product Rich Pins:** they require `product:price:amount` /
  availability. tropesite **omits prices** (Amazon policy), so it does **not**
  emit Product Rich Pin price tags. Book pages rely on Article/Book-style OG +
  schema.org `Book`. If you later pull live PA-API prices, you can add product
  price tags then. (Decide which you want — priceless OG book pins, or
  price-bearing product pins fed by PA-API.)
- Add `og:image` once PA-API cover images are active (§6); Rich Pins look best
  with an image.
- Validate a few live URLs in the debugger and claim your domain in Pinterest
  Business settings so pins from it show as Rich Pins.

---

## 10. Ongoing

```bash
node bin/tropesite.mjs generate --changed   # redraft only what changed
node bin/tropesite.mjs build
node bin/tropesite.mjs audit                 # must pass
node bin/tropesite.mjs deploy                # audit-gated
```

**Re-verify periodically:** the AI-crawler user-agent list in `src/robots.mjs`
(vendors add bots), the exact Amazon disclosure wording, and PA-API / Rich Pin
requirements. The values shipped here were current in July 2026.

### Open items flagged for your decision
- **Pen-name disclosure wording** on the About page (placeholder + `[FLAG]` in
  `src/render.mjs` → `aboutBody()`).
- **Priceless book pins vs. PA-API product pins** (§9).
- **Google-Extended opt-in/out** for AI training (§7).
