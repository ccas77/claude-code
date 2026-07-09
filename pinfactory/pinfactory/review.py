"""Component 2 — the local review gallery.

`pinfactory review` starts a small local web server (stdlib only, no extra
dependencies) that renders every generated image next to its title +
description and lets you **approve / reject / edit** each one. Nothing is
eligible to publish until it is approved here.

`pinfactory review --static` instead writes a self-contained read-only HTML
snapshot (images embedded) you can open or share without running the server.
"""

from __future__ import annotations

import base64
import html
import http.server
import socketserver
import urllib.parse
from pathlib import Path

from . import db as dbmod
from .config import Config

_STATUS_COLOR = {"approved": "#3f9d6b", "rejected": "#b04a4a", "draft": "#7a6f86"}


def _page(rows, hooks, *, static: bool) -> str:
    total = len(rows)
    approved = sum(1 for r in rows if (r["copy_status"] or "") == "approved")
    with_copy = sum(1 for r in rows if r["copy_id"] is not None)
    banner = "" if not static else (
        '<div class="banner">Static snapshot — read only. Run '
        '<code>pinfactory review</code> to approve/reject/edit.</div>')

    cards = []
    last_book = None
    open_grid = False
    for r in rows:
        book_key = (r["pen_name"], r["book_slug"])
        if book_key != last_book:
            if open_grid:
                cards.append('</div><!--/grid-->')
                open_grid = False
            last_book = book_key
            cards.append(
                f'<h2>{html.escape(r["title"] or r["book_slug"])} '
                f'<span class="pen">· {html.escape(r["pen_name"] or "unassigned")} '
                f'· {html.escape(r["subgenre"] or "")}</span></h2>')
            hs = hooks.get(r["book_slug"])
            if hs:
                cards.append(_hook_card(r["book_slug"], hs, static))
            cards.append('<div class="grid">')
            open_grid = True
        cards.append(_card(r, static))
    if open_grid:
        cards.append('</div><!--/grid-->')
    body = "".join(cards)

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>pinfactory · review</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin:0; background:#12101a; color:#eee; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  header {{ position:sticky; top:0; background:#1b1826; padding:14px 22px; border-bottom:1px solid #2c2838; z-index:5; }}
  header b {{ font-size:18px; }}
  header .stat {{ color:#b7aec9; margin-left:14px; }}
  .banner {{ background:#3a2f12; color:#ffe6a3; padding:10px 22px; }}
  main {{ padding:8px 22px 60px; max-width:1400px; margin:0 auto; }}
  h2 {{ margin:34px 0 10px; font-size:20px; }}
  h2 .pen {{ color:#8f86a3; font-weight:400; font-size:15px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }}
  .card {{ background:#1b1826; border:1px solid #2c2838; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }}
  .card img {{ width:100%; display:block; background:#000; }}
  .card .body {{ padding:12px; display:flex; flex-direction:column; gap:8px; }}
  .variant {{ font-size:12px; letter-spacing:1px; text-transform:uppercase; color:#b7aec9; }}
  .badge {{ float:right; font-size:11px; padding:2px 8px; border-radius:20px; color:#fff; text-transform:uppercase; letter-spacing:.5px; }}
  label {{ font-size:11px; color:#8f86a3; text-transform:uppercase; letter-spacing:.5px; }}
  input, textarea {{ width:100%; box-sizing:border-box; background:#12101a; color:#eee; border:1px solid #2c2838; border-radius:8px; padding:8px; font:inherit; }}
  textarea {{ min-height:78px; resize:vertical; }}
  .count {{ font-size:11px; color:#8f86a3; text-align:right; }}
  .count.over {{ color:#e08b8b; }}
  .btns {{ display:flex; gap:8px; }}
  button {{ flex:1; padding:9px; border:0; border-radius:8px; font-weight:600; cursor:pointer; }}
  .save {{ background:#2c2838; color:#eee; }}
  .approve {{ background:#3f9d6b; color:#fff; }}
  .reject {{ background:#5a3540; color:#f0c9c9; }}
  .hookcard {{ background:#241a2b; border:1px solid #3a2a44; border-radius:12px; padding:12px 14px; margin:6px 0 4px; }}
  .destimg a {{ color:#c9a3e0; font-size:12px; }}
</style></head>
<body>
<header><b>pinfactory · review</b>
  <span class="stat">{approved}/{with_copy} approved</span>
  <span class="stat">{total} images · {with_copy} with copy</span>
</header>
{banner}
<main>{body}</main>
<script>
  document.querySelectorAll('textarea,input[name=title]').forEach(el => {{
    const c = el.previousElementSibling && el.previousElementSibling.querySelector('.count');
    if (!c) return;
    const max = +el.dataset.max;
    const upd = () => {{ c.textContent = el.value.length + '/' + max; c.classList.toggle('over', el.value.length>max); }};
    el.addEventListener('input', upd); upd();
  }});
</script>
</body></html>"""


def _card(r, static: bool) -> str:
    status = r["copy_status"] or ("nocopy" if r["copy_id"] is None else "draft")
    color = _STATUS_COLOR.get(status, "#555")
    img_src = _img_src(r, static)
    title = html.escape(r["copy_title"] or "")
    desc = html.escape(r["copy_desc"] or "")
    edited = " · edited" if r["edited"] else ""
    if r["copy_id"] is None:
        inner = '<div style="color:#8f86a3;padding:6px 0">No copy yet — run <code>pinfactory copy</code>.</div>'
        form_open = form_close = ""
    else:
        disabled = "" if not static else "disabled"
        form_open = f'<form method="post" action="/action">' \
                    f'<input type="hidden" name="copy_id" value="{r["copy_id"]}">'
        inner = f"""
          <label>Title <span class="count" data-max="100"></span></label>
          <input name="title" data-max="100" value="{title}" {disabled}>
          <label>Description <span class="count" data-max="500"></span></label>
          <textarea name="description" data-max="500" {disabled}>{desc}</textarea>
          {"" if static else '<div class="btns">'
            '<button class="save" name="action" value="save">Save</button>'
            '<button class="approve" name="action" value="approve">Approve</button>'
            '<button class="reject" name="action" value="reject">Reject</button></div>'}"""
        form_close = "</form>"
    dest = ""
    if r["destination_url"]:
        dest = f'<div class="destimg"><a href="{html.escape(r["destination_url"])}" target="_blank">destination ↗</a></div>'
    return f"""<div class="card">
      <img src="{img_src}" loading="lazy" alt="{html.escape(r['variant'])}">
      <div class="body">
        <div class="variant">{html.escape(r['variant'])}<span class="badge" style="background:{color}">{status}{edited}</span></div>
        {form_open}{inner}{form_close}
        {dest}
      </div></div>"""


def _hook_card(slug, suggestion, static: bool) -> str:
    btn = "" if static else (
        f'<form method="post" action="/action" style="margin-top:8px">'
        f'<input type="hidden" name="hook_slug" value="{html.escape(slug)}">'
        f'<button class="approve" name="action" value="hook_approve" style="max-width:260px">'
        f'Use this hook</button></form>')
    return (f'<div class="hookcard"><label>Suggested trope-hook (pending your approval)</label>'
            f'<div style="font-size:17px;font-style:italic;margin-top:4px">'
            f'“{html.escape(suggestion)}”</div>{btn}</div>')


def _img_src(r, static: bool) -> str:
    if not static:
        return f"/img/{r['image_id']}"
    p = Path(r["file_path"])
    if not p.is_file():
        return ""
    # Embed a downscaled thumbnail so the self-contained snapshot stays small.
    try:
        import io

        from PIL import Image
        im = Image.open(p)
        im.thumbnail((480, 720), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "PNG")
        raw = buf.getvalue()
    except Exception:
        raw = p.read_bytes()
    return f"data:image/png;base64,{base64.b64encode(raw).decode()}"


def _load(cfg: Config):
    db = dbmod.DB(cfg.db_path)
    rows = db.gallery_rows()
    hooks = {b["slug"]: b["hook_suggestion"] for b in db.list_books()
             if (b["hook_suggestion"] or "").strip()}
    return db, rows, hooks


def write_static(cfg: Config) -> Path:
    db, rows, hooks = _load(cfg)
    cfg.review_dir.mkdir(parents=True, exist_ok=True)
    out = cfg.review_dir / "gallery.html"
    out.write_text(_page(rows, hooks, static=True), encoding="utf-8")
    db.close()
    return out


def serve(cfg: Config, port: int = 8000) -> None:
    db_path = cfg.db_path

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):  # quiet
            pass

        def _send(self, code, body: bytes, ctype="text/html; charset=utf-8"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path.startswith("/img/"):
                try:
                    image_id = int(parsed.path.rsplit("/", 1)[1])
                except ValueError:
                    return self._send(404, b"bad id")
                d = dbmod.DB(db_path)
                row = d.conn.execute("SELECT file_path FROM images WHERE id=?", (image_id,)).fetchone()
                d.close()
                if row and Path(row["file_path"]).is_file():
                    return self._send(200, Path(row["file_path"]).read_bytes(), "image/png")
                return self._send(404, b"not found")
            d, rows, hooks = _load(cfg)
            d.close()
            self._send(200, _page(rows, hooks, static=False).encode())

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            form = urllib.parse.parse_qs(self.rfile.read(length).decode())
            action = (form.get("action", [""])[0])
            d = dbmod.DB(db_path)
            if action == "hook_approve":
                d.approve_hook(form.get("hook_slug", [""])[0])
            else:
                copy_id = int(form.get("copy_id", ["0"])[0] or 0)
                title = form.get("title", [""])[0]
                description = form.get("description", [""])[0]
                if copy_id:
                    status = {"approve": "approved", "reject": "rejected"}.get(action)
                    d.set_copy_fields(copy_id, title=title, description=description,
                                      status=status, edited=True)
            d.close()
            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"Review gallery: http://127.0.0.1:{port}/   (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
