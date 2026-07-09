# Running the scheduler in the cloud (GitHub Actions)

pinfactory is a local tool, but you don't want to leave your laptop on for
months. This GitHub Actions workflow runs the **`publish` scheduler in the
cloud** on a cron, so pins go out on schedule without your machine. The creative
and approval work still happens locally — Actions only publishes what you've
already approved.

Workflow file: [`.github/workflows/pinfactory-publish.yml`](../../.github/workflows/pinfactory-publish.yml)

## How it works

Each run, on a GitHub-hosted machine:

1. Checks out your repo (which contains your catalogue directory).
2. Writes a temporary `.env` from your GitHub **Secrets** (never committed).
3. **Regenerates the pin images** from your covers. Seeds are deterministic, so
   this reproduces the exact same images (and content hashes) — images don't
   need to live in git.
4. Runs `pinfactory publish` (real, or `--dry-run` for a manual test), enforcing
   every cadence/anti-spam rule.
5. **Commits the updated SQLite DB back to the repo** so the next run resumes —
   the weekly cap, 48-hour spacing, never-publish-twice, and re-save timing all
   persist across runs.

A second cron writes the weekly digest on Sundays.

## One-time setup

### 1. Prepare your catalogue locally

Do the interactive/creative steps on your own machine (these need your input):

```bash
python -m pinfactory --home my-books scaffold
# add covers to my-books/covers/, then:
python -m pinfactory --home my-books init
python -m pinfactory --home my-books generate
python -m pinfactory --home my-books copy           # real copy (needs ANTHROPIC_API_KEY)
python -m pinfactory --home my-books review          # approve everything you want published
python -m pinfactory --home my-books boards --propose && \
python -m pinfactory --home my-books boards --approve && \
python -m pinfactory --home my-books boards --create
python -m pinfactory --home my-books auth            # authorize Pinterest, saves tokens to .env
```

### 2. Commit your catalogue directory

Put the catalogue folder under `pinfactory/` (default name `my-books/`) and
commit it. It should contain `covers/`, `config.yaml`, `themes.yaml`,
`keywords.yaml`, and `pinfactory.db`. **The DB is gitignored globally, so
force-add it:**

```bash
git add pinfactory/my-books/covers pinfactory/my-books/*.yaml
git add -f pinfactory/my-books/pinfactory.db
git commit -m "Add my pinfactory catalogue"
git push
```

> **Use a PRIVATE repo.** Your covers, catalogue, and DB are your data. (Secrets
> live in Actions Secrets and are never committed; the `.env` is written only on
> the runner and never committed.) Don't commit `my-books/.env`.

### 3. Add repository Secrets

**Settings → Secrets and variables → Actions → Secrets → New repository secret:**

| Secret | Value |
|---|---|
| `PINTEREST_APP_ID` | your Pinterest app id |
| `PINTEREST_APP_SECRET` | your Pinterest app secret |
| `PINTEREST_ACCESS_TOKEN` | from `pinfactory auth` (the value written into `.env`) |
| `PINTEREST_REFRESH_TOKEN` | from `pinfactory auth` |
| `ANTHROPIC_API_KEY` | only if you want the cloud run to (re)generate copy; usually you generate copy locally, so this is optional |

### 4. (Optional) add repository Variables

**…Actions → Variables:**

| Variable | Default | When to set |
|---|---|---|
| `PINFACTORY_HOME` | `my-books` | if your catalogue dir has a different name |
| `PINTEREST_API_BASE` | `https://api.pinterest.com/v5` | it defaults to production; set to the sandbox URL while testing |
| `PINTEREST_REDIRECT_URI` | `http://localhost:8085/callback` | match your app's redirect |
| `ANTHROPIC_MODEL` | `claude-opus-4-8` | to change the copy model |

### 5. Activate

- **Test first:** Actions tab → *pinfactory publish* → **Run workflow** → tick
  **Dry run** → Run. Check the logs — it should generate images and report what
  it *would* publish.
- **Go live:** scheduled workflows only fire from the repo's **default branch**,
  so merge this to `main`. The cron (`0 9,15,20 * * *` UTC) then runs 3×/day.

## Adjusting the schedule

Edit the `cron:` lines in the workflow. Times are UTC. Over-scheduling is
harmless — the cadence rules mean a run only publishes when a pin is genuinely
eligible.

## Token upkeep

`publish` auto-refreshes the 30-day access token on a 401 using your refresh
token, so short-lived tokens self-heal. The refresh token lasts 60 days and is
renewable; if Pinterest ever invalidates it, re-run `pinfactory auth` locally
and update the `PINTEREST_ACCESS_TOKEN` / `PINTEREST_REFRESH_TOKEN` secrets.

## Notes & tradeoffs

- The workflow commits a small **state snapshot** (the DB) after each run. Pushes
  made with the built-in `GITHUB_TOKEN` do **not** trigger other workflows, so
  there's no CI loop. Over months this adds commits; you can squash/prune the
  history, or point the persistence at a dedicated branch if you prefer.
- Real publishing requires Pinterest **Standard access** (see `SETUP.md` §5) —
  until then, keep `PINTEREST_API_BASE` on the sandbox and use **Dry run**.
- If your catalogue directory isn't committed yet, the workflow detects that and
  **skips cleanly** (no error), so it's safe to merge before you're ready.
