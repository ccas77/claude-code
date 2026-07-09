# pinfactory

A local, self-hosted Pinterest **organic-traffic engine** for an indie author
with many books across multiple pen names. It turns your book covers + catalogue
metadata into a steady stream of Pinterest pins, written for reader search, and
publishes them on a slow, anti-spam-safe cadence via the Pinterest API.

Three components:

1. **Pin image generator** — 1000×1500 (2:3) PNGs, four template variants per
   book, per-pen-name palettes, deterministic seeds. *(Built — see below.)*
2. **Pin copy generator** — reader-search titles + descriptions via the
   Anthropic API, a keyword bank, and a local approval gallery. *(Built.)*
3. **Boards + scheduler** — Pinterest API v5 publishing with cadence/spacing
   rules and analytics. *(Built.)*

All state lives in a local SQLite database, so a run can crash — or you can walk
away for a month — and the next run resumes cleanly.

Read [`SETUP.md`](SETUP.md) for install, catalogue, and Pinterest-API steps.

---

## Quick start (Component 1)

```bash
pip install -r requirements.txt

# in a fresh project folder:
python -m pinfactory --home . scaffold        # themes.yaml, keywords.yaml, config.yaml, .env.example, covers/
# drop one cover image per book into covers/ (filename stem = book slug)
python -m pinfactory init                      # interactive catalogue builder
python -m pinfactory generate                  # render pin images
```

Output lands in `output/<pen name>/<slug>/`.

## Commands

| Command | What it does |
| --- | --- |
| `init` | Interactive catalogue builder — walks each cover file, asks for metadata. |
| `import` / `export` | Bulk-edit the catalogue as CSV or JSON. |
| `generate` | **Component 1** — render the five pin variants per book. |
| `list` | Show the catalogue and how many images each book has. |
| `scaffold` | Write starter `themes.yaml` / `keywords.yaml` / `config.yaml` / `.env.example`. |
| `copy` | **Component 2** — write pin titles + descriptions (Anthropic API, or `--mock` offline). |
| `review` | **Component 2** — local approve/reject/edit gallery (`--static` for a snapshot). |
| `keywords` | **Component 2** — per-subgenre keyword bank + `--suggest`. |
| `auth` | **Component 3** — Pinterest OAuth (prints the URL; `--code`/`--refresh`). |
| `boards` | **Component 3** — propose/approve/create themed boards. |
| `publish` | **Component 3** — the Pinterest scheduler (`--dry-run`, `--limit`). |
| `stats` | **Component 3** — analytics table + weekly digest (`--digest`). |

## Publish (Component 3)

```bash
python -m pinfactory auth                     # authorize your Pinterest business account (see SETUP.md)
python -m pinfactory boards --propose         # draft 5–8 themed boards per pen name from your tropes
python -m pinfactory boards --approve         # approve them (interactive)
python -m pinfactory boards --create          # create on Pinterest (or --dry-run to simulate)
python -m pinfactory publish --dry-run        # everything except the actual publish call
python -m pinfactory publish                  # publish the next eligible approved pins
python -m pinfactory stats --digest           # analytics table + weekly digest markdown
```

The scheduler enforces every anti-spam rule automatically: the weekly cap
(default 10), the same image never twice, ≥48h between publishes of the same
destination URL, round-robin across pen names/boards with `priority` books
first, one extra-board re-save after 5 days then never again, exponential
backoff on rate limits, and quarantine after repeated failures — it never
crashes the queue. Set it on a schedule (cron/launchd) per SETUP.md and it runs
hands-off for months.

**Prefer the cloud?** A ready-made GitHub Actions workflow runs the scheduler
on a cron without your machine on — see
[`docs/GITHUB_ACTIONS.md`](docs/GITHUB_ACTIONS.md).

## Copy + review (Component 2)

```bash
python -m pinfactory keywords --seed              # load approved phrases from keywords.yaml
python -m pinfactory keywords --suggest "dark romance"   # propose more (you approve each)
python -m pinfactory copy                          # write copy via the Anthropic API (ANTHROPIC_API_KEY in .env)
python -m pinfactory copy --mock                   # or assemble offline from metadata (no key / no tokens)
python -m pinfactory review                        # approve/reject/edit at http://127.0.0.1:8000
```

- Copy is keyword-first titles (≤100 chars) + reader-search descriptions (≤500,
  soft CTA, no hashtags), varied across a book's variants.
- The model only uses your tropes/subgenre/voice notes + **approved** keywords —
  it never invents plot, quotes, or facts.
- Everything lands as `draft` and **nothing is eligible to publish until you
  approve it** in the review gallery. Blank trope-hooks get a drafted suggestion
  you approve there too.

## The image variants

Five templates are generated per book by default:

- **headline** — cover on a moody, genre-appropriate background with a headline overlay.
- **trope_hook** — cover mockup with a **hook line** (see below).
- **quote_card** — a quote card built from the tagline you supply per book (skipped if none).
- **comp_card** — an "if you love X, you'll love this" comp card, text only from your own metadata (never another author's cover).
- **tropes_checklist** — a "this book has ✓ …" checklist of the book's trope tags (the high-save Pinterest/BookTok "tropes" pin).

One more is available on demand: **stats_card** — an "at a glance" spec sheet
(subgenre / series / tropes). Render it with `generate --variant stats_card`.

Each variant is a distinct image *and* (with Component 2) distinct copy, which
keeps Pinterest from treating variants as duplicate spam.

### The trope-hook line (hybrid)

The `trope_hook` pin's overlay text comes from, in order of preference:

1. a **hook** you write per book (in `init` or the CSV `hook` column), else
2. a hook **drafted by Component 2** from your tropes that **you approve/edit**
   in the review gallery (never shown until approved), else
3. your **real trope tags** as a safe fallback.

Nothing is ever fabricated — on-image copy is either written by you, approved by
you, or drawn straight from your metadata.

## Design principles baked in

- **No fabricated data.** The app asks you or leaves fields blank — it never
  invents titles, links, tropes, or stats.
- **Anti-spam by design.** Configurable weekly cap, the same image is never
  published twice (enforced by a content hash in the manifest), the same URL is
  spaced ≥48h apart across boards, and every variant differs in image and copy.
- **Everything resumable.** All state is in `pinfactory.db`.
- **Nothing pulled from the internet for imagery.** Backgrounds are generated
  programmatically (gradients, grain, vignette, blurred/tinted cover) unless you
  supply your own licensed `textures/` folder.

## Fonts

Two to three open-licensed Google Fonts are bundled in `fonts/` (SIL Open Font
License). See [`fonts/FONTS.md`](fonts/FONTS.md).

## Demo

`demo/` contains a runnable example with three **clearly-labelled placeholder**
covers (stamped "DEMO PLACEHOLDER" — not real books) so you can see the output
before adding your own catalogue:

```bash
PYTHONPATH=. python demo/make_demo_assets.py
python -m pinfactory --home demo import demo/catalog.csv
python -m pinfactory --home demo generate
```

Sample outputs are committed in `demo/samples/`.
