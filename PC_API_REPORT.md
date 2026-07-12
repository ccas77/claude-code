# Publisher Champ API — Map & Report

**Prepared:** 2026-07-12
**Source of truth:** the `slideshow-generator` app source (public repo `ccas77/slideshow-generator`, branch `main`, commit `98ab401`), specifically `lib/publisher-champ.ts`, `app/api/chat/route.ts`, and `app/chat/page.tsx`.

> **Important scope note.** Everything below is derived from **reading the app's real source code**, not from live-probing the API. Two hard blockers prevented live calls from this environment (details in [§7](#7-what-blocked-live-probing)):
> 1. This sandbox's egress policy **blocks `publisherchamp.com`** (proxy returns a 403 on CONNECT).
> 2. The real `api_key` / `account_id` are **not stored anywhere I can read** — they live only in your browser's `localStorage`.
>
> Where a fact comes from the app author's tool *descriptions* rather than a verified live response, it is flagged **(from code, unverified against a live response)**.

---

## 1. Where the connection lives

The Publisher Champ integration is **not** in the `claude-code` monorepo that this branch sits in. It lives in a **separate deployed app**:

| Thing | Value |
|---|---|
| Live app | `https://slideshow-generator-nine.vercel.app` (page: `/chat`) |
| Vercel project | `slideshow-generator` (`prj_U1yuqUU2oDqh4piitrYfRL2FL2vk`), Next.js |
| Source repo | `github.com/ccas77/slideshow-generator` (public), branch `main` |
| Integration file | `lib/publisher-champ.ts` (the API client) |
| Consumer | `app/api/chat/route.ts` — **the only caller**; it's exclusively the chatbot feature |

Confirmed: the only file that imports `@/lib/publisher-champ` is `app/api/chat/route.ts`. No cron job, poster, or slideshow path touches Publisher Champ. (The `CLAUDE.md` comment calling it "Publishing orchestration" is inaccurate — it's a read-only KDP-stats client.)

---

## 2. Auth method, base URL, and credentials

From `lib/publisher-champ.ts`:

```ts
const BASE = "https://www.publisherchamp.com/api/v1";

async function pcFetch(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}/`);          // note trailing slash
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "")
      url.searchParams.set(k, String(v));               // everything goes in the query string
  }
  const res = await fetch(url.toString());              // plain GET, no headers
  ...
}
```

- **Base URL:** `https://www.publisherchamp.com/api/v1/`
- **Endpoint shape:** `GET {BASE}/{endpoint}/?...` (trailing slash on the endpoint).
- **Auth method:** **query-string parameters**, not a header. Every request carries:
  - `api_key=<your key>`
  - `account_id=<your account UUID>`
  - There is **no** `Authorization` header, **no** Bearer token, **no** `x-api-key` header. Auth is entirely in the URL.
- **Token format:** the UI labels the account field "Account **UUID** from Publisher Champ," so `account_id` is a UUID. The `api_key` format is opaque (entered as a password field); the code imposes no format.

### Where the secret and account_id actually are

From `app/chat/page.tsx`:

```ts
const LS_PC_KEY = "sg.pc_api_key";
const LS_PC_ACCOUNT = "sg.pc_account_id";
// saved with localStorage.setItem(...) — "saved locally on this device only"
```

Flow: you type the key + account UUID into `/chat` → they're stored in **browser `localStorage`** → POSTed to `/api/chat` as `pcApiKey` / `pcAccountId` → the server injects them as query params on each Publisher Champ GET.

**Consequence:** the credentials are **not** in the repo, **not** in `.env`, and **not** in Vercel environment variables. I therefore cannot display your `account_id` (masked or otherwise) — it isn't anywhere I can access. You have it in the browser you use the chat from (DevTools → Application → Local Storage → keys `sg.pc_api_key`, `sg.pc_account_id`).

> **Security note worth flagging:** because auth is passed in the **URL query string**, your `api_key` can end up in server access logs, proxy logs, and browser history for any hop that logs full URLs. A header-based scheme would avoid that. Not something to fix in Publisher Champ (their API dictates it), but worth knowing.

---

## 3. Endpoints the app uses

All are `GET {BASE}/{endpoint}/`. Five are wired up:

| # | Endpoint (path) | App function | Purpose |
|---|---|---|---|
| 1 | `listAccountsAPI` | `listAccounts()` | List accounts under the API key (called with `account_id=""`) |
| 2 | `bookStatsAPI` | `bookStats()` | Per-**book** sales / royalties / reads / ad spend |
| 3 | `authorStatsAPI` | `authorStats()` | Per-**author** (pen name) breakdown |
| 4 | `adsMonitoringAPI` | `adsMonitoring()` | Ad performance, **grouped by ASIN** |
| 5 | `countryStatsAPI` | `countryStats()` | Per-**country/marketplace** royalties + ad spend |

