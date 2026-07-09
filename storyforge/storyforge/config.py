"""Loading and validating story.yaml into typed config objects."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import yaml


@dataclass
class Character:
    id: str
    # The "locked description" — the exact string injected verbatim into every
    # image prompt this character appears in. Keeping it identical across scenes
    # is half of what holds identity steady (the reference images are the other half).
    description: str
    # Optional: reference images the cast stage should use instead of generating.
    references: list[str] = field(default_factory=list)


@dataclass
class VoiceConfig:
    provider: str = "stub"
    voice_id: str = ""
    pace: float = 1.0


@dataclass
class StoryConfig:
    title: str
    premise: str
    style: str  # the "style lock" — appended to every image prompt
    characters: list[Character]
    target_minutes: float = 6.0
    aspect: str = "16:9"
    voice: VoiceConfig = field(default_factory=VoiceConfig)
    music: str | None = None
    # words of narration per second, used to size scenes and (in the stub) audio.
    words_per_second: float = 2.6
    seconds_per_scene: float = 19.0

    # ----- derived -----
    @property
    def resolution(self) -> tuple[int, int]:
        return ASPECT_TABLE.get(self.aspect, (1920, 1080))

    @property
    def target_scenes(self) -> int:
        secs = self.target_minutes * 60.0
        return max(1, round(secs / self.seconds_per_scene))

    def character(self, cid: str) -> Character | None:
        for c in self.characters:
            if c.id == cid:
                return c
        return None


ASPECT_TABLE: dict[str, tuple[int, int]] = {
    "16:9": (1920, 1080),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
}


def load_story(path: str) -> StoryConfig:
    with open(path, "r", encoding="utf-8") as fh:
        raw: dict[str, Any] = yaml.safe_load(fh) or {}

    missing = [k for k in ("title", "premise", "style") if not raw.get(k)]
    if missing:
        raise ValueError(f"story config {path} is missing required keys: {missing}")

    chars = []
    for c in raw.get("characters", []):
        if not c.get("id") or not c.get("description"):
            raise ValueError(f"each character needs 'id' and 'description': got {c!r}")
        chars.append(
            Character(
                id=c["id"],
                description=c["description"],
                references=list(c.get("references", [])),
            )
        )

    v = raw.get("voice", {}) or {}
    voice = VoiceConfig(
        provider=v.get("provider", "stub"),
        voice_id=v.get("voice_id", ""),
        pace=float(v.get("pace", 1.0)),
    )

    if raw.get("aspect", "16:9") not in ASPECT_TABLE:
        raise ValueError(
            f"aspect {raw['aspect']!r} not supported; choose one of {sorted(ASPECT_TABLE)}"
        )

    return StoryConfig(
        title=raw["title"],
        premise=raw["premise"],
        style=raw["style"],
        characters=chars,
        target_minutes=float(raw.get("target_minutes", 6.0)),
        aspect=raw.get("aspect", "16:9"),
        voice=voice,
        music=_resolve_music(raw.get("music"), path),
        words_per_second=float(raw.get("words_per_second", 2.6)),
        seconds_per_scene=float(raw.get("seconds_per_scene", 19.0)),
    )


def _resolve_music(music: str | None, story_path: str) -> str | None:
    if not music:
        return None
    if os.path.isabs(music):
        return music
    # resolve relative to the story.yaml location
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(story_path)), music))
