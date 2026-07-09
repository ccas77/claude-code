"""Component 3 — the publish scheduler.

Each `publish` run picks the next eligible **approved** pins and publishes them
to Pinterest, enforcing every anti-spam rule from the brief:

  - at most `max_pins_per_week` published pins in any rolling 7 days (default 10);
  - the same image is never published twice (enforced by content hash);
  - the same destination URL may go to multiple boards but publishes are spaced
    >= `min_hours_between_same_url` (48h) apart;
  - round-robin across pen names and boards so no single brand floods the feed,
    with `priority` books floated to the front;
  - a pin may be re-saved to ONE additional relevant board no sooner than
    `resave_after_days` (5) after first publish, then never again;
  - API errors: the client backs off on rate limits; a pin that fails
    `quarantine_after_failures` times is quarantined with the error logged; the
    queue never crashes.

`--dry-run` does everything except call the Pinterest publish endpoint.
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field

from . import boards as boardsmod
from . import db as dbmod
from .config import Config
from .pinterest import PinterestClient, PinterestError

DAY = 86400.0
# If this many pins fail back-to-back, the API/auth is likely down — stop the run
# instead of hammering the endpoint (each failure already backs off client-side).
STOP_AFTER_CONSECUTIVE_FAILURES = 5


@dataclass
class RunReport:
    published: int = 0
    resaved: int = 0
    failed: int = 0
    quarantined: int = 0
    skipped_cap: int = 0
    skipped_spacing: int = 0
    skipped_dup: int = 0
    no_board: int = 0
    weekly_before: int = 0
    weekly_cap: int = 0
    dry_run: bool = False
    lines: list[str] = field(default_factory=list)


@dataclass
class Candidate:
    image_id: int
    copy_id: int
    book: dbmod.sqlite3.Row
    board: dbmod.sqlite3.Row
    pin_id: int | None = None  # existing row (retry) or None (new)


# --------------------------------------------------------------------------- #
def _new_candidates(db: dbmod.DB) -> list[Candidate]:
    rows = db.conn.execute(
        """SELECT i.id AS image_id, i.book_slug, c.id AS copy_id
             FROM images i JOIN copy c ON c.image_id = i.id
            WHERE c.status='approved'
              AND NOT EXISTS (SELECT 1 FROM pins p WHERE p.image_id=i.id AND p.is_resave=0)"""
    ).fetchall()
    out = []
    for r in rows:
        book = db.get_book(r["book_slug"])
        board = boardsmod.best_board_for(db, book)
        if board is None:
            continue
        out.append(Candidate(r["image_id"], r["copy_id"], book, board, None))
    return out


def _retry_candidates(db: dbmod.DB, threshold: int) -> list[Candidate]:
    rows = db.conn.execute(
        "SELECT * FROM pins WHERE status='failed' AND is_resave=0 AND attempts<?", (threshold,)
    ).fetchall()
    out = []
    for p in rows:
        img = db.conn.execute("SELECT * FROM images WHERE id=?", (p["image_id"],)).fetchone()
        board = db.conn.execute("SELECT * FROM boards WHERE id=?", (p["board_id"],)).fetchone()
        if not img or not board or board["status"] != "created":
            continue
        book = db.get_book(img["book_slug"])
        out.append(Candidate(p["image_id"], p["copy_id"], book, board, p["id"]))
    return out


def _round_robin(cands: list[Candidate]) -> list[Candidate]:
    """Interleave across pen names (priority books first), so no brand floods."""
    groups: dict[str, list[Candidate]] = defaultdict(list)
    for c in cands:
        groups[c.book["pen_name"] or ""].append(c)
    for g in groups.values():
        g.sort(key=lambda c: 0 if c.book["priority"] else 1)  # priority within a pen
    queues = [deque(v) for v in groups.values()]
    interleaved: list[Candidate] = []
    while any(queues):
        for q in queues:
            if q:
                interleaved.append(q.popleft())
    # float priority books to the very front while keeping round-robin order (stable)
    interleaved.sort(key=lambda c: 0 if c.book["priority"] else 1)
    return interleaved


def publish(cfg: Config, db: dbmod.DB, client: PinterestClient, *, limit: int | None = None) -> RunReport:
    cad = cfg.settings.get("cadence", {})
    weekly_cap = int(cad.get("max_pins_per_week", 10))
    spacing_h = float(cad.get("min_hours_between_same_url", 48))
    resave_days = float(cad.get("resave_after_days", 5))
    quarantine_at = int(cad.get("quarantine_after_failures", 2))

    now = dbmod.now()
    rep = RunReport(dry_run=client.dry_run, weekly_cap=weekly_cap)
    rep.weekly_before = db.count_published_since(now - 7 * DAY)
    remaining = max(0, weekly_cap - rep.weekly_before)
    if limit is not None:
        remaining = min(remaining, limit)
    budget = [remaining]  # shared, mutable — both the main pass and re-saves draw from it

    urls_this_run: set[str] = set()

    def spacing_ok(url: str) -> bool:
        if not url:
            return True
        if url in urls_this_run:
            return False
        return not db.url_published_since(url, now - spacing_h * 3600)

    # retries first (clear the backlog), then fresh pins, both round-robined
    queue = _retry_candidates(db, quarantine_at) + _round_robin(_new_candidates(db))

    consecutive_failures = 0
    for c in queue:
        if budget[0] <= 0:
            rep.skipped_cap += 1
            continue
        url = c.book["destination_url"] or ""
        if db.image_already_published(c.image_id):
            rep.skipped_dup += 1
            continue
        if not spacing_ok(url):
            rep.skipped_spacing += 1
            continue

        pin_id = c.pin_id or db.create_pin_row(c.image_id, c.copy_id, c.board["id"])
        img = db.conn.execute("SELECT * FROM images WHERE id=?", (c.image_id,)).fetchone()
        cop = db.conn.execute("SELECT * FROM copy WHERE id=?", (c.copy_id,)).fetchone()
        board_ref = c.board["pinterest_board_id"] or f"dryrun-board-{c.board['id']}"
        try:
            resp = client.create_pin(
                board_id=board_ref, image_path=img["file_path"],
                title=cop["title"], description=cop["description"], link=url,
                alt_text=cop["title"])
            db.record_pin_result(pin_id, pinterest_pin_id=resp.get("id", ""),
                                 status="published", published_at=now)
            budget[0] -= 1
            rep.published += 1
            consecutive_failures = 0
            if url:
                urls_this_run.add(url)
            rep.lines.append(f"published  {img['book_slug']}/{img['variant']} → {c.board['name']}")
        except Exception as e:  # PinterestError or anything else — never crash the queue
            msg = str(e) if isinstance(e, PinterestError) else f"{type(e).__name__}: {e}"
            _handle_failure(db, pin_id, msg, quarantine_at, rep, img, c.board["name"])
            consecutive_failures += 1
            if consecutive_failures >= STOP_AFTER_CONSECUTIVE_FAILURES:
                rep.lines.append(f"STOPPING run — {consecutive_failures} consecutive failures "
                                 "(Pinterest API or auth is likely down; try again later)")
                return rep

    _resave_pass(cfg, db, client, now, resave_days, spacing_ok, urls_this_run, rep,
                 budget, quarantine_at)
    return rep


def _handle_failure(db, pin_id, err, quarantine_at, rep, img, board_name):
    db.record_pin_result(pin_id, status="failed", error=err, attempts_inc=True)
    row = db.conn.execute("SELECT attempts FROM pins WHERE id=?", (pin_id,)).fetchone()
    if row and row["attempts"] >= quarantine_at:
        db.record_pin_result(pin_id, status="quarantined", error=err)
        rep.quarantined += 1
        rep.lines.append(f"QUARANTINED {img['book_slug']}/{img['variant']} → {board_name}: {err[:80]}")
    else:
        rep.failed += 1
        rep.lines.append(f"failed     {img['book_slug']}/{img['variant']} → {board_name}: {err[:80]}")


def _resave_pass(cfg, db, client, now, resave_days, spacing_ok, urls_this_run,
                 rep, budget, quarantine_at):
    cutoff = now - resave_days * DAY
    rows = db.conn.execute(
        """SELECT * FROM pins
            WHERE status='published' AND is_resave=0 AND published_at IS NOT NULL
              AND published_at <= ?
              AND id NOT IN (SELECT resave_of FROM pins WHERE resave_of IS NOT NULL)""",
        (cutoff,),
    ).fetchall()
    for p in rows:
        if budget[0] <= 0:
            break
        img = db.conn.execute("SELECT * FROM images WHERE id=?", (p["image_id"],)).fetchone()
        book = db.get_book(img["book_slug"])
        second = boardsmod.second_board_for(db, book, p["board_id"])
        if second is None:
            continue
        url = book["destination_url"] or ""
        if not spacing_ok(url):
            rep.skipped_spacing += 1
            continue
        new_id = db.create_pin_row(p["image_id"], p["copy_id"], second["id"],
                                   is_resave=True, resave_of=p["id"])
        board_ref = second["pinterest_board_id"] or f"dryrun-board-{second['id']}"
        try:
            resp = client.save_pin_to_board(p["pinterest_pin_id"] or f"dryrun-{p['id']}", board_ref)
            db.record_pin_result(new_id, pinterest_pin_id=resp.get("id", ""),
                                 status="published", published_at=now)
            budget[0] -= 1
            rep.resaved += 1
            if url:
                urls_this_run.add(url)
            rep.lines.append(f"re-saved   {img['book_slug']}/{img['variant']} → {second['name']}")
        except Exception as e:
            _handle_failure(db, new_id, f"{type(e).__name__}: {e}", quarantine_at, rep, img, second["name"])
