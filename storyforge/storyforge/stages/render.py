"""Stage 6 — Render. All local, all ffmpeg.

Two passes:
  1. Per-scene Ken Burns clips (cached individually, so re-editing one image's
     source only re-renders that one scene). Captions are burned in from the
     scene's word timings.
  2. Assembly: concat clips with the timeline's crossfades, concat the narration
     into one track, mux it (plus ducked music), normalize loudness, encode.
"""

from __future__ import annotations

import os

from .. import ffmpeg, captions


def run(project, cfg, backends, *, force=False, log=print):
    project.ensure_dirs()
    timeline = project.read_json(project.timeline_json)
    scenes = timeline["scenes"]
    width, height = timeline["resolution"]
    fps = timeline["fps"]

    # ---- pass 1: per-scene clips ----
    clip_paths = []
    for entry in scenes:
        sid = entry["scene"]
        clip = project.scene_clip_path(sid)
        clip_paths.append(clip)
        if project.exists(clip) and not force:
            log(f"[render] scene {sid:03d}: clip cached — skipping")
            continue

        # captions for this scene
        ass_path = os.path.join(project.scenes_dir, f"{sid:03d}.ass")
        words = project.read_json(project.words_path(sid))["words"]
        captions.write_ass(words, ass_path, offset=entry["lead_in"],
                           width=width, height=height)

        m = entry["motion"]
        motion = ffmpeg.Motion(
            zoom_from=m["zoom_from"], zoom_to=m["zoom_to"],
            focus_x=m["focus_x"], focus_y=m["focus_y"],
        )
        ffmpeg.build_scene_clip(
            project.image_path(sid), clip,
            duration=entry["duration"], motion=motion,
            width=width, height=height, fps=fps, ass_path=ass_path,
        )
        log(f"[render] scene {sid:03d}: {entry['duration']:.1f}s "
            f"zoom-{m['direction']} -> {os.path.basename(clip)}")

    # ---- pass 2: narration track + assembly ----
    log("[render] concatenating narration track")
    narration = os.path.join(project.out_dir, "narration.m4a")
    ffmpeg.concat_audio([project.audio_path(e["scene"]) for e in scenes], narration)

    log("[render] assembling final video")
    ffmpeg.assemble(
        clip_paths, project.final_mp4,
        narration=narration, music=cfg.music,
        crossfade=timeline["crossfade"], fps=fps,
    )
    dur = ffmpeg.probe_duration(project.final_mp4)
    log(f"[render] done -> {project.final_mp4} ({dur:.1f}s)")
