"""Stage 5 — Timeline. Pure computation, no APIs.

Reads per-scene audio durations plus the script's shot/focus/mood hints and
produces timeline.json: each scene's on-screen duration, its Ken Burns move
(zoom range + focal point), and the transition into it. This stage is where the
channel's "house style" lives — all deterministic, so you tweak numbers and
re-render to compare.
"""

from __future__ import annotations

from .. import ffmpeg

LEAD_IN = 0.4     # seconds of image before narration starts
TAIL = 0.7        # seconds of image after narration ends
CROSSFADE = 0.5   # default transition length
ZOOM_SPAN = 0.12  # subtle: 1.00 -> 1.12. Big zooms read as cheap.

# focus region -> normalized (x, y) the zoom converges toward
FOCUS_XY = {
    "center": (0.5, 0.5),
    "upper-left": (0.25, 0.28),
    "upper-right": (0.75, 0.28),
    "lower-left": (0.25, 0.72),
    "lower-right": (0.75, 0.72),
    "left": (0.22, 0.5),
    "right": (0.78, 0.5),
}


def run(project, cfg, backends, *, force=False, log=print):
    if project.exists(project.timeline_json) and not force:
        log("[timeline] cached — skipping")
        return

    scenes = project.load_script()
    entries = []
    for i, scene in enumerate(scenes):
        sid = scene["id"]
        audio_dur = ffmpeg.probe_duration(project.audio_path(sid))
        duration = round(LEAD_IN + audio_dur + TAIL, 3)

        # Alternate zoom direction so the video doesn't feel like one long push-in.
        zoom_in = (i % 2 == 0)
        if zoom_in:
            zoom_from, zoom_to = 1.0, 1.0 + ZOOM_SPAN
        else:
            zoom_from, zoom_to = 1.0 + ZOOM_SPAN, 1.0
        fx, fy = FOCUS_XY.get(scene.get("focus", "center"), (0.5, 0.5))

        # Hard cut on a sharp mood shift; otherwise crossfade.
        prev_mood = scenes[i - 1]["mood"] if i > 0 else None
        transition = "cut" if (prev_mood and _sharp_shift(prev_mood, scene["mood"])) else "fade"

        entries.append({
            "scene": sid,
            "duration": duration,
            "audio_duration": round(audio_dur, 3),
            "lead_in": LEAD_IN,
            "motion": {
                "zoom_from": round(zoom_from, 4),
                "zoom_to": round(zoom_to, 4),
                "focus_x": fx,
                "focus_y": fy,
                "direction": "in" if zoom_in else "out",
            },
            "transition": transition,
            "crossfade": CROSSFADE if transition == "fade" else 0.0,
        })

    total = round(sum(e["duration"] for e in entries)
                  - CROSSFADE * sum(1 for e in entries[1:] if e["transition"] == "fade"), 2)
    timeline = {
        "resolution": list(cfg.resolution),
        "fps": 30,
        "crossfade": CROSSFADE,
        "total_seconds": total,
        "scenes": entries,
    }
    project.write_json(project.timeline_json, timeline)
    log(f"[timeline] {len(entries)} scenes, ~{total:.1f}s total -> "
        f"{project.timeline_json}")


_INTENSE = {"tense", "ominous"}
_CALM = {"calm", "hopeful", "wonder", "somber"}


def _sharp_shift(a: str, b: str) -> bool:
    return (a in _CALM and b in _INTENSE) or (a in _INTENSE and b in _CALM)
