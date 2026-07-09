"""SQLite persistence layer.

All state lives here so a run can crash, or you can walk away for a month, and
the next run resumes cleanly. The full schema for all three components is
created up front (cheap, and keeps migrations simple); Component 1 only writes
to `pen_names`, `books`, and `images`.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS pen_names (
    name         TEXT PRIMARY KEY,
    voice_notes  TEXT DEFAULT '',
    palette_key  TEXT DEFAULT '',        -- key into themes.yaml (defaults to name)
    created_at   REAL NOT NULL,
    updated_at   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
    slug            TEXT PRIMARY KEY,     -- matches cover filename stem
    title           TEXT NOT NULL DEFAULT '',
    pen_name        TEXT NOT NULL DEFAULT '',
    series          TEXT DEFAULT '',
    subgenre        TEXT DEFAULT '',
    tropes          TEXT DEFAULT '[]',    -- JSON array of strings
    tagline         TEXT DEFAULT '',      -- for the quote-card variant (optional)
    hook            TEXT DEFAULT '',      -- trope-hook overlay: you-write, or Component 2 drafts for approval
    hook_suggestion TEXT DEFAULT '',      -- Component 2's drafted hook, pending your approval
    destination_url TEXT DEFAULT '',
    priority        INTEGER DEFAULT 0,    -- 1 = prioritise in the publish queue
    cover_path      TEXT DEFAULT '',
    refresh_index   INTEGER DEFAULT 0,    -- bumped by `generate --refresh`
    created_at      REAL NOT NULL,
    updated_at      REAL NOT NULL,
    FOREIGN KEY (pen_name) REFERENCES pen_names(name)
);

-- Image manifest: one row per generated creative.
CREATE TABLE IF NOT EXISTS images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    book_slug     TEXT NOT NULL,
    variant       TEXT NOT NULL,          -- headline | trope_hook | quote_card | comp_card
    template      TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    content_hash  TEXT NOT NULL,          -- sha256 of PNG bytes (never-publish-twice)
    seed          INTEGER NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    created_at    REAL NOT NULL,
    UNIQUE (book_slug, variant),
    FOREIGN KEY (book_slug) REFERENCES books(slug)
);
CREATE INDEX IF NOT EXISTS idx_images_hash ON images(content_hash);

-- Component 2: pin copy, one row per image variant.
CREATE TABLE IF NOT EXISTS copy (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id      INTEGER NOT NULL UNIQUE,
    title         TEXT DEFAULT '',
    description   TEXT DEFAULT '',
    model         TEXT DEFAULT '',
    status        TEXT DEFAULT 'draft',   -- draft | approved | rejected
    edited        INTEGER DEFAULT 0,
    created_at    REAL NOT NULL,
    updated_at    REAL NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id)
);

-- Component 2: per-subgenre keyword bank.
CREATE TABLE IF NOT EXISTS keywords (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    subgenre    TEXT NOT NULL,
    phrase      TEXT NOT NULL,
    status      TEXT DEFAULT 'approved',  -- approved | suggested | rejected
    source      TEXT DEFAULT 'seed',      -- seed | suggested
    created_at  REAL NOT NULL,
    UNIQUE (subgenre, phrase)
);

-- Component 3: boards (mapped to or created on Pinterest).
CREATE TABLE IF NOT EXISTS boards (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    description       TEXT DEFAULT '',
    pen_name          TEXT DEFAULT '',
    niche             TEXT DEFAULT '',    -- subgenre/trope the board targets
    pinterest_board_id TEXT DEFAULT '',
    status            TEXT DEFAULT 'proposed',  -- proposed | approved | created
    created_at        REAL NOT NULL,
    UNIQUE (name, pen_name)
);

-- Component 3: publish queue + published-pin ledger.
CREATE TABLE IF NOT EXISTS pins (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id          INTEGER NOT NULL,
    copy_id           INTEGER,
    board_id          INTEGER,
    pinterest_pin_id  TEXT DEFAULT '',
    status            TEXT DEFAULT 'queued',  -- queued | published | failed | quarantined
    is_resave         INTEGER DEFAULT 0,      -- 1 = the one allowed extra-board resave
    resave_of         INTEGER,                -- pins.id of the original publish
    attempts          INTEGER DEFAULT 0,
    error             TEXT DEFAULT '',
    published_at      REAL,
    created_at        REAL NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(id)
);
CREATE INDEX IF NOT EXISTS idx_pins_status ON pins(status);

-- Component 3: cached pin analytics from the API.
CREATE TABLE IF NOT EXISTS analytics (
    pin_row_id     INTEGER NOT NULL,
    metric_date    TEXT NOT NULL,           -- YYYY-MM-DD
    impressions    INTEGER DEFAULT 0,
    saves          INTEGER DEFAULT 0,
    pin_clicks     INTEGER DEFAULT 0,
    outbound_clicks INTEGER DEFAULT 0,
    fetched_at     REAL NOT NULL,
    PRIMARY KEY (pin_row_id, metric_date),
    FOREIGN KEY (pin_row_id) REFERENCES pins(id)
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def now() -> float:
    return time.time()


class DB:
    def __init__(self, path: str | Path):
        self.path = str(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self._migrate()
        self.conn.commit()

    def _migrate(self) -> None:
        """Add columns introduced after a DB was first created (keeps old DBs resumable)."""
        wanted = {"books": {"hook": "TEXT DEFAULT ''", "hook_suggestion": "TEXT DEFAULT ''"}}
        for table, cols in wanted.items():
            existing = {r["name"] for r in self.conn.execute(f"PRAGMA table_info({table})")}
            for col, decl in cols.items():
                if col not in existing:
                    self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")

    # --- generic -----------------------------------------------------------
    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "DB":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def commit(self) -> None:
        self.conn.commit()

    # --- pen names ---------------------------------------------------------
    def upsert_pen_name(self, name: str, voice_notes: str = "", palette_key: str = "") -> None:
        ts = now()
        self.conn.execute(
            """INSERT INTO pen_names(name, voice_notes, palette_key, created_at, updated_at)
                 VALUES (?,?,?,?,?)
               ON CONFLICT(name) DO UPDATE SET
                 voice_notes=excluded.voice_notes,
                 palette_key=excluded.palette_key,
                 updated_at=excluded.updated_at""",
            (name, voice_notes, palette_key or name, ts, ts),
        )
        self.commit()

    def get_pen_name(self, name: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM pen_names WHERE name=?", (name,)).fetchone()

    def list_pen_names(self) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM pen_names ORDER BY name").fetchall()

    # --- books -------------------------------------------------------------
    def upsert_book(self, book: dict[str, Any]) -> None:
        ts = now()
        tropes = book.get("tropes", [])
        if isinstance(tropes, (list, tuple)):
            tropes = json.dumps(list(tropes))
        existing = self.get_book(book["slug"])
        created = existing["created_at"] if existing else ts
        self.conn.execute(
            """INSERT INTO books(slug,title,pen_name,series,subgenre,tropes,tagline,hook,
                                 destination_url,priority,cover_path,refresh_index,
                                 created_at,updated_at)
                 VALUES (:slug,:title,:pen_name,:series,:subgenre,:tropes,:tagline,:hook,
                         :destination_url,:priority,:cover_path,:refresh_index,:created_at,:updated_at)
               ON CONFLICT(slug) DO UPDATE SET
                 title=excluded.title, pen_name=excluded.pen_name, series=excluded.series,
                 subgenre=excluded.subgenre, tropes=excluded.tropes, tagline=excluded.tagline,
                 hook=excluded.hook,
                 destination_url=excluded.destination_url, priority=excluded.priority,
                 cover_path=excluded.cover_path, updated_at=excluded.updated_at""",
            {
                "slug": book["slug"],
                "title": book.get("title", ""),
                "pen_name": book.get("pen_name", ""),
                "series": book.get("series", ""),
                "subgenre": book.get("subgenre", ""),
                "tropes": tropes,
                "tagline": book.get("tagline", ""),
                "hook": book.get("hook", ""),
                "destination_url": book.get("destination_url", ""),
                "priority": int(book.get("priority", 0) or 0),
                "cover_path": book.get("cover_path", ""),
                "refresh_index": int(book.get("refresh_index", existing["refresh_index"] if existing else 0)),
                "created_at": created,
                "updated_at": ts,
            },
        )
        self.commit()

    def get_book(self, slug: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM books WHERE slug=?", (slug,)).fetchone()

    def list_books(self) -> list[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM books ORDER BY pen_name, slug").fetchall()

    def bump_refresh_index(self, slug: str) -> int:
        self.conn.execute(
            "UPDATE books SET refresh_index = refresh_index + 1, updated_at=? WHERE slug=?",
            (now(), slug),
        )
        self.commit()
        row = self.get_book(slug)
        return int(row["refresh_index"]) if row else 0

    # --- images ------------------------------------------------------------
    def upsert_image(self, rec: dict[str, Any]) -> int:
        ts = now()
        cur = self.conn.execute(
            """INSERT INTO images(book_slug,variant,template,file_path,content_hash,seed,width,height,created_at)
                 VALUES (:book_slug,:variant,:template,:file_path,:content_hash,:seed,:width,:height,:created_at)
               ON CONFLICT(book_slug,variant) DO UPDATE SET
                 template=excluded.template, file_path=excluded.file_path,
                 content_hash=excluded.content_hash, seed=excluded.seed,
                 width=excluded.width, height=excluded.height, created_at=excluded.created_at""",
            {**rec, "created_at": ts},
        )
        self.commit()
        row = self.conn.execute(
            "SELECT id FROM images WHERE book_slug=? AND variant=?",
            (rec["book_slug"], rec["variant"]),
        ).fetchone()
        return int(row["id"])

    def hash_exists(self, content_hash: str, exclude_book: str | None = None,
                    exclude_variant: str | None = None) -> bool:
        """True if this exact image content already exists in the manifest.

        Enforces the never-publish-twice rule at generation time. We exclude the
        (book, variant) slot being regenerated so re-running `generate` on an
        unchanged book isn't a false positive.
        """
        q = "SELECT 1 FROM images WHERE content_hash=?"
        params: list[Any] = [content_hash]
        if exclude_book is not None and exclude_variant is not None:
            q += " AND NOT (book_slug=? AND variant=?)"
            params += [exclude_book, exclude_variant]
        return self.conn.execute(q, params).fetchone() is not None

    def list_images(self, book_slug: str | None = None) -> list[sqlite3.Row]:
        if book_slug:
            return self.conn.execute(
                "SELECT * FROM images WHERE book_slug=? ORDER BY variant", (book_slug,)
            ).fetchall()
        return self.conn.execute(
            "SELECT * FROM images ORDER BY book_slug, variant"
        ).fetchall()

    # --- copy (Component 2) ------------------------------------------------
    def upsert_copy(self, image_id: int, title: str, description: str, model: str) -> int:
        ts = now()
        self.conn.execute(
            """INSERT INTO copy(image_id,title,description,model,status,created_at,updated_at)
                 VALUES (?,?,?,?, 'draft', ?, ?)
               ON CONFLICT(image_id) DO UPDATE SET
                 title=excluded.title, description=excluded.description,
                 model=excluded.model, status='draft', edited=0, updated_at=excluded.updated_at""",
            (image_id, title, description, model, ts, ts),
        )
        self.commit()
        row = self.conn.execute("SELECT id FROM copy WHERE image_id=?", (image_id,)).fetchone()
        return int(row["id"])

    def get_copy_for_image(self, image_id: int) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM copy WHERE image_id=?", (image_id,)).fetchone()

    def set_copy_fields(self, copy_id: int, *, title: str | None = None,
                        description: str | None = None, status: str | None = None,
                        edited: bool | None = None) -> None:
        sets, params = [], []
        for col, val in (("title", title), ("description", description), ("status", status)):
            if val is not None:
                sets.append(f"{col}=?"); params.append(val)
        if edited is not None:
            sets.append("edited=?"); params.append(1 if edited else 0)
        if not sets:
            return
        sets.append("updated_at=?"); params.append(now())
        params.append(copy_id)
        self.conn.execute(f"UPDATE copy SET {', '.join(sets)} WHERE id=?", params)
        self.commit()

    def set_hook_suggestion(self, slug: str, hook: str) -> None:
        self.conn.execute("UPDATE books SET hook_suggestion=?, updated_at=? WHERE slug=?",
                          (hook, now(), slug))
        self.commit()

    def approve_hook(self, slug: str) -> None:
        row = self.get_book(slug)
        if row and (row["hook_suggestion"] or "").strip():
            self.conn.execute(
                "UPDATE books SET hook=?, hook_suggestion='', updated_at=? WHERE slug=?",
                (row["hook_suggestion"], now(), slug))
            self.commit()

    def gallery_rows(self) -> list[sqlite3.Row]:
        """Images joined with their book + copy for the review gallery."""
        return self.conn.execute(
            """SELECT i.id AS image_id, i.book_slug, i.variant, i.file_path,
                      b.title, b.pen_name, b.subgenre, b.destination_url,
                      c.id AS copy_id, c.title AS copy_title, c.description AS copy_desc,
                      c.status AS copy_status, c.edited
                 FROM images i
                 JOIN books b ON b.slug = i.book_slug
                 LEFT JOIN copy c ON c.image_id = i.id
                 ORDER BY b.pen_name, i.book_slug, i.variant"""
        ).fetchall()

    # --- meta --------------------------------------------------------------
    def set_meta(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self.commit()

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        row = self.conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def book_tropes(row: sqlite3.Row) -> list[str]:
    """Decode the JSON tropes column of a books row."""
    try:
        val = json.loads(row["tropes"] or "[]")
        return [str(t) for t in val] if isinstance(val, list) else []
    except (json.JSONDecodeError, TypeError):
        return []