### Parameters (union across endpoints)

Defined by the `PCParams` interface and the Claude tool schemas in `app/api/chat/route.ts`:

| Param | Type | Applies to | Notes |
|---|---|---|---|
| `api_key` | string | all | required, query string |
| `account_id` | string | all (blank for `listAccountsAPI`) | UUID |
| `start_date` | `YYYY-MM-DD` | 2–5 | custom range start |
| `end_date` | `YYYY-MM-DD` | 2–5 | custom range end |
| `fixed_range_selection` | enum | 2–5 | shortcut instead of start/end (see below) |
| `currency` | 3-letter code (e.g. `USD`) | 2–5 | default USD |
| `countries` | CSV (e.g. `US,UK,DE`) | 2, 4, 5 | filter marketplaces |
| `include_country_breakdown` | boolean | 2 (bookStats) | |
| `include_platform_breakdown` | boolean | 2 (bookStats) | |

**`fixed_range_selection` accepted values:** `Today`, `Yesterday`, `This Week`, `Last Week`, `This Month`, `Last Month`, `Last 7 days`, `Last 30 days`, `Last 90 days`, `This Year`, `Last Year`.

> The full published Swagger at `https://www.publisherchamp.com/api-docs/` may expose **more** endpoints or parameters than these five. The app only implements the five above, so this list is a lower bound. I could not fetch the Swagger spec to confirm the complete surface (egress-blocked — see §7).

---

## 4. KEY QUESTION — ads-monitoring granularity

**Answer: `adsMonitoringAPI` returns data grouped by ASIN — i.e. per book edition (essentially book-level), one row per ASIN. It is NOT per individual ad, NOT per Amazon Attribution tag, and NOT per campaign.**

Evidence — the tool description the app author wrote for `ads_monitoring` (`app/api/chat/route.ts:77-79`):

> *"Get ad performance metrics **grouped by ASIN**: spend, impressions, clicks, CTR, CPC, orders, sales, ACOS, TACOS, KENP reads, ROI, etc."*

So the metric fields that come back **(from code, unverified against a live response)** are, per ASIN:

`spend`, `impressions`, `clicks`, `CTR`, `CPC`, `orders`, `sales`, `ACOS`, `TACOS`, `KENP reads`, `ROI`

What this means against your specific question:

- **Per individual ad / per Amazon Attribution tag?** → **No.** There are no ad-name, ad-id, or attribution-tag fields, and no per-ad spend/clicks/attributed-sales/attributed-KENP rows. The grouping key is the ASIN, not an ad or a tag.
- **Per campaign?** → **No.** No campaign-id or campaign-name grouping.
- **Book-level totals?** → **Yes — this is what you get.** ASIN ≈ a specific book/format edition, so each row is one book edition's aggregated ad performance across whatever ads/campaigns point at it.

> **Caveat:** these field names are transcribed from the app author's tool schema, which was written by reading the real API — but I could not verify them against a live JSON response (§7). If the exact field spellings/nesting matter (e.g. `kenp_reads` vs `KENP reads`), that needs one live call to confirm. The **granularity conclusion (per-ASIN, not per-ad/tag/campaign)** is unambiguous from the code regardless.

For reference, the other stats endpoints' documented returns **(from code, unverified)**:
- `bookStatsAPI`: per book — "units sold by format, KU reads, ad spend, gross/net royalty, country breakdown."
- `authorStatsAPI`: per author/pen-name — "units sold, royalties, KU reads."
- `countryStatsAPI`: per country/marketplace — "earnings, spend, ad sales per country with currency conversion."

---

## 5. Practical limits

| Aspect | Finding |
|---|---|
| **Rate limits** | No `429`/rate-limit handling in the PC client. `pcFetch` does a single `fetch` and throws on non-OK. No documented limit is visible from code; the real value (if any) would come from live response headers, which I couldn't read. The app's retry/`attempt-log` machinery is **PostBridge-only**, not Publisher Champ. |
| **Retries** | None for Publisher Champ. One shot per call. |
| **Pagination** | None. `pcFetch` returns `res.json()` directly with no page/cursor/offset handling, implying responses are single un-paged JSON documents. |
| **Date range / history** | Custom `start_date`/`end_date` plus fixed ranges up to `This Year` / `Last Year` are supported, so **historical data is available** (bounded by what your KDP/Publisher Champ account itself holds). A maximum-range cap, if any, isn't enforced client-side and couldn't be probed. |
| **Currency** | Server-side currency conversion supported via `currency` (default USD); `countryStats` explicitly notes "currency conversion." |
| **BookBub** | **Absent — confirmed.** No `bookbub` string anywhere in the repo. The app's only external data/service hosts are: `api.anthropic.com`, `api.post-bridge.com`, `api.resend.com`, `www.googleapis.com` (Gemini), `www.tiktok.com`, and `www.publisherchamp.com`. Publisher Champ is a KDP/Amazon-ads data source; there is no BookBub data in this pipeline, as you expected. |

