"""The StoryForge web server (stdlib http.server).

Routes:
  GET  /                                  -> SPA
  GET  /static/<file>                     -> UI assets
  GET  /api/projects                      -> [summary...]
  POST /api/projects                      -> create {name,premise,style,minutes,characters}
  GET  /api/projects/<n>                  -> full state (scenes + stages)
  POST /api/projects/<n>/run              -> {from,to,force,clear_scenes} start a run
  GET  /api/projects/<n>/status           -> live job status (poll target)
  GET  /api/projects/<n>/image/<id>       -> scene PNG
  GET  /api/projects/<n>/ref/<cid>/<k>    -> character reference PNG
  GET  /api/projects/<n>/video            -> final.mp4 (Range-enabled)
"""

from __future__ import annotations

import json
import os
import re
import posixpath
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

import yaml

from ..project import Project
from . import state as state_mod
from .jobs import JobManager

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")


class App:
    """Holds server-wide config: where projects live + the job manager."""
    def __init__(self, projects_dir: str):
        self.projects_dir = os.path.abspath(projects_dir)
        os.makedirs(self.projects_dir, exist_ok=True)
        self.jobs = JobManager()

    def project_root(self, name: str) -> str:
        return os.path.join(self.projects_dir, name)

    def list_projects(self) -> list[dict]:
        out = []
        for entry in sorted(os.listdir(self.projects_dir)):
            root = os.path.join(self.projects_dir, entry)
            if os.path.isdir(root):
                s = state_mod.project_summary(root)
                if s:
                    out.append(s)
        return out


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = "StoryForge"

        # ---- helpers ----
        def _send_json(self, obj, status=200):
            body = json.dumps(obj).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_bytes(self, data: bytes, content_type: str, status=200, extra=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def _error(self, status, msg):
            self._send_json({"error": msg}, status=status)

        def _body_json(self):
            length = int(self.headers.get("Content-Length", 0))
            if not length:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))

        def log_message(self, fmt, *args):  # quieter logging
            pass

        # ---- routing ----
        def do_GET(self):
            path = urlparse(self.path).path
            try:
                if path == "/" or path == "/index.html":
                    return self._serve_static("index.html")
                if path.startswith("/static/"):
                    return self._serve_static(path[len("/static/"):])
                if path == "/api/projects":
                    return self._send_json(app.list_projects())
                m = re.match(r"^/api/projects/([^/]+)$", path)
                if m:
                    return self._project_state(unquote(m.group(1)))
                m = re.match(r"^/api/projects/([^/]+)/status$", path)
                if m:
                    return self._status(unquote(m.group(1)))
                m = re.match(r"^/api/projects/([^/]+)/image/(\d+)$", path)
                if m:
                    return self._image(unquote(m.group(1)), int(m.group(2)))
                m = re.match(r"^/api/projects/([^/]+)/ref/([^/]+)/(\d+)$", path)
                if m:
                    return self._ref(unquote(m.group(1)), unquote(m.group(2)), int(m.group(3)))
                m = re.match(r"^/api/projects/([^/]+)/video$", path)
                if m:
                    return self._video(unquote(m.group(1)))
                return self._error(404, "not found")
            except BrokenPipeError:
                pass
            except Exception as e:
                return self._error(500, f"{type(e).__name__}: {e}")

        do_HEAD = do_GET

        def do_POST(self):
            path = urlparse(self.path).path
            try:
                if path == "/api/projects":
                    return self._create_project()
                m = re.match(r"^/api/projects/([^/]+)/run$", path)
                if m:
                    return self._run(unquote(m.group(1)))
                return self._error(404, "not found")
            except Exception as e:
                return self._error(500, f"{type(e).__name__}: {e}")

        # ---- handlers ----
        def _serve_static(self, rel):
            rel = posixpath.normpath(rel).lstrip("/")
            if rel.startswith(".."):
                return self._error(403, "forbidden")
            full = os.path.join(STATIC_DIR, rel)
            if not os.path.isfile(full):
                return self._error(404, "not found")
            ctype = {
                ".html": "text/html; charset=utf-8",
                ".js": "application/javascript",
                ".css": "text/css",
                ".svg": "image/svg+xml",
            }.get(os.path.splitext(full)[1], "application/octet-stream")
            with open(full, "rb") as fh:
                self._send_bytes(fh.read(), ctype)

        def _project_state(self, name):
            root = app.project_root(name)
            st = state_mod.full_state(root)
            if st is None:
                return self._error(404, "no such project")
            st["running"] = app.jobs.is_running(name)
            return self._send_json(st)

        def _status(self, name):
            job = app.jobs.get(name)
            if job is None:
                return self._send_json({"running": False, "log": [], "stage": None,
                                        "error": None, "done": False})
            return self._send_json(job.snapshot())

        def _create_project(self):
            data = self._body_json()
            name = (data.get("name") or "").strip()
            if not _NAME_RE.match(name):
                return self._error(400, "name must be 1-64 chars: letters, digits, - or _")
            root = app.project_root(name)
            if os.path.exists(os.path.join(root, "story.yaml")):
                return self._error(409, "a project with that name already exists")
            os.makedirs(root, exist_ok=True)

            characters = data.get("characters") or []
            if not characters:
                characters = [{"id": "protagonist",
                               "description": "TODO: locked appearance description"}]
            story = {
                "title": data.get("title") or name.replace("-", " ").title(),
                "premise": data.get("premise") or "TODO",
                "style": data.get("style") or
                    "storybook watercolor illustration, soft edges, cinematic lighting",
                "target_minutes": float(data.get("minutes", 3)),
                "aspect": data.get("aspect", "16:9"),
                "characters": [{"id": c["id"], "description": c["description"]}
                               for c in characters if c.get("id") and c.get("description")],
                "voice": {"provider": "stub", "voice_id": "", "pace": 1.0},
            }
            with open(os.path.join(root, "story.yaml"), "w", encoding="utf-8") as fh:
                yaml.safe_dump(story, fh, sort_keys=False, allow_unicode=True)
            return self._send_json(state_mod.full_state(root), status=201)

        def _run(self, name):
            root = app.project_root(name)
            if not os.path.exists(os.path.join(root, "story.yaml")):
                return self._error(404, "no such project")
            if app.jobs.is_running(name):
                return self._error(409, "a run is already in progress")
            data = self._body_json()
            clear = [int(x) for x in data.get("clear_scenes", [])]
            app.jobs.start(
                root,
                from_stage=data.get("from") or None,
                to_stage=data.get("to") or None,
                force=bool(data.get("force", False)),
                clear_scenes=clear,
            )
            return self._send_json({"started": True}, status=202)

        def _image(self, name, sid):
            p = Project(app.project_root(name)).image_path(sid)
            if not os.path.exists(p):
                return self._error(404, "no image")
            with open(p, "rb") as fh:
                self._send_bytes(fh.read(), "image/png")

        def _ref(self, name, cid, k):
            p = Project(app.project_root(name)).cast_ref_path(cid, k)
            if not os.path.exists(p):
                return self._error(404, "no reference")
            with open(p, "rb") as fh:
                self._send_bytes(fh.read(), "image/png")

        def _video(self, name):
            p = Project(app.project_root(name)).final_mp4
            if not os.path.exists(p):
                return self._error(404, "no video yet")
            size = os.path.getsize(p)
            rng = self.headers.get("Range")
            if rng and rng.startswith("bytes="):
                start_s, _, end_s = rng[len("bytes="):].partition("-")
                start = int(start_s) if start_s else 0
                end = int(end_s) if end_s else size - 1
                end = min(end, size - 1)
                start = min(start, end)
                length = end - start + 1
                with open(p, "rb") as fh:
                    fh.seek(start)
                    chunk = fh.read(length)
                self.send_response(206)
                self.send_header("Content-Type", "video/mp4")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.send_header("Content-Length", str(length))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(chunk)
                return
            with open(p, "rb") as fh:
                self._send_bytes(fh.read(), "video/mp4",
                                 extra={"Accept-Ranges": "bytes"})

    return Handler


def serve(projects_dir: str, host: str = "127.0.0.1", port: int = 8000):
    app = App(projects_dir)
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    print(f"StoryForge web app on http://{host}:{port}")
    print(f"projects dir: {app.projects_dir}")
    print(f"backends: llm={os.environ.get('STORYFORGE_LLM','stub')} "
          f"image={os.environ.get('STORYFORGE_IMAGE','stub')} "
          f"tts={os.environ.get('STORYFORGE_TTS','stub')}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        httpd.shutdown()
