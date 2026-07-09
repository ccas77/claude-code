"""Stage 4 — Voiceover. TTS per scene, with word-level timestamps saved
alongside for caption timing. Per-scene synthesis means scene boundaries fall
exactly on audio boundaries — the timeline stage just reads the durations."""

from __future__ import annotations

import os


def run(project, cfg, backends, *, force=False, log=print):
    project.ensure_dirs()
    scenes = project.load_script()

    for scene in scenes:
        sid = scene["id"]
        mp3 = project.audio_path(sid)
        words = project.words_path(sid)
        if project.exists(mp3) and project.exists(words) and not force:
            log(f"[voiceover] scene {sid:03d}: cached — skipping")
            continue

        timings = backends.tts.synthesize(
            scene["narration"], cfg, mp3_path=mp3, words_path_hint=words,
        )
        project.write_json(words, {"scene": sid, "words": timings})
        log(f"[voiceover] scene {sid:03d}: {len(timings)} words -> "
            f"{os.path.basename(mp3)}")
