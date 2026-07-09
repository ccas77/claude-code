"""Component 2 — the per-subgenre keyword bank.

Seed phrases live in keywords.yaml and are treated as APPROVED. The
`keywords --suggest <subgenre>` command asks the model to propose NEW phrases,
which are stored as *suggestions* and only used after you approve them —
unapproved phrases are never fed to the copy generator.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from . import db as dbmod
from .config import Config


def seed_from_yaml(cfg: Config, database: dbmod.DB) -> int:
    """Load keywords.yaml into the DB as approved phrases (idempotent)."""
    if not cfg.keywords_path.is_file():
        return 0
    data = yaml.safe_load(cfg.keywords_path.read_text(encoding="utf-8")) or {}
    n = 0
    for subgenre, phrases in data.items():
        for phrase in (phrases or []):
            if _upsert(database, subgenre, str(phrase).strip(), "approved", "seed"):
                n += 1
    return n


def _upsert(database: dbmod.DB, subgenre: str, phrase: str, status: str, source: str) -> bool:
    if not phrase:
        return False
    cur = database.conn.execute(
        """INSERT INTO keywords(subgenre, phrase, status, source, created_at)
             VALUES (?,?,?,?,?)
           ON CONFLICT(subgenre, phrase) DO NOTHING""",
        (subgenre, phrase, status, source, dbmod.now()),
    )
    database.commit()
    return cur.rowcount > 0


def approved_for(database: dbmod.DB, subgenre: str) -> list[str]:
    rows = database.conn.execute(
        "SELECT phrase FROM keywords WHERE subgenre=? AND status='approved' ORDER BY phrase",
        (subgenre,),
    ).fetchall()
    return [r["phrase"] for r in rows]


def list_for(database: dbmod.DB, subgenre: str) -> list[dbmod.sqlite3.Row]:
    return database.conn.execute(
        "SELECT * FROM keywords WHERE subgenre=? ORDER BY status, phrase", (subgenre,)
    ).fetchall()


def counts_by_subgenre(database: dbmod.DB) -> list[tuple[str, int, int]]:
    rows = database.conn.execute(
        """SELECT subgenre,
                  SUM(status='approved') AS approved,
                  SUM(status='suggested') AS suggested
             FROM keywords GROUP BY subgenre ORDER BY subgenre"""
    ).fetchall()
    return [(r["subgenre"], r["approved"] or 0, r["suggested"] or 0) for r in rows]


def add_suggestions(database: dbmod.DB, subgenre: str, phrases: list[str]) -> int:
    n = 0
    existing = {r["phrase"].lower() for r in list_for(database, subgenre)}
    for p in phrases:
        p = p.strip()
        if p and p.lower() not in existing:
            if _upsert(database, subgenre, p, "suggested", "suggested"):
                n += 1
                existing.add(p.lower())
    return n


def set_status(database: dbmod.DB, subgenre: str, phrase: str, status: str) -> None:
    database.conn.execute(
        "UPDATE keywords SET status=? WHERE subgenre=? AND phrase=?",
        (status, subgenre, phrase),
    )
    database.commit()
