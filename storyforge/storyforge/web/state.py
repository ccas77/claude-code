"""Compute a project's pipeline state for the UI: which stages are done and the
per-scene storyboard status. Reads the filesystem — the same source of truth
the stages cache against — so it never disagrees with what a run would skip.
"""

from __future__ import annotations

import os

from ..config import StoryConfig, load_story
from ..project import Project
from ..stages import ORDER


def stage_status(project: Project, cfg: StoryConfig) -> dict[str, bool]:
    """Which stages have complete outputs on disk."""
    scenes = []
    if project.exists(project.script_json):
        scenes = project.load_script()
    n = len(scenes)

    script_done = n > 0
    cast_done = script_done and all(
        project.exists(project.cast_desc_path(c.id)) for c in cfg.characters
    ) if cfg.characters else script_done
    images_done = script_done and n > 0 and all(
        project.exists(project.image_path(s["id"])) for s in scenes
    )
    voice_done = script_done and n > 0 and all(
        project.exists(project.audio_path(s["id"])) and
        project.exists(project.words_path(s["id"])) for s in scenes
    )
    timeline_done = project.exists(project.timeline_json)
    render_done = project.exists(project.final_mp4)
    return {
        "script": script_done,
        "cast": cast_done,
        "images": images_done,
        "voiceover": voice_done,
        "timeline": timeline_done,
        "render": render_done,
    }


def scene_cards(project: Project) -> list[dict]:
    if not project.exists(project.script_json):
        return []
    cards = []
    for s in project.load_script():
        sid = s["id"]
        meta = {}
        if project.exists(project.image_meta_path(sid)):
            try:
                meta = project.read_json(project.image_meta_path(sid))
            except Exception:
                meta = {}
        cards.append({
            "id": sid,
            "narration": s.get("narration", ""),
            "image_prompt": s.get("image_prompt", ""),
            "final_prompt": meta.get("prompt", ""),
            "shot": s.get("shot", ""),
            "mood": s.get("mood", ""),
            "focus": s.get("focus", ""),
            "characters": s.get("characters_in_scene", []),
            "has_image": project.exists(project.image_path(sid)),
            "qc_score": meta.get("qc_score"),
            "flagged": bool(meta.get("flagged_for_review")),
        })
    return cards


def project_summary(root: str) -> dict | None:
    project = Project(root)
    if not os.path.exists(project.story_yaml):
        return None
    try:
        cfg = load_story(project.story_yaml)
    except Exception as e:
        return {"name": os.path.basename(root), "title": os.path.basename(root),
                "error": f"invalid story.yaml: {e}", "stages": {}, "has_video": False}
    stages = stage_status(project, cfg)
    return {
        "name": os.path.basename(root),
        "title": cfg.title,
        "stages": stages,
        "stage_order": ORDER,
        "has_video": stages["render"],
        "target_minutes": cfg.target_minutes,
        "aspect": cfg.aspect,
    }


def full_state(root: str) -> dict | None:
    summary = project_summary(root)
    if summary is None:
        return None
    project = Project(root)
    summary["scenes"] = scene_cards(project)
    if os.path.exists(project.story_yaml):
        try:
            cfg = load_story(project.story_yaml)
            summary["premise"] = cfg.premise
            summary["style"] = cfg.style
            summary["characters"] = [
                {"id": c.id, "description": c.description} for c in cfg.characters
            ]
        except Exception:
            pass
    return summary
