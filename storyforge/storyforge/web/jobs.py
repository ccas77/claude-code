"""Background job runner. A run drives a slice of the pipeline in a worker
thread, appending log lines the UI polls for live progress. One job per project
at a time."""

from __future__ import annotations

import threading
import traceback

from .. import backends as backends_mod
from ..config import load_story
from ..project import Project
from ..stages import MODULES, ORDER


class Job:
    def __init__(self, project_name: str):
        self.project_name = project_name
        self.running = False
        self.current_stage: str | None = None
        self.log: list[str] = []
        self.error: str | None = None
        self.done = False
        self._lock = threading.Lock()

    def append(self, line: str):
        with self._lock:
            self.log.append(line)

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "running": self.running,
                "stage": self.current_stage,
                "log": list(self.log),
                "error": self.error,
                "done": self.done,
            }


class JobManager:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def get(self, name: str) -> Job | None:
        with self._lock:
            return self._jobs.get(name)

    def is_running(self, name: str) -> bool:
        job = self.get(name)
        return bool(job and job.running)

    def start(self, root: str, *, from_stage: str | None, to_stage: str | None,
              force: bool, clear_scenes: list[int]) -> Job:
        name = root.rsplit("/", 1)[-1]
        with self._lock:
            existing = self._jobs.get(name)
            if existing and existing.running:
                return existing
            job = Job(name)
            job.running = True
            self._jobs[name] = job

        t = threading.Thread(
            target=self._run, args=(job, root, from_stage, to_stage, force, clear_scenes),
            daemon=True,
        )
        t.start()
        return job

    def _run(self, job: Job, root: str, from_stage, to_stage, force, clear_scenes):
        try:
            project = Project(root)
            cfg = load_story(project.story_yaml)
            project.ensure_dirs()
            backends = backends_mod.select()

            # Clear specific scenes (regenerate flow): drop image/meta/clip so the
            # images + render stages rebuild only those.
            for sid in clear_scenes:
                for p in (project.image_path(sid), project.image_meta_path(sid),
                          project.scene_clip_path(sid)):
                    import os
                    if os.path.exists(p):
                        os.remove(p)
            if clear_scenes:
                job.append(f"[regen] cleared scenes {clear_scenes}")

            start = ORDER.index(from_stage) if from_stage else 0
            end = ORDER.index(to_stage) + 1 if to_stage else len(ORDER)
            for name in ORDER[start:end]:
                job.current_stage = name
                job.append(f"=== stage: {name} ===")
                MODULES[name].run(project, cfg, backends, force=force, log=job.append)
            job.append("✓ run complete")
        except Exception as e:
            job.error = f"{type(e).__name__}: {e}"
            job.append(f"ERROR: {job.error}")
            job.append(traceback.format_exc())
        finally:
            job.running = False
            job.current_stage = None
            job.done = True
