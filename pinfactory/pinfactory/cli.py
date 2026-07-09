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
from . import catalog as catalogmod
from . import db as dbmod
from .config import load_config
from .images import ALL_VARIANTS, ImageGenerator, OPTIONAL_VARIANTS, VARIANTS, find_covers
from .themes import ThemeSet

_PENDING = (
    "This command belongs to a later component and isn't built yet.\n"
    "Build order (from the project brief): Component 1 = image generator (ready),\n"
    "Component 2 = copy generator + review + keywords, Component 3 = boards + scheduler + stats.\n"
    "Approve the Component 1 sample images and I'll build the next component."
)


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

    # Later-component commands (registered so `--help` documents the roadmap).
    sub.add_parser("review", help="[Component 2] Local HTML approval gallery.")
    kw = sub.add_parser("keywords", help="[Component 2] Keyword bank + --suggest.")
    kw.add_argument("--suggest", metavar="SUBGENRE")
    pub = sub.add_parser("publish", help="[Component 3] Pinterest scheduler.")
    pub.add_argument("--dry-run", action="store_true")
    sub.add_parser("stats", help="[Component 3] Analytics + weekly digest.")
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
        if args.command in ("review", "keywords", "publish", "stats"):
            print(f"[{args.command}] {_PENDING}")
            return 0
    finally:
        database.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
