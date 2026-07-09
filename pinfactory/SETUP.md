# pinfactory — Setup

This guide covers everything you set up once: installing the app, building your
catalogue, and (for publishing, Component 3) creating a Pinterest app, applying
for API access, and authorizing your business account. The Pinterest sections
were verified against the current Pinterest API **v5** documentation
(developers.pinterest.com) in July 2026 — see the notes for anything Pinterest
may have changed since.

> **Status:** Component 1 (image generator) is built and ready. Components 2
> (copy generator) and 3 (Pinterest scheduler) are built after you approve the
> sample images. The Pinterest setup below is documented now so you can start
> the API-access application in parallel — it takes time on Pinterest's side.

---

## 1. Install

```bash
cd pinfactory
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

Only `Pillow`, `PyYAML`, and `python-dotenv` are needed for Component 1;
`anthropic` and `requests` are for Components 2 and 3.

Run any command with:

```bash
python -m pinfactory <command>          # e.g. python -m pinfactory --help
```

pinfactory works out of a **project folder** (the "home") that holds your
`.env`, `themes.yaml`, `keywords.yaml`, `config.yaml`, `covers/`, and the
generated `pinfactory.db`. By default that's the current directory. Point it
elsewhere with `--home /path/to/project` or `PINFACTORY_HOME`.

---

## 2. Create your project

```bash
mkdir my-books && cd my-books
python -m pinfactory --home . scaffold      # writes themes.yaml, keywords.yaml, config.yaml, .env.example, covers/
cp .env.example .env                         # then fill in secrets (below)
```

Put one cover image per book in `covers/`. **The filename stem is the book's
slug** (e.g. `covers/the-thornwood-vow.png` → slug `the-thornwood-vow`).

---

## 3. Build your catalogue

Interactive wizard (walks every cover file, asks you for metadata — it never
invents titles, links, or tropes; blank stays blank):

```bash
python -m pinfactory init
```

Or bulk-edit in a spreadsheet instead:

```bash
python -m pinfactory export catalog.csv     # export current catalogue (empty at first, but gives you the columns)
# edit catalog.csv in Excel/Sheets: slug,title,pen_name,series,subgenre,tropes,tagline,destination_url,priority,cover_path
python -m pinfactory import catalog.csv
```

`tropes` in the CSV is `;`-separated. Neither format is required — use whichever
you prefer, and you can round-trip freely.

---

## 4. Generate images (Component 1)

```bash
python -m pinfactory generate                       # all books, 4 variants each
python -m pinfactory generate --pen-name "Ava Sinclair"
python -m pinfactory generate --slug the-thornwood-vow --variant headline
python -m pinfactory generate --refresh             # new random seeds → fresh creatives
```

Output lands in `output/<pen name>/<slug>/`. Edit `themes.yaml` to set a colour
palette and fonts per pen name; any pen name not listed uses the neutral
default (the CLI tells you when it falls back).

---

## 5. Pinterest API setup (for Component 3 — do this in parallel)

Publishing requires a Pinterest **app** and, to post **publicly visible** pins,
**Standard access**. Getting Standard access involves a review that takes time,
so start now.

### 5a. Use a Pinterest **business account**

Pinterest's organic publishing and analytics are business-account features.
Convert your account (free) in Pinterest settings, or create a business
account, and authorize the app with it.

### 5b. Register an app (gets **Trial** access)

1. Go to **https://developers.pinterest.com/** and log in with your business
   account.
2. Open **My apps → Create app**. Fill in the app name and description.
3. Note your **App ID** and **App secret** → put them in `.env` as
   `PINTEREST_APP_ID` / `PINTEREST_APP_SECRET`.
4. Add a **redirect URI**. For a local app, `https://localhost:8085/callback`
   works (the app spins up a temporary local listener for the OAuth callback).
   Put the same value in `.env` as `PINTEREST_REDIRECT_URI`.

New apps start with **Trial access**.

### 5c. Understand the access tiers (important)

| Capability | Trial access | Standard access |
| --- | --- | --- |
| OAuth to your own account | ✅ | ✅ |
| Create pins | ✅ **sandbox only** (visible only to you) | ✅ **public** |
| Create/list boards | ✅ sandbox | ✅ public |
| Read real pin analytics | ❌ (sandbox has no real data) | ✅ (business account) |
| Rate limit | ~1,000 requests/day per app | per-minute, per-user buckets |

**The key point:** a **Trial** app cannot publish a *publicly visible* pin — pins
you create under Trial live only in the **sandbox** (`api-sandbox.pinterest.com`)
and are visible only to you. You can fully build and test pinfactory against the
sandbox now; to actually reach readers you need **Standard access**.

`.env` ships pointing at the sandbox:

```
PINTEREST_API_BASE=https://api-sandbox.pinterest.com/v5
```

Switch it to `https://api.pinterest.com/v5` once you have Standard access.

### 5d. Apply for **Standard access**

From your app's management page, submit for review. Pinterest's common
requirements (and the usual rejection reasons):

1. A **clear, complete app description** of what the app does.
2. A **publicly reachable privacy policy URL** on a domain tied to you/your app
   (the link must fully load).
3. A **demo video** showing the app performing a real Pinterest API action **and
   including the user OAuth authorization flow** — omitting the auth flow is the
   most common reason reviews are rejected.
4. Compliance with Pinterest's Developer Guidelines.

