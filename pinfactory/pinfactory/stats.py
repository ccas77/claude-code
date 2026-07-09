"""Component 3 — analytics + weekly digest.

`stats` pulls pin analytics from the Pinterest API **if your access tier allows
it** (real analytics need Standard access + a business account with live public
pins). When it can't, it says so plainly instead of showing fabricated numbers.
It then prints a table (pins/week, per-pin and per-board impressions/saves/
clicks, top 10 by outbound clicks) and writes a weekly digest markdown file.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from pathlib import Path

from . import db as dbmod
from .config import Config
from .pinterest import PinterestClient, PinterestError

METRICS = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"]
_METRIC_COL = {"IMPRESSION": "impressions", "SAVE": "saves",
               "PIN_CLICK": "pin_clicks", "OUTBOUND_CLICK": "outbound_clicks"}


def _real_published(db: dbmod.DB) -> list[dbmod.sqlite3.Row]:
    return [p for p in db.list_pins("published")
            if p["pinterest_pin_id"] and not p["pinterest_pin_id"].startswith("dryrun")]


def pull_analytics(cfg: Config, db: dbmod.DB, client: PinterestClient, days: int = 30) -> dict:
    """Fetch analytics for live pins. Returns {'ok': bool, 'reason': str, 'fetched': int}."""
    pins = _real_published(db)
    if not pins:
        return {"ok": False, "fetched": 0,
                "reason": "No live-published pins yet (dry-run/sandbox pins have no analytics). "
                          "Publish real pins with Standard access first."}
    end = dt.date.today() - dt.timedelta(days=1)   # data lags ~1-2 days
    start = end - dt.timedelta(days=days)
    fetched = 0
    for p in pins:
        try:
            data = client.pin_analytics(p["pinterest_pin_id"], start.isoformat(),
                                        end.isoformat(), METRICS)
        except PinterestError as e:
            if e.status in (401, 403):
                return {"ok": False, "fetched": fetched,
                        "reason": f"Analytics not available on this access tier ({e.status}). "
                                  "Analytics require Standard access + a business account."}
            continue  # transient/other error on one pin — skip it, keep going
        for day in _iter_daily(data):
            m = day.get("metrics", day)
            db.upsert_analytics(
                p["id"], day.get("date", end.isoformat()),
                impressions=int(m.get("IMPRESSION", 0) or 0),
                saves=int(m.get("SAVE", 0) or 0),
                pin_clicks=int(m.get("PIN_CLICK", 0) or 0),
                outbound_clicks=int(m.get("OUTBOUND_CLICK", 0) or 0))
        fetched += 1
    return {"ok": True, "fetched": fetched, "reason": ""}


def _iter_daily(data: dict):
    """Best-effort extraction of a daily-metric list from the analytics payload."""
    if not isinstance(data, dict):
        return
    # common shapes: {"all": {"daily_metrics": [...]}} or {"daily_metrics": [...]}
    for container in (data.get("all"), data):
        if isinstance(container, dict) and isinstance(container.get("daily_metrics"), list):
            for d in container["daily_metrics"]:
                if isinstance(d, dict):
                    yield d
            return


def print_stats(db: dbmod.DB) -> None:
    published = db.list_pins("published")
    print(f"\nPublished pins: {len(published)}  "
          f"(failed: {len(db.list_pins('failed'))}, quarantined: {len(db.list_pins('quarantined'))})")

    # pins per ISO week
    per_week: dict[str, int] = defaultdict(int)
    for p in published:
        if p["published_at"]:
            wk = dt.datetime.fromtimestamp(p["published_at"]).strftime("%G-W%V")
            per_week[wk] += 1
    if per_week:
        print("\nPins published per week:")
        for wk in sorted(per_week):
            print(f"  {wk}: {per_week[wk]}")

    rows = db.conn.execute(
        """SELECT p.id, i.book_slug, i.variant, bo.name AS board,
                  COALESCE(SUM(a.impressions),0) imp, COALESCE(SUM(a.saves),0) sav,
                  COALESCE(SUM(a.pin_clicks),0) pc, COALESCE(SUM(a.outbound_clicks),0) oc
             FROM pins p
             JOIN images i ON i.id=p.image_id
             LEFT JOIN boards bo ON bo.id=p.board_id
             LEFT JOIN analytics a ON a.pin_row_id=p.id
            WHERE p.status='published'
            GROUP BY p.id ORDER BY oc DESC"""
    ).fetchall()
    have_analytics = any((r["imp"] or r["sav"] or r["pc"] or r["oc"]) for r in rows)
    if not have_analytics:
        print("\nNo analytics data yet. Run `pinfactory stats` after real pins have been "
              "live for a day or two (requires Standard access + a business account).")
        return

    print("\nPer board (impressions / saves / pin clicks / outbound clicks):")
    board_tot: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for r in rows:
        b = board_tot[r["board"] or "—"]
        b[0] += r["imp"]; b[1] += r["sav"]; b[2] += r["pc"]; b[3] += r["oc"]
    for name, (imp, sav, pc, oc) in sorted(board_tot.items(), key=lambda x: -x[1][3]):
        print(f"  {name:<28} {imp:>7} / {sav:>5} / {pc:>5} / {oc:>5}")

    print("\nTop 10 pins by outbound clicks:")
    for r in rows[:10]:
        print(f"  {r['book_slug']}/{r['variant']:<16} {r['board'] or '—':<24} "
              f"imp {r['imp']:>6}  save {r['sav']:>4}  clk {r['pc']:>4}  out {r['oc']:>4}")


def write_digest(cfg: Config, db: dbmod.DB) -> Path:
    now = dbmod.now()
    week_ago = now - 7 * 86400
    published_week = [p for p in db.list_pins("published")
                      if p["published_at"] and p["published_at"] >= week_ago]
    approved_ready = db.conn.execute(
        """SELECT COUNT(*) c FROM copy c JOIN images i ON i.id=c.image_id
            WHERE c.status='approved'
              AND NOT EXISTS (SELECT 1 FROM pins p WHERE p.image_id=i.id AND p.is_resave=0)"""
    ).fetchone()["c"]
    draft = db.conn.execute("SELECT COUNT(*) c FROM copy WHERE status='draft'").fetchone()["c"]
    no_copy = db.conn.execute(
        "SELECT COUNT(*) c FROM images i WHERE NOT EXISTS (SELECT 1 FROM copy c WHERE c.image_id=i.id)"
    ).fetchone()["c"]
    quarantined = len(db.list_pins("quarantined"))

    stamp = dt.datetime.fromtimestamp(now)
    lines = [
        f"# pinfactory weekly digest — {stamp:%Y-%m-%d}",
        "",
        "## Published in the last 7 days",
        f"- {len(published_week)} pin(s) published"
        + (f" (weekly cap: {cfg.get('cadence', 'max_pins_per_week', default=10)})" ),
    ]
    for p in published_week:
        img = db.conn.execute("SELECT book_slug, variant FROM images WHERE id=?", (p["image_id"],)).fetchone()
        bo = db.conn.execute("SELECT name FROM boards WHERE id=?", (p["board_id"],)).fetchone()
        when = dt.datetime.fromtimestamp(p["published_at"]).strftime("%b %d")
        tag = " (re-save)" if p["is_resave"] else ""
        lines.append(f"  - {when}: {img['book_slug']}/{img['variant']} → {bo['name'] if bo else '—'}{tag}")

    lines += [
        "",
        "## Queued & eligible",
        f"- {approved_ready} approved image(s) waiting to publish",
        "",
        "## Needs your attention",
        f"- {draft} copy draft(s) awaiting review (`pinfactory review`)",
        f"- {no_copy} image(s) with no copy yet (`pinfactory copy`)",
        f"- {quarantined} quarantined pin(s) (repeated publish failures — see error log)",
        "",
        f"_Generated {stamp:%Y-%m-%d %H:%M}._",
    ]
    cfg.reports_dir.mkdir(parents=True, exist_ok=True)
    out = cfg.reports_dir / f"digest-{stamp:%Y-%m-%d}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out
