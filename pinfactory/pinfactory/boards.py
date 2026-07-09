"""Component 3 — board strategy.

The Pinterest algorithm rewards semantic alignment between a pin and the board
it lives on, so we want a handful of tightly-themed boards per account (pen
name), each targeting a subgenre or a strong trope. `boards --propose` drafts
5–8 board names/descriptions per pen name from your trope tags for your
approval; `boards --create` then creates the approved boards on Pinterest (or
maps them to boards you already have, matched by name).
"""

from __future__ import annotations

from collections import Counter

from . import db as dbmod
from .config import Config


def _title(s: str) -> str:
    return " ".join(w.capitalize() for w in s.split())


def propose_for_pen(database: dbmod.DB, cfg: Config, pen_name: str) -> list[dict]:
    books = [b for b in database.list_books() if b["pen_name"] == pen_name]
    subgenres = Counter()
    tropes = Counter()
    for b in books:
        if b["subgenre"]:
            subgenres[b["subgenre"].strip().lower()] += 1
        for t in dbmod.book_tropes(b):
            tropes[t.strip().lower()] += 1

    lo = int(cfg.get("boards", "min_per_account", default=5))
    hi = int(cfg.get("boards", "max_per_account", default=8))

    proposals: list[dict] = []
    seen: set[str] = set()

    def add(name: str, niche: str, desc: str):
        key = name.lower()
        if key not in seen:
            seen.add(key)
            proposals.append({"name": name, "niche": niche, "description": desc})

    # one board per subgenre (most common first)
    for sub, _ in subgenres.most_common():
        add(f"{_title(sub)} Books", sub,
            f"{_title(sub)} book recommendations, tropes, and reads to add to your TBR.")
        if len(proposals) >= hi:
            break
    # fill remaining slots with the strongest tropes
    for trope, _ in tropes.most_common():
        if len(proposals) >= hi:
            break
        add(f"{_title(trope)} Romance", trope,
            f"Books with the {trope} trope — recs, aesthetics, and your next read.")

    # if a pen has very little metadata, still give it at least one board
    if not proposals:
        add(f"{pen_name} Books", "", f"Reads by {pen_name}.")

    return proposals[:max(lo, min(hi, len(proposals)))] if len(proposals) >= lo else proposals


def propose_all(database: dbmod.DB, cfg: Config) -> dict[str, int]:
    counts: dict[str, int] = {}
    pens = [r["name"] for r in database.list_pen_names()]
    # include pen names that appear on books but aren't in pen_names yet
    for b in database.list_books():
        if b["pen_name"] and b["pen_name"] not in pens:
            pens.append(b["pen_name"])
    for pen in pens:
        for p in propose_for_pen(database, cfg, pen):
            database.upsert_board(p["name"], pen, p["description"], p["niche"], status="proposed")
            counts[pen] = counts.get(pen, 0) + 1
    return counts


def create_on_pinterest(database: dbmod.DB, client, only_pen: str | None = None) -> dict[str, int]:
    """Create approved boards on Pinterest, or map to existing ones by name."""
    stats = {"created": 0, "mapped": 0, "skipped": 0, "errors": 0}
    try:
        existing = {b.get("name", "").strip().lower(): b for b in client.list_boards()}
    except Exception as e:
        if not client.dry_run:
            raise
        existing = {}

    boards = database.list_boards(pen_name=only_pen, status="approved")
    for board in boards:
        name = board["name"]
        match = existing.get(name.strip().lower())
        try:
            if match:
                database.set_board_status(board["id"], "created", match.get("id", ""))
                stats["mapped"] += 1
            elif client.dry_run:
                database.set_board_status(board["id"], "created", f"dryrun-board-{board['id']}")
                stats["created"] += 1
            else:
                created = client.create_board(name, board["description"] or "", "PUBLIC")
                database.set_board_status(board["id"], "created", created.get("id", ""))
                stats["created"] += 1
        except Exception:
            stats["errors"] += 1
    return stats


def best_board_for(database: dbmod.DB, book) -> dbmod.sqlite3.Row | None:
    """Pick the created board whose niche best matches this book (semantic alignment)."""
    boards = database.list_boards(pen_name=book["pen_name"], status="created")
    if not boards:
        return None
    sub = (book["subgenre"] or "").strip().lower()
    tropes = {t.strip().lower() for t in dbmod.book_tropes(book)}
    scored = []
    for b in boards:
        niche = (b["niche"] or "").strip().lower()
        score = 0
        if niche and niche == sub:
            score += 3
        if niche in tropes:
            score += 2
        scored.append((score, b))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def second_board_for(database: dbmod.DB, book, exclude_board_id: int) -> dbmod.sqlite3.Row | None:
    """A different relevant board for the one allowed re-save."""
    boards = [b for b in database.list_boards(pen_name=book["pen_name"], status="created")
              if b["id"] != exclude_board_id]
    if not boards:
        return None
    sub = (book["subgenre"] or "").strip().lower()
    tropes = {t.strip().lower() for t in dbmod.book_tropes(book)}
    scored = []
    for b in boards:
        niche = (b["niche"] or "").strip().lower()
        score = (3 if niche == sub else 0) + (2 if niche in tropes else 0)
        scored.append((score, b))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]
