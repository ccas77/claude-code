# Applying for Pinterest Standard access — a ready-to-use kit

Publishing **public** Pins requires your Pinterest app to be upgraded from Trial
to **Standard access**. This is the real bottleneck — it needs a short
application and a few days of review — so start it early. This file gives you
everything to submit, so you don't have to write it from scratch.

Where to submit: <https://developers.pinterest.com/> → **My apps** → your app →
request Standard access. (Overview of the whole flow is in `SETUP.md` §5.)

Pinterest asks for three things. Here they are, filled in as far as possible.

---

## 1. App description (paste this, tweak the bracketed bits)

> **pinfactory** is a self-hosted tool I use to market my own books on Pinterest.
> I am an independent author with [NUMBER] titles across several pen names.
> After I authorize my own Pinterest business account, the app uses the Pinterest
> API v5 to:
>
> - create and organize a small set of themed boards on my account
>   (`GET/POST /v5/boards`),
> - publish vertical (1000×1500) Pins for my books, each with a
>   reader-focused title, description, and a link to the book's page
>   (`POST /v5/pins`), on a slow, spaced-out schedule, and
> - read the resulting Pins' analytics to see what resonates
>   (`GET /v5/pins/{pin_id}/analytics`).
>
> It only ever acts on my own account and my own content. It publishes at a
> conservative cadence (a configurable weekly cap, at least 48 hours between
> Pins that share a destination link, and no duplicate images) specifically to
> stay well within Pinterest's spam guidelines. It does not act on behalf of
> other users, scrape Pinterest, or collect other people's data.
>
> Scopes requested: `boards:read`, `boards:write`, `pins:read`, `pins:write`,
> `user_accounts:read`.

## 2. Privacy policy URL

Pinterest requires a **publicly loadable** privacy policy on a domain tied to
your app. A ready template is included: **`pinfactory/web/privacy.html`**.

To get a URL for it, host the `pinfactory/web/` folder (it's just static HTML):

- **Vercel:** <https://vercel.com/new> → import your repo → set Root Directory to
  `pinfactory/web` → Deploy. Your policy is then at
  `https://<your-project>.vercel.app/privacy.html`.
- **GitHub Pages / Netlify / Cloudflare Pages** work the same way.

Before submitting, open `privacy.html` and replace every `[BRACKETED]`
placeholder (your name, contact email, date). Make sure the link fully loads in
a fresh browser — a policy that doesn't load is a common rejection reason.

## 3. Demo video (the most common rejection reason)

Record a short screen capture (2–4 min) that shows the app performing a **real**
Pinterest API action **and includes the OAuth authorization flow** — reviewers
reject videos that skip the login/authorize step. Suggested script:

1. Start the app and run `pinfactory auth`; open the printed Pinterest
   authorization URL.
2. **On camera, approve access** with your Pinterest business account and get
   redirected back (this is the step reviewers must see).
3. Run `pinfactory boards --create` — show a board being created on your account.
4. Run `pinfactory publish` (or `--dry-run` then show one real Pin) — show a Pin
   appearing on your Pinterest account.
5. Optionally show `pinfactory stats` reading the Pin's analytics.

Keep it simple and real; no narration polish needed.

---

## While you wait

Standard access review takes a few days. You can do everything else in the
meantime against Pinterest's **sandbox** (`PINTEREST_API_BASE=
https://api-sandbox.pinterest.com/v5`) — set up your catalogue, generate images,
approve copy, and test `publish --dry-run`. The moment Standard access is
granted, switch `PINTEREST_API_BASE` to `https://api.pinterest.com/v5` and your
scheduler (local cron or the GitHub Actions workflow) starts posting for real.
