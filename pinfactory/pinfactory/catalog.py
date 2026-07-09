"""Catalogue management: the interactive `init` wizard plus CSV/JSON import/export.

The wizard walks every cover file it finds and asks you for the metadata it
can't know. It NEVER invents titles, links, tropes, or stats — anything you
skip is left blank. You can also skip the wizard entirely and bulk-edit a
spreadsheet: `export` writes a CSV/JSON, you edit it, `import` reads it back.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from . import db as dbmod
from .config import Config
from .images import find_covers

# Columns used for CSV/JSON round-tripping.
FIELDS = [
    "slug", "title", "pen_name", "series", "subgenre", "tropes", "tagline",
    "destination_url", "priority", "cover_path",
]


# --------------------------------------------------------------------------- #
# Interactive prompts
# --------------------------------------------------------------------------- #
def _ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        val = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        return default
    return val or default


def _ask_list(prompt: str, count_hint: str = "3–6, comma-separated") -> list[str]:
    raw = _ask(f"{prompt} ({count_hint})")
    return [t.strip() for t in raw.split(",") if t.strip()]


def _ask_bool(prompt: str, default: bool = False) -> bool:
    d = "Y/n" if default else "y/N"
    val = _ask(f"{prompt} ({d})").lower()
    if not val:
        return default
    return val in ("y", "yes", "1", "true")


def init_wizard(cfg: Config, database: dbmod.DB) -> int:
    """Walk each cover file and collect its metadata. Returns count processed."""
    covers = find_covers(cfg.covers_dir)
    if not covers:
        print(f"No cover images found in {cfg.covers_dir}/.")
        print("Drop one image per book there (filename = a slug you choose), then re-run `init`.")
        return 0

    print(f"\nFound {len(covers)} cover file(s) in {cfg.covers_dir}/.")
    print("For each one I'll ask for metadata. Press Enter to leave a field blank — "
          "I will never guess a value for you.\n")

    # Collect pen-name voice notes once per pen name (reused across its books).
    voice_notes: dict[str, str] = {r["name"]: r["voice_notes"] for r in database.list_pen_names()}
    processed = 0

    for slug in sorted(covers):
        cover_path = covers[slug]
        existing = database.get_book(slug)
        print(f"\n── {slug}  ({cover_path.name}) " + ("[already in catalogue]" if existing else ""))
        title = _ask("  Title", existing["title"] if existing else "")
        pen = _ask("  Pen name", existing["pen_name"] if existing else "")
        series = _ask("  Series (blank if standalone)", existing["series"] if existing else "")
        subgenre = _ask("  Subgenre (e.g. dark romance, small-town romance)",
                        existing["subgenre"] if existing else "")
        tropes = _ask_list("  Trope tags")
        if not tropes and existing:
            tropes = dbmod.book_tropes(existing)
        tagline = _ask("  Tagline for the quote-card variant (optional)",
                       existing["tagline"] if existing else "")
        url = _ask("  Destination URL (Amazon page for now)",
                   existing["destination_url"] if existing else "")
        priority = _ask_bool("  Flag as priority in the publish queue?",
                             bool(existing["priority"]) if existing else False)

        if pen and pen not in voice_notes:
            vn = _ask(f"  Voice notes for pen name '{pen}' (tone / reader vibe)")
            voice_notes[pen] = vn
            database.upsert_pen_name(pen, voice_notes=vn)
        elif pen:
            database.upsert_pen_name(pen, voice_notes=voice_notes.get(pen, ""))

        database.upsert_book({
            "slug": slug,
            "title": title,
            "pen_name": pen,
            "series": series,
            "subgenre": subgenre,
            "tropes": tropes,
            "tagline": tagline,
            "destination_url": url,
            "priority": 1 if priority else 0,
            "cover_path": str(cover_path),
        })
        processed += 1

    print(f"\nSaved {processed} book(s) to {cfg.db_path.name}.")
    return processed


# --------------------------------------------------------------------------- #
# Import / export
# --------------------------------------------------------------------------- #
def _row_to_book(row: dict[str, Any], covers: dict[str, Path]) -> dict[str, Any]:
    slug = (row.get("slug") or "").strip()
    tropes = row.get("tropes", "")
    if isinstance(tropes, str):
        tropes = [t.strip() for t in tropes.split(";") if t.strip()] if ";" in tropes \
            else [t.strip() for t in tropes.split(",") if t.strip()]
    cover_path = (row.get("cover_path") or "").strip()
    if not cover_path and slug in covers:
        cover_path = str(covers[slug])
    return {
        "slug": slug,
        "title": (row.get("title") or "").strip(),
        "pen_name": (row.get("pen_name") or "").strip(),
        "series": (row.get("series") or "").strip(),
        "subgenre": (row.get("subgenre") or "").strip(),
        "tropes": tropes,
        "tagline": (row.get("tagline") or "").strip(),
        "destination_url": (row.get("destination_url") or "").strip(),
        "priority": int(str(row.get("priority", "0")).strip() or 0) if str(row.get("priority", "0")).strip().isdigit() else (1 if str(row.get("priority", "")).lower() in ("y", "yes", "true") else 0),
        "cover_path": cover_path,
    }


def import_file(cfg: Config, database: dbmod.DB, path: str | Path) -> int:
    path = Path(path)
    covers = find_covers(cfg.covers_dir)
    rows: list[dict[str, Any]]
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        rows = data["books"] if isinstance(data, dict) and "books" in data else data
    else:
        with path.open("r", encoding="utf-8", newline="") as fh:
            rows = list(csv.DictReader(fh))

    count = 0
    pen_seen: set[str] = set()
    for row in rows:
        book = _row_to_book(row, covers)
        if not book["slug"]:
            continue
        if book["pen_name"] and book["pen_name"] not in pen_seen:
            database.upsert_pen_name(book["pen_name"])
            pen_seen.add(book["pen_name"])
        database.upsert_book(book)
        count += 1
    print(f"Imported {count} book(s) from {path.name}.")
    return count


def export_file(cfg: Config, database: dbmod.DB, path: str | Path) -> int:
    path = Path(path)
    books = database.list_books()
    records = []
    for b in books:
        records.append({
            "slug": b["slug"],
            "title": b["title"],
            "pen_name": b["pen_name"],
            "series": b["series"],
            "subgenre": b["subgenre"],
            "tropes": "; ".join(dbmod.book_tropes(b)),
            "tagline": b["tagline"],
            "destination_url": b["destination_url"],
            "priority": b["priority"],
            "cover_path": b["cover_path"],
        })
    if path.suffix.lower() == ".json":
        path.write_text(json.dumps({"books": records}, indent=2, ensure_ascii=False), encoding="utf-8")
    else:
        with path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(records)
    print(f"Exported {len(records)} book(s) to {path}.")
    return len(records)
