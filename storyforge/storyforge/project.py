"""Project directory layout and stage-caching helpers.

A project is a directory. Its files are the pipeline state — there is no
database. Each stage checks whether its outputs already exist (via `Project`)
and skips itself if so, unless `force` is set.
"""

from __future__ import annotations

import json
import os
from typing import Any


class Project:
    def __init__(self, root: str):
        self.root = os.path.abspath(root)

    # ----- well-known paths -----
    @property
    def story_yaml(self) -> str:
        return os.path.join(self.root, "story.yaml")

    @property
    def script_json(self) -> str:
        return os.path.join(self.root, "script.json")

    @property
    def cast_dir(self) -> str:
        return os.path.join(self.root, "cast")

    @property
    def images_dir(self) -> str:
        return os.path.join(self.root, "images")

    @property
    def audio_dir(self) -> str:
        return os.path.join(self.root, "audio")

    @property
    def timeline_json(self) -> str:
        return os.path.join(self.root, "timeline.json")

    @property
    def out_dir(self) -> str:
        return os.path.join(self.root, "out")

    @property
    def scenes_dir(self) -> str:
        return os.path.join(self.out_dir, "scenes")

    @property
    def final_mp4(self) -> str:
        return os.path.join(self.out_dir, "final.mp4")

    @property
    def review_html(self) -> str:
        return os.path.join(self.root, "review.html")

    # per-scene asset paths
    def image_path(self, scene_id: int) -> str:
        return os.path.join(self.images_dir, f"{scene_id:03d}.png")

    def image_meta_path(self, scene_id: int) -> str:
        return os.path.join(self.images_dir, f"{scene_id:03d}.meta.json")

    def audio_path(self, scene_id: int) -> str:
        return os.path.join(self.audio_dir, f"{scene_id:03d}.mp3")

    def words_path(self, scene_id: int) -> str:
        return os.path.join(self.audio_dir, f"{scene_id:03d}.words.json")

    def scene_clip_path(self, scene_id: int) -> str:
        return os.path.join(self.scenes_dir, f"{scene_id:03d}.mp4")

    def cast_desc_path(self, cid: str) -> str:
        return os.path.join(self.cast_dir, f"{cid}.json")

    def cast_ref_path(self, cid: str, n: int) -> str:
        return os.path.join(self.cast_dir, f"{cid}_ref_{n}.png")

    # ----- helpers -----
    def ensure_dirs(self) -> None:
        for d in (self.cast_dir, self.images_dir, self.audio_dir,
                  self.out_dir, self.scenes_dir):
            os.makedirs(d, exist_ok=True)

    def exists(self, path: str) -> bool:
        return os.path.exists(path) and os.path.getsize(path) > 0

    def read_json(self, path: str) -> Any:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def write_json(self, path: str, data: Any) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, path)  # atomic: a crash mid-write never leaves a half file

    def load_script(self) -> list[dict]:
        return self.read_json(self.script_json)["scenes"]
