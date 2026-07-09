"""LLM backend: turns a premise into a scene-decomposed script.

The output schema is the important part. We want the model to do the shot
direction — narration, one image prompt per scene (which deliberately OMITS
character appearance and style, since those are injected mechanically later),
and hints the timeline/motion planner uses (`shot`, `focus`, `mood`).
"""

from __future__ import annotations

import json
import os
import textwrap
from typing import Protocol

from ..config import StoryConfig

# The contract every LLM backend must satisfy.
SCENE_KEYS = ("id", "narration", "image_prompt", "characters_in_scene",
              "shot", "focus", "mood")

FOCUS_REGIONS = ("center", "upper-left", "upper-right",
                 "lower-left", "lower-right", "left", "right")
SHOTS = ("wide", "medium", "close")
MOODS = ("somber", "tense", "hopeful", "wonder", "calm", "ominous")


class LLMBackend(Protocol):
    def generate_script(self, cfg: StoryConfig) -> dict:
        """Return {"scenes": [ {SCENE_KEYS...}, ... ]}."""
        ...


def _validate(script: dict, cfg: StoryConfig) -> dict:
    scenes = script.get("scenes")
    if not scenes:
        raise ValueError("LLM returned no scenes")
    known = {c.id for c in cfg.characters}
    for i, s in enumerate(scenes, start=1):
        s["id"] = i  # renumber authoritatively
        for k in SCENE_KEYS:
            s.setdefault(k, "")
        if s["shot"] not in SHOTS:
            s["shot"] = "medium"
        if s["focus"] not in FOCUS_REGIONS:
            s["focus"] = "center"
        if not s["mood"]:
            s["mood"] = "calm"
        # keep only characters actually declared in the config
        s["characters_in_scene"] = [c for c in s.get("characters_in_scene", [])
                                    if c in known]
    return script


# --------------------------------------------------------------------------
# Stub — deterministic, offline. Produces a coherent, correctly-shaped script
# so the rest of the pipeline can run and be inspected without an API key.
# --------------------------------------------------------------------------

class StubLLM:
    def generate_script(self, cfg: StoryConfig) -> dict:
        n = cfg.target_scenes
        words_target = int(cfg.seconds_per_scene * cfg.words_per_second)
        char_ids = [c.id for c in cfg.characters]

        # A simple 3-act beat map so moods/shots vary rather than repeat.
        def beat(i: int):
            frac = i / max(1, n - 1)
            if frac < 0.15:
                return "establish", "wide", "wonder"
            if frac < 0.45:
                return "rising", "medium", "hopeful"
            if frac < 0.7:
                return "complication", "medium", "tense"
            if frac < 0.9:
                return "climax", "close", "ominous"
            return "resolution", "wide", "calm"

        focus_cycle = ["center", "upper-left", "right", "lower-right", "left", "upper-right"]
        scenes = []
        for i in range(n):
            stage, shot, mood = beat(i)
            who = [char_ids[i % len(char_ids)]] if char_ids else []
            narration = _stub_narration(cfg, i, n, stage, words_target)
            prompt = _stub_prompt(stage, shot, i)
            scenes.append({
                "id": i + 1,
                "narration": narration,
                "image_prompt": prompt,
                "characters_in_scene": who,
                "shot": shot,
                "focus": focus_cycle[i % len(focus_cycle)],
                "mood": mood,
            })
        return _validate({"scenes": scenes}, cfg)


def _stub_narration(cfg, i, n, stage, words_target) -> str:
    lead = {
        "establish": f"In the world of {cfg.title}, everything began quietly.",
        "rising": "Each day drew the story a little further from where it started.",
        "complication": "But nothing stays still for long, and a shadow crept in.",
        "climax": "Everything the story had been building toward arrived at once.",
        "resolution": "And when the dust settled, what remained was changed.",
    }[stage]
    filler = (
        "The scene unfolded slowly, image by image, the way these stories always do. "
        "Details gathered at the edges. The moment held, then moved on."
    )
    text = f"Scene {i + 1} of {n}. {lead} {filler}"
    words = text.split()
    if len(words) < words_target:
        words += (filler.split() * ((words_target // len(filler.split())) + 1))[
            : words_target - len(words)
        ]
    return " ".join(words[:words_target])


def _stub_prompt(stage, shot, i) -> str:
    subjects = [
        "a lone figure at the edge of a wide landscape",
        "a weathered doorway opening onto an unknown interior",
        "two figures facing each other across a small room",
        "a hand reaching toward an object just out of frame",
        "a distant silhouette against a dramatic sky",
        "an object resting on a table, lit from one side",
    ]
    return f"{subjects[i % len(subjects)]}, {shot} shot, cinematic composition"


# --------------------------------------------------------------------------
# Anthropic — real backend (requires `anthropic` + ANTHROPIC_API_KEY).
# --------------------------------------------------------------------------

class AnthropicLLM:
    def __init__(self):
        self.model = os.environ.get("STORYFORGE_LLM_MODEL", "claude-sonnet-5")

    def generate_script(self, cfg: StoryConfig) -> dict:
        try:
            import anthropic
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("pip install anthropic to use the anthropic LLM backend") from e

        client = anthropic.Anthropic()
        char_lines = "\n".join(f"- {c.id}: {c.description}" for c in cfg.characters)
        system = textwrap.dedent(f"""
            You are a story-video director. Break a premise into scenes for an
            illustrated, narrated video. Output STRICT JSON only:
            {{"scenes":[{{"narration": str, "image_prompt": str,
              "characters_in_scene": [id...], "shot": one of {list(SHOTS)},
              "focus": one of {list(FOCUS_REGIONS)},
              "mood": one of {list(MOODS)}}}]}}

            Rules:
            - Produce about {cfg.target_scenes} scenes.
            - Each narration is ~{int(cfg.seconds_per_scene * cfg.words_per_second)} words.
            - image_prompt describes composition/action ONLY. Do NOT describe a
              character's appearance or the art style — those are added later.
              Refer to characters by their id.
            - `focus` marks where the visual interest sits (drives the camera move).
        """).strip()
        user = f"Title: {cfg.title}\nPremise: {cfg.premise}\nCharacters:\n{char_lines}"

        msg = client.messages.create(
            model=self.model, max_tokens=8000,
            system=system, messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if b.type == "text")
        # tolerate code fences
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        return _validate(json.loads(text), cfg)