Approval upgrades the app to Standard; then switch `PINTEREST_API_BASE` to
production.

### 5e. Scopes pinfactory requests

The confidential OAuth flow (Component 3) requests exactly:

```
boards:read, boards:write, pins:read, pins:write, user_accounts:read
```

- `pins:write` **and** `boards:write` — creating a pin requires board write
  permission, not just `pins:write`.
- `pins:read` — reading pins and pin analytics.
- `user_accounts:read` — your account + account-level analytics.

(Add the `*_secret` scope variants only if you work with secret boards.)

### 5f. Authorize (Component 3 will automate this)

The OAuth 2.0 flow pinfactory will implement (documented here so you know what
to expect):

1. Open `https://www.pinterest.com/oauth/` with `client_id`, `redirect_uri`,
   `response_type=code`, the comma-separated `scope`, and a `state` value.
2. You approve; Pinterest redirects to your `redirect_uri` with a `code`.
3. The app exchanges the code at `https://api.pinterest.com/v5/oauth/token`
   (POST, `application/x-www-form-urlencoded`, `Authorization: Basic
   base64(client_id:client_secret)`, `grant_type=authorization_code`).
4. Pinterest returns an **access token (valid 30 days)** and a **refresh token
   (valid 60 days, indefinitely renewable)**. pinfactory stores them in `.env`
   (`PINTEREST_ACCESS_TOKEN` / `PINTEREST_REFRESH_TOKEN`) and refreshes the
   access token proactively before it expires, so you set up once and it keeps
   running for months.

For a Trial app you can skip the full flow and generate a **sandbox test token**
from **My apps → Manage → Generate Access Token** (all scopes, sandbox-only) to
develop against.

### 5g. How pins are published

Component 3 will create pins via `POST /v5/pins` with a `board_id`, `title`,
`description`, `link` (your destination URL), `alt_text`, and a `media_source`.
For a straightforward image pin there is **no separate upload endpoint** — the
image is sent inline as base64 (`source_type: image_base64`) so pinfactory
doesn't need to host your images anywhere. Pinterest's preferred image is a
**2:3, 1000×1500 px** JPEG/PNG — exactly what Component 1 produces.

### 5h. Analytics (Component 3 `stats`)

Real pin/account analytics require **Standard access + a business account**.
Metrics available include `IMPRESSION`, `SAVE`, `PIN_CLICK`, and
`OUTBOUND_CLICK` via `GET /v5/pins/{pin_id}/analytics` and
`GET /v5/user_account/analytics` (data is available for roughly the last ~90
days and lags ~1–2 days). If your access tier can't read analytics, `stats`
will say so plainly rather than show fabricated numbers.

---

## 6. Boards, publishing & scheduling (Component 3)

Once authorized, the publish workflow is:

```bash
python -m pinfactory boards --propose      # drafts 5–8 themed boards per pen name from your tropes
python -m pinfactory boards --list         # review the drafts
python -m pinfactory boards --approve       # approve them (interactive y/N)
python -m pinfactory boards --create        # create on Pinterest, or map to boards you already have
python -m pinfactory publish --dry-run      # dry run: does everything except the publish API call
python -m pinfactory publish                # publish the next eligible approved pins
python -m pinfactory stats --digest         # analytics (if your tier allows) + weekly digest
```

Only **approved** copy is eligible, each pin is routed to its most
semantically-aligned board, and all the anti-spam rules from `config.yaml` are
enforced automatically (weekly cap, 48h URL spacing, one 5-day re-save,
round-robin, backoff, quarantine).

### Run it on a schedule (hands-off)

The cadence rules mean over-scheduling is harmless — `publish` only acts when a
pin is genuinely eligible, so running it a few times a day is fine.

**Linux / WSL (cron)** — `crontab -e`, then (adjust the path and `--home`):

```cron
# publish a few times a day; write the weekly digest on Sunday nights
0 9,15,20 * * *  cd /path/to/my-books && /path/to/.venv/bin/python -m pinfactory --home . publish >> pinfactory.log 2>&1
0 21     * * 0  cd /path/to/my-books && /path/to/.venv/bin/python -m pinfactory --home . stats --digest >> pinfactory.log 2>&1
```

**macOS (launchd)** — create `~/Library/LaunchAgents/com.pinfactory.publish.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.pinfactory.publish</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/.venv/bin/python</string>
    <string>-m</string><string>pinfactory</string>
    <string>--home</string><string>/path/to/my-books</string>
    <string>publish</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/my-books</string>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>15</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/path/to/my-books/pinfactory.log</string>
  <key>StandardErrorPath</key><string>/path/to/my-books/pinfactory.log</string>
</dict></plist>
```

Then load it: `launchctl load ~/Library/LaunchAgents/com.pinfactory.publish.plist`.

**Token upkeep:** the Pinterest access token lasts 30 days and the refresh token
60 (indefinitely renewable). `publish` auto-refreshes the access token on a 401
mid-run; to refresh proactively, add a periodic `python -m pinfactory auth
--refresh`.

---

## Verification notes

The Pinterest facts above were confirmed against the current v5 docs, Pinterest's
own GitHub/Postman references, in July 2026. A few details to re-confirm on the
(bot-blocked) doc pages before you rely on them in production: exact
API-enforced image byte ceiling, the precise analytics max date-range window,
and Pinterest's exact wording on the business-account requirement for posting.
None affect Component 1.
