"""pinfactory command-line interface.

Commands:
  init       Interactive catalogue builder (walks your cover files).
  generate   Component 1 — render 1000x1500 pin images (4 variants/book).
  import     Load catalogue rows from a CSV/JSON file.
  export     Write the catalogue to a CSV/JSON file for bulk editing.
  review     Component 2 — local HTML approval gallery.        (built next)
  keywords   Component 2 — per-subgenre keyword bank + suggest. (built next)
  publish    Component 3 — the Pinterest scheduler.            (built last)
  stats      Component 3 — analytics table + weekly digest.    (built last)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from . import boards as boardsmod
from . import catalog as catalogmod
from . import copy_gen as copymod
from . import db as dbmod
from . import keywords as kwmod
from . import review as reviewmod
from . import scheduler as schedmod
from . import stats as statsmod
from .config import Config, load_config, load_env
from .images import ALL_VARIANTS, ImageGenerator, OPTIONAL_VARIANTS, VARIANTS, find_covers
from .pinterest import PinterestClient, PinterestError
from .themes import ThemeSet


def _mk_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="pinfactory", description="Local Pinterest engine for a book catalogue.")
    p.add_argument("--home", help="Project root (default: $PINFACTORY_HOME or cwd).")
    p.add_argument("--version", action="version", version=f"pinfactory {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="Interactive catalogue builder.")

    g = sub.add_parser("generate", help="Render pin images (Component 1).")
    g.add_argument("--slug", action="append", help="Only this book slug (repeatable).")
    g.add_argument("--pen-name", help="Only books for this pen name.")
    g.add_argument("--variant", action="append", choices=ALL_VARIANTS,
                   help="Only these variants (repeatable). Default set: " + ", ".join(VARIANTS) +
                        f"; also available: {', '.join(OPTIONAL_VARIANTS)}.")
    g.add_argument("--refresh", action="store_true", help="Bump the seed to make fresh creatives.")
    g.add_argument("--force", action="store_true", help="Overwrite even if the image content matches an existing one.")

    imp = sub.add_parser("import", help="Import catalogue from CSV/JSON.")
    imp.add_argument("path", help="Path to a .csv or .json file.")

    exp = sub.add_parser("export", help="Export catalogue to CSV/JSON.")
    exp.add_argument("path", nargs="?", default="catalog.csv", help="Output .csv or .json (default catalog.csv).")

    sub.add_parser("list", help="Show the catalogue and image manifest.")
    sub.add_parser("scaffold", help="Create starter themes.yaml / keywords.yaml / config.yaml / .env.example here.")

    # Component 2
    cp = sub.add_parser("copy", help="Generate pin copy (Component 2).")
    cp.add_argument("--slug", action="append", help="Only this book slug (repeatable).")
    cp.add_argument("--pen-name", help="Only books for this pen name.")
    cp.add_argument("--mock", action="store_true", help="Offline template backend (no API key / tokens).")
    cp.add_argument("--model", help="Override the Anthropic model (default: ANTHROPIC_MODEL or config).")
    cp.add_argument("--overwrite-approved", action="store_true", help="Also regenerate already-approved copy.")

    rv = sub.add_parser("review", help="Local approval gallery (Component 2).")
    rv.add_argument("--port", type=int, default=8000, help="Server port (default 8000).")
    rv.add_argument("--static", action="store_true", help="Write a self-contained HTML snapshot instead of serving.")

    kw = sub.add_parser("keywords", help="Keyword bank + suggestions (Component 2).")
    kw.add_argument("--subgenre", help="Show phrases for this subgenre.")
    kw.add_argument("--suggest", metavar="SUBGENRE", help="Propose new phrases (needs approval).")
    kw.add_argument("--seed", action="store_true", help="(Re)load approved phrases from keywords.yaml.")
    kw.add_argument("--mock", action="store_true", help="Offline suggestions (no API key).")
    kw.add_argument("--model", help="Override the Anthropic model.")

    # Component 3
    au = sub.add_parser("auth", help="Pinterest OAuth (Component 3).")
    au.add_argument("--code", help="Exchange this authorization code for tokens.")
    au.add_argument("--refresh", action="store_true", help="Refresh the access token now.")

    bd = sub.add_parser("boards", help="Board strategy (Component 3).")
    bd.add_argument("--propose", action="store_true", help="Draft boards from your tropes.")
    bd.add_argument("--approve", action="store_true", help="Approve proposed boards interactively.")
    bd.add_argument("--create", action="store_true", help="Create approved boards on Pinterest (or map existing).")
    bd.add_argument("--list", action="store_true", help="List boards and their status.")
    bd.add_argument("--pen-name", help="Limit to one pen name.")
    bd.add_argument("--dry-run", action="store_true", help="Simulate creation (no API calls).")

    pub = sub.add_parser("publish", help="Publish scheduler (Component 3).")
    pub.add_argument("--dry-run", action="store_true", help="Do everything except call the publish endpoint.")
    pub.add_argument("--limit", type=int, help="Publish at most N pins this run.")

    st = sub.add_parser("stats", help="Analytics + weekly digest (Component 3).")
    st.add_argument("--digest", action="store_true", help="Write the weekly digest markdown file.")
    st.add_argument("--days", type=int, default=30, help="Analytics window in days (default 30).")
    st.add_argument("--no-fetch", action="store_true", help="Skip the API analytics fetch; just show stored data.")
    return p


# --------------------------------------------------------------------------- #
# Command handlers
# --------------------------------------------------------------------------- #
def _select_books(database: dbmod.DB, args) -> list:
    books = database.list_books()
    if getattr(args, "slug", None):
        wanted = set(args.slug)
        books = [b for b in books if b["slug"] in wanted]
    if getattr(args, "pen_name", None):
        books = [b for b in books if b["pen_name"] == args.pen_name]
    return books


def cmd_generate(cfg, database, args) -> int:
    books = _select_books(database, args)
    if not books:
        print("No matching books in the catalogue. Run `pinfactory init` (or `import`) first.")
        return 1
    themeset = ThemeSet(cfg.themes_path, cfg.fonts_dir)
    gen = ImageGenerator(cfg, themeset, database)

    total_ok = total_skip = 0
    for book in books:
        theme = themeset.for_pen_name(book["pen_name"])
        note = "  (default palette — pen name not in themes.yaml)" if theme.is_fallback and book["pen_name"] else ""
        print(f"\n{book['slug']}  ·  {book['title'] or '(untitled)'}  ·  {book['pen_name'] or 'unassigned'}{note}")
        results = gen.generate_book(book, variants=args.variant, refresh=args.refresh, force=args.force)
        for r in results:
            if r.skipped:
                total_skip += 1
                print(f"   ⤫ {r.variant:<11} skipped — {r.reason}")
            else:
                total_ok += 1
                print(f"   ✓ {r.variant:<11} {r.path.name}  [{r.content_hash[:12]}]")
    print(f"\nDone. {total_ok} image(s) written, {total_skip} skipped.")
    print(f"Output: {cfg.output_dir}/")
    return 0


def cmd_list(cfg, database, args) -> int:
    books = database.list_books()
    if not books:
        print("Catalogue is empty. Run `pinfactory init` or `import`.")
        return 0
    print(f"Catalogue: {len(books)} book(s)\n")
    for b in books:
        imgs = database.list_images(b["slug"])
        tropes = ", ".join(dbmod.book_tropes(b)) or "—"
        print(f"  {b['slug']:<28} {b['pen_name'] or '—':<18} {b['subgenre'] or '—':<20} "
              f"{len(imgs)} img  · tropes: {tropes}")
    return 0


def cmd_copy(cfg, database, args) -> int:
    books = _select_books(database, args)
    if not books:
        print("No matching books. Run `pinfactory init`/`import`, then `generate`.")
        return 1
    if not database.list_images():
        print("No images yet — run `pinfactory generate` first (copy is written per image).")
        return 1
    # ensure the keyword bank is seeded from keywords.yaml
    if not kwmod.counts_by_subgenre(database):
        seeded = kwmod.seed_from_yaml(cfg, database)
        if seeded:
            print(f"Seeded {seeded} approved keyword(s) from keywords.yaml.")
    backend = copymod.make_backend(cfg, args.mock, args.model)
    if args.mock:
        print("⚠ --mock: copy is assembled offline from your metadata/keywords — "
              "NOT model-generated. Use without --mock (with your ANTHROPIC_API_KEY) for real copy.")
    else:
        print(f"Generating copy with the Anthropic API (model: {backend.model}).")
    try:
        gen = copymod.CopyGenerator(cfg, database, backend)
        stats = gen.generate_for_books(books, overwrite_approved=args.overwrite_approved)
    except RuntimeError as e:
        print(f"\nError: {e}")
        return 1
    except Exception as e:  # surface API/auth errors cleanly
        print(f"\nCopy generation failed: {type(e).__name__}: {e}")
        print("If this is an auth error, set ANTHROPIC_API_KEY in .env, or use --mock to test offline.")
        return 1
    print(f"\nWrote copy for {stats['copy']} image(s); "
          f"{stats['hooks']} hook suggestion(s); kept {stats['kept_approved']} approved as-is.")
    print("Next: `pinfactory review` to approve/reject/edit before anything can publish.")
    return 0


def cmd_review(cfg, database, args) -> int:
    if args.static:
        out = reviewmod.write_static(cfg)
        print(f"Wrote static snapshot: {out}")
        print("Open it in a browser (read-only). Use `pinfactory review` to approve/edit.")
        return 0
    reviewmod.serve(cfg, port=args.port)
    return 0


def cmd_keywords(cfg, database, args) -> int:
    if args.seed:
        n = kwmod.seed_from_yaml(cfg, database)
        print(f"Seeded {n} new approved keyword(s) from keywords.yaml.")
        return 0
    if args.suggest:
        subgenre = args.suggest
        existing = [r["phrase"] for r in kwmod.list_for(database, subgenre)]
        backend = copymod.make_backend(cfg, args.mock, args.model)
        try:
            proposed = backend.suggest_keywords(subgenre, existing)
        except Exception as e:
            print(f"Suggestion failed: {type(e).__name__}: {e}")
            print("Set ANTHROPIC_API_KEY in .env, or use --mock for offline suggestions.")
            return 1
        added = kwmod.add_suggestions(database, subgenre, proposed)
        print(f"\nProposed {added} new phrase(s) for '{subgenre}' (status: suggested — "
              f"NOT used until you approve them):\n")
        # interactive approval if we have a terminal
        for r in kwmod.list_for(database, subgenre):
            if r["status"] != "suggested":
                continue
            try:
                ans = input(f"  approve  \"{r['phrase']}\"?  (y/N/q) ").strip().lower()
            except EOFError:
                ans = ""
            if ans == "q":
                break
            if ans in ("y", "yes"):
                kwmod.set_status(database, subgenre, r["phrase"], "approved")
        appr = len(kwmod.approved_for(database, subgenre))
        print(f"\n'{subgenre}' now has {appr} approved phrase(s).")
        return 0
    if args.subgenre:
        rows = kwmod.list_for(database, args.subgenre)
        if not rows:
            print(f"No keywords for '{args.subgenre}'. Add some to keywords.yaml then "
                  f"`pinfactory keywords --seed`, or `--suggest {args.subgenre}`.")
            return 0
        print(f"Keywords for '{args.subgenre}':")
        for r in rows:
            mark = {"approved": "✓", "suggested": "…", "rejected": "✗"}.get(r["status"], " ")
            print(f"  {mark} [{r['status']:<9}] {r['phrase']}")
        return 0
    # default: seed if empty, then show counts
    if not kwmod.counts_by_subgenre(database):
        kwmod.seed_from_yaml(cfg, database)
    counts = kwmod.counts_by_subgenre(database)
    if not counts:
        print("No keyword bank yet. Add phrases to keywords.yaml and run "
              "`pinfactory keywords --seed`.")
        return 0
    print("Keyword bank (approved / suggested):")
    for sub, appr, sug in counts:
        print(f"  {sub:<24} {appr} approved · {sug} suggested")
    print("\n`keywords --subgenre <s>` to list · `keywords --suggest <s>` to propose more.")
    return 0


def _make_client(cfg: Config, dry_run: bool) -> PinterestClient:
    env = load_env(cfg)
    return PinterestClient(
        app_id=env.get("PINTEREST_APP_ID", ""),
        app_secret=env.get("PINTEREST_APP_SECRET", ""),
        access_token=env.get("PINTEREST_ACCESS_TOKEN", ""),
        refresh_token=env.get("PINTEREST_REFRESH_TOKEN", ""),
        api_base=env.get("PINTEREST_API_BASE", "https://api-sandbox.pinterest.com/v5"),
        redirect_uri=env.get("PINTEREST_REDIRECT_URI", "http://localhost:8085/callback"),
        dry_run=dry_run,
    )


def _write_env(cfg: Config, updates: dict[str, str]) -> None:
    """Update or append KEY=VALUE lines in .env without disturbing the rest."""
    path = cfg.env_path
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    keys = set(updates)
    out, seen = [], set()
    for line in lines:
        k = line.split("=", 1)[0].strip() if "=" in line else ""
        if k in keys:
            out.append(f"{k}={updates[k]}"); seen.add(k)
        else:
            out.append(line)
    for k in keys - seen:
        out.append(f"{k}={updates[k]}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def cmd_auth(cfg, database, args) -> int:
    client = _make_client(cfg, dry_run=False)
    if not client.app_id or not client.app_secret:
        print("Set PINTEREST_APP_ID and PINTEREST_APP_SECRET in .env first (see SETUP.md).")
        return 1
    if args.refresh:
        try:
            b = client.refresh()
        except PinterestError as e:
            print(f"Refresh failed: {e}")
            return 1
        _write_env(cfg, {"PINTEREST_ACCESS_TOKEN": b.access_token,
                         "PINTEREST_REFRESH_TOKEN": client.refresh_token})
        print("Access token refreshed and saved to .env.")
        return 0
    if args.code:
        try:
            b = client.exchange_code(args.code)
        except PinterestError as e:
            print(f"Code exchange failed: {e}")
            return 1
        _write_env(cfg, {"PINTEREST_ACCESS_TOKEN": b.access_token,
                         "PINTEREST_REFRESH_TOKEN": client.refresh_token})
        print("Tokens saved to .env. You're authorized.")
        return 0
    # print the authorization URL for the manual flow
    import secrets
    state = secrets.token_urlsafe(12)
    print("1. Open this URL, approve with your Pinterest business account:\n")
    print("   " + client.authorization_url(state))
    print(f"\n2. Pinterest redirects to {client.redirect_uri}?code=...&state={state}")
    print("3. Copy the `code` value and run:  pinfactory auth --code <CODE>")
    return 0


def cmd_boards(cfg, database, args) -> int:
    if args.propose:
        counts = boardsmod.propose_all(database, cfg)
        total = sum(counts.values())
        print(f"Proposed {total} board(s):")
        for pen, n in counts.items():
            print(f"  {pen}: {n}")
        print("Review with `pinfactory boards --list`, then `boards --approve`.")
        return 0
    if args.approve:
        proposed = database.list_boards(pen_name=args.pen_name, status="proposed")
        if not proposed:
            print("No proposed boards. Run `pinfactory boards --propose` first.")
            return 0
        for b in proposed:
            print(f"\n  {b['name']}  ({b['pen_name']})")
            print(f"    {b['description']}")
            try:
                ans = input("    approve? (y/N/q) ").strip().lower()
            except EOFError:
                ans = ""
            if ans == "q":
                break
            if ans in ("y", "yes"):
                database.set_board_status(b["id"], "approved")
        print("\nApproved boards are ready. Run `pinfactory boards --create`.")
        return 0
    if args.create:
        client = _make_client(cfg, dry_run=args.dry_run)
        if not args.dry_run and not client.access_token:
            print("No Pinterest access token — run `pinfactory auth` first, or use --dry-run.")
            return 1
        stats = boardsmod.create_on_pinterest(database, client, only_pen=args.pen_name)
        print(f"Boards: created {stats['created']}, mapped {stats['mapped']}, errors {stats['errors']}"
              + (" (dry-run)" if args.dry_run else ""))
        return 0
    # default / --list
    boards = database.list_boards(pen_name=args.pen_name)
    if not boards:
        print("No boards yet. `pinfactory boards --propose`.")
        return 0
    for b in boards:
        mark = {"proposed": "·", "approved": "✓", "created": "●"}.get(b["status"], " ")
        pid = f"  [{b['pinterest_board_id']}]" if b["pinterest_board_id"] else ""
        print(f"  {mark} [{b['status']:<9}] {b['pen_name']:<22} {b['name']}{pid}")
    return 0


def cmd_publish(cfg, database, args) -> int:
    client = _make_client(cfg, dry_run=args.dry_run)
    if not args.dry_run and not client.access_token:
        print("No Pinterest access token — run `pinfactory auth`, or test with --dry-run.")
        return 1
    if not database.list_boards(status="created"):
        print("No created boards yet. Run `boards --propose/--approve/--create` "
              + ("(use boards --create --dry-run to simulate)." if args.dry_run else "first."))
        return 1
    rep = schedmod.publish(cfg, database, client, limit=args.limit)
    tag = " (DRY RUN — nothing actually posted)" if rep.dry_run else ""
    print(f"\nPublish run{tag}")
    print(f"  weekly: {rep.weekly_before}/{rep.weekly_cap} before this run")
    for line in rep.lines:
        print("  " + line)
    print(f"\n  published {rep.published}, re-saved {rep.resaved}, failed {rep.failed}, "
          f"quarantined {rep.quarantined}")
    print(f"  skipped — weekly cap {rep.skipped_cap}, 48h spacing {rep.skipped_spacing}, "
          f"already-published image {rep.skipped_dup}")
    return 0


def cmd_stats(cfg, database, args) -> int:
    if not args.no_fetch:
        client = _make_client(cfg, dry_run=False)
        if client.access_token:
            result = statsmod.pull_analytics(cfg, database, client, days=args.days)
            if result["ok"]:
                print(f"Fetched analytics for {result['fetched']} pin(s).")
            else:
                print(f"Analytics: {result['reason']}")
        else:
            print("Analytics: no Pinterest token set — showing stored data only "
                  "(run `pinfactory auth` and publish real pins to get analytics).")
    statsmod.print_stats(database)
    if args.digest:
        out = statsmod.write_digest(cfg, database)
        print(f"\nWrote weekly digest: {out}")
    return 0


def cmd_scaffold(cfg, database, args) -> int:
    from .scaffold import write_starter_files
    written = write_starter_files(cfg)
    for path in written:
        print(f"  wrote {path}")
    if not written:
        print("All starter files already exist — nothing overwritten.")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _mk_parser().parse_args(argv)
    cfg = load_config(args.home)

    # Commands that don't need the DB / can run before init.
    if args.command == "scaffold":
        return cmd_scaffold(cfg, None, args)

    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    database = dbmod.DB(cfg.db_path)
    try:
        if args.command == "init":
            catalogmod.init_wizard(cfg, database)
            return 0
        if args.command == "generate":
            return cmd_generate(cfg, database, args)
        if args.command == "import":
            catalogmod.import_file(cfg, database, args.path)
            return 0
        if args.command == "export":
            catalogmod.export_file(cfg, database, args.path)
            return 0
        if args.command == "list":
            return cmd_list(cfg, database, args)
        if args.command == "copy":
            return cmd_copy(cfg, database, args)
        if args.command == "review":
            return cmd_review(cfg, database, args)
        if args.command == "keywords":
            return cmd_keywords(cfg, database, args)
        if args.command == "auth":
            return cmd_auth(cfg, database, args)
        if args.command == "boards":
            return cmd_boards(cfg, database, args)
        if args.command == "publish":
            return cmd_publish(cfg, database, args)
        if args.command == "stats":
            return cmd_stats(cfg, database, args)
    finally:
        database.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