---

## 6. Ready-to-run read-only probes (GET only)

I could not run these from here (§7), but you (or a session on an allowed network) can. **All GET, nothing mutating.** Fill in `KEY` and `ACCT`, then each writes one sample into `pc_api_samples/`.

```bash
KEY="YOUR_PC_API_KEY"
ACCT="YOUR_ACCOUNT_UUID"
BASE="https://www.publisherchamp.com/api/v1"
mkdir -p pc_api_samples

# 1. Accounts (account_id intentionally blank, per the app)
curl -sG "$BASE/listAccountsAPI/" \
  --data-urlencode "api_key=$KEY" --data-urlencode "account_id=" \
  -o pc_api_samples/listAccountsAPI.json

# 2. Book stats — last 7 days
curl -sG "$BASE/bookStatsAPI/" \
  --data-urlencode "api_key=$KEY" --data-urlencode "account_id=$ACCT" \
  --data-urlencode "fixed_range_selection=Last 7 days" \
  --data-urlencode "currency=USD" \
  --data-urlencode "include_country_breakdown=true" \
  --data-urlencode "include_platform_breakdown=true" \
  -o pc_api_samples/bookStatsAPI.json

# 3. Author stats — last 7 days
curl -sG "$BASE/authorStatsAPI/" \
  --data-urlencode "api_key=$KEY" --data-urlencode "account_id=$ACCT" \
  --data-urlencode "fixed_range_selection=Last 7 days" \
  --data-urlencode "currency=USD" \
  -o pc_api_samples/authorStatsAPI.json

# 4. Ads monitoring — last 7 days  (the granularity question)
curl -sG "$BASE/adsMonitoringAPI/" \
  --data-urlencode "api_key=$KEY" --data-urlencode "account_id=$ACCT" \
  --data-urlencode "fixed_range_selection=Last 7 days" \
  --data-urlencode "currency=USD" \
  -o pc_api_samples/adsMonitoringAPI.json

# 5. Country stats — last 7 days
curl -sG "$BASE/countryStatsAPI/" \
  --data-urlencode "api_key=$KEY" --data-urlencode "account_id=$ACCT" \
  --data-urlencode "fixed_range_selection=Last 7 days" \
  --data-urlencode "currency=USD" \
  -o pc_api_samples/countryStatsAPI.json
```

To grab the full Swagger spec (to find any endpoints the app doesn't use):

```bash
curl -s "https://www.publisherchamp.com/api-docs/?format=openapi" -o pc_api_samples/_openapi.json
# if that 404s, open /api-docs/ and read the SwaggerUIBundle `url:` field for the real spec path
```

---

## 7. What blocked live probing

Steps 3 (save real sample responses) and the full-Swagger part of step 2 could not be completed **from this environment**, for two independent reasons:

1. **Egress policy blocks the domain.** This sandbox routes outbound traffic through a policy-enforcing proxy that **denies `www.publisherchamp.com`** — confirmed by the proxy status endpoint: `connect_rejected … gateway answered 403 to CONNECT … host: www.publisherchamp.com:443`. The proxy README explicitly says to report the blocked host rather than route around it. (The deployed Vercel app reaches the API fine because it runs on Vercel's network, not this one.)
2. **No credentials available to me.** As shown in §2, the `api_key` and `account_id` are only in your browser's `localStorage`, not in the repo or Vercel env. Even with the domain unblocked, I'd need you to supply them.

**To finish live probing (all read-only), either:**
- run the §6 commands yourself from any normal machine with your key + account UUID, and share the JSON back; **or**
- provide the `api_key` + `account_id` **and** get `www.publisherchamp.com` allow-listed in this environment's egress policy, and I'll run the GET-only sweep, save one sample per endpoint into `pc_api_samples/`, and verify the exact ads field names against the live response.

I did **not** fabricate any sample responses or field values — every concrete fact here is traceable to a source file cited above.
