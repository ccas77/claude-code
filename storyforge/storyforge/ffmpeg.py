"""ffmpeg helpers: locating the binary, probing durations, building the
Ken Burns (zoompan) per-scene clips, and assembling the final video.

The Ken Burns look here is entirely local — a scripted zoom/pan over a still.
No video-generation model is involved, which is why it costs nothing and why
these channels can ship daily.
"""

from __future__ import annotations

import functools
import json
import os
import shutil
import subprocess
from dataclasses import dataclass


class FFmpegError(RuntimeError):
    pass


@functools.lru_cache(maxsize=1)
def ffmpeg_bin() -> str:
    """Prefer a system ffmpeg; fall back to the static binary that
    imageio-ffmpeg bundles so the pipeline runs with zero system setup."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - environment dependent
        raise FFmpegError(
            "no ffmpeg found on PATH and imageio-ffmpeg is not installed; "
            "`pip install imageio-ffmpeg` or install ffmpeg"
        ) from exc


@functools.lru_cache(maxsize=1)
def ffprobe_bin() -> str | None:
    return shutil.which("ffprobe")  # optional; we can probe with ffmpeg alone


def run(args: list[str], *, quiet: bool = True) -> None:
    cmd = [ffmpeg_bin(), "-y", *(["-loglevel", "error"] if quiet else []), *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FFmpegError(
            f"ffmpeg failed ({proc.returncode})\n"
            f"cmd: {' '.join(cmd)}\n"
            f"stderr:\n{proc.stderr[-4000:]}"
        )


def probe_duration(path: str) -> float:
    """Duration of a media file in seconds."""
    fp = ffprobe_bin()
    if fp:
        out = subprocess.run(
            [fp, "-v", "error", "-show_entries", "format=duration",
             "-of", "json", path],
            capture_output=True, text=True,
        )
        if out.returncode == 0:
            try:
                return float(json.loads(out.stdout)["format"]["duration"])
            except Exception:
                pass
    # Fallback: decode to null and read the reported time from ffmpeg stderr.
    proc = subprocess.run(
        [ffmpeg_bin(), "-i", path, "-f", "null", "-"],
        capture_output=True, text=True,
    )
    dur = 0.0
    for line in proc.stderr.splitlines():
        if "time=" in line:
            frag = line.split("time=")[-1].split(" ")[0]
            try:
                h, m, s = frag.split(":")
                dur = int(h) * 3600 + int(m) * 60 + float(s)
            except Exception:
                continue
    if dur <= 0:
        raise FFmpegError(f"could not determine duration of {path}")
    return dur


# --------------------------------------------------------------------------
# Ken Burns
# --------------------------------------------------------------------------

@dataclass
class Motion:
    """A resolved Ken Burns move for one scene."""
    zoom_from: float
    zoom_to: float
    # normalized pan target in [0,1] x [0,1] — where the zoom converges.
    focus_x: float
    focus_y: float


def build_scene_clip(
    image_path: str,
    out_path: str,
    *,
    duration: float,
    motion: Motion,
    width: int,
    height: int,
    fps: int = 30,
    ass_path: str | None = None,
) -> None:
    """Render one still into a Ken Burns clip.

    Key detail: zoompan sampling on a native-resolution still produces visible
    stair-step jitter. We first upscale to a large intermediate so the zoom
    interpolates smoothly, then zoompan, then scale to output size.
    """
    frames = max(1, round(duration * fps))
    # Upscale for the smooth-zoom intermediate. zoompan interpolates the zoom
    # against this larger frame, which removes the stair-step jitter you get
    # zooming a native-res still. 2x is enough for a subtle move and keeps the
    # per-frame cost sane; raise it if you push harder zooms.
    big_w, big_h = width * 2, height * 2

    z_from, z_to = motion.zoom_from, motion.zoom_to
    # zoompan increments z each frame; linear ramp from z_from to z_to.
    zoom_expr = f"{z_from}+({z_to}-{z_from})*on/{frames}"
    # Pan so that the focal point stays centered as we zoom.
    x_expr = f"(iw-iw/zoom)*{motion.focus_x:.4f}"
    y_expr = f"(ih-ih/zoom)*{motion.focus_y:.4f}"

    vf = (
        f"scale={big_w}:{big_h}:force_original_aspect_ratio=increase,"
        f"crop={big_w}:{big_h},"
        f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}'"
        f":d={frames}:s={width}x{height}:fps={fps}"
    )
    if ass_path:
        # libass reads the .ass file; escape the path for the filtergraph.
        esc = ass_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        vf += f",subtitles='{esc}'"

    run([
        "-loop", "1", "-i", image_path,
        "-t", f"{duration:.3f}",
        "-vf", vf,
        "-c:v", "libx264", "-preset", os.environ.get("STORYFORGE_X264_PRESET", "veryfast"),
        "-crf", "20", "-pix_fmt", "yuv420p",
        "-r", str(fps),
        out_path,
    ])


def assemble(
    scene_clips: list[str],
    out_path: str,
    *,
    narration: str,      # concatenated narration wav/mp3 for the whole video
    music: str | None,
    crossfade: float,
    fps: int = 30,
) -> None:
    """Concat the scene clips with crossfades, then mux narration (+ ducked music)."""
    if not scene_clips:
        raise FFmpegError("no scene clips to assemble")

    inputs: list[str] = []
    for c in scene_clips:
        inputs += ["-i", c]
    inputs += ["-i", narration]
    narration_idx = len(scene_clips)

    filt: list[str] = []
    if len(scene_clips) == 1:
        video_label = "0:v"
    else:
        # chain xfade across all clips; offset accumulates (dur - crossfade) each step.
        durations = [probe_duration(c) for c in scene_clips]
        prev = "0:v"
        offset = durations[0] - crossfade
        for i in range(1, len(scene_clips)):
            out_lbl = f"vx{i}"
            filt.append(
                f"[{prev}][{i}:v]xfade=transition=fade:duration={crossfade}:"
                f"offset={offset:.3f}[{out_lbl}]"
            )
            prev = out_lbl
            if i < len(scene_clips) - 1:
                offset += durations[i] - crossfade
        video_label = prev

    # Audio: narration full volume; music (optional) ducked under it via sidechain.
    audio_inputs = inputs
    if music:
        audio_inputs = inputs + ["-i", music]
        music_idx = narration_idx + 1
        filt.append(
            f"[{music_idx}:a]volume=0.35[bg]"
        )
        filt.append(
            f"[bg][{narration_idx}:a]sidechaincompress=threshold=0.03:ratio=8:"
            f"attack=20:release=400[duck]"
        )
        filt.append(
            f"[{narration_idx}:a][duck]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )
        audio_label = "aout"
    else:
        audio_label = f"{narration_idx}:a"

    filter_complex = ";".join(filt) if filt else None

    args = list(audio_inputs)
    if filter_complex:
        args += ["-filter_complex", filter_complex]
    args += [
        "-map", f"[{video_label}]" if filt and video_label.startswith("vx") else video_label,
        "-map", f"[{audio_label}]" if audio_label == "aout" else audio_label,
        "-c:v", "libx264", "-preset", os.environ.get("STORYFORGE_X264_PRESET", "veryfast"),
        "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(fps),
        "-c:a", "aac", "-b:a", "192k",
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",  # YouTube-ish loudness target
        "-shortest",
        out_path,
    ]
    run(args)


def concat_audio(clips: list[str], out_path: str) -> None:
    """Concatenate per-scene narration into a single track (re-encoded to be safe)."""
    if not clips:
        raise FFmpegError("no audio clips to concatenate")
    list_file = out_path + ".txt"
    with open(list_file, "w", encoding="utf-8") as fh:
        for c in clips:
            fh.write(f"file '{os.path.abspath(c)}'\n")
    run([
        "-f", "concat", "-safe", "0", "-i", list_file,
        "-c:a", "aac", "-b:a", "192k", out_path,
    ])
    os.remove(list_file)


def silent_track(out_path: str, duration: float) -> None:
    """A near-silent narration track — used by the stub TTS so the pipeline
    produces a real, correctly-timed audio stream with no external service."""
    run([
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
        "-t", f"{duration:.3f}", "-c:a", "libmp3lame", "-q:a", "9", out_path,
    ])
