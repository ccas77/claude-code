"""Build ASS subtitle files from word-level timings.

Words are grouped into short phrases (a few words each) so captions read as
karaoke-style chunks rather than one static block. Timing is relative to the
scene clip, so we shift word times by the scene's lead-in.
"""

from __future__ import annotations

MAX_WORDS_PER_CUE = 6
MAX_CHARS_PER_CUE = 42


def _fmt_time(t: float) -> str:
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h:d}:{m:02d}:{s:05.2f}"


def group_words(words: list[dict]) -> list[dict]:
    cues, cur, chars = [], [], 0
    for w in words:
        wl = len(w["word"]) + 1
        if cur and (len(cur) >= MAX_WORDS_PER_CUE or chars + wl > MAX_CHARS_PER_CUE):
            cues.append(_cue(cur))
            cur, chars = [], 0
        cur.append(w)
        chars += wl
    if cur:
        cues.append(_cue(cur))
    return cues


def _cue(words: list[dict]) -> dict:
    return {
        "text": " ".join(w["word"] for w in words),
        "start": words[0]["start"],
        "end": words[-1]["end"],
    }


def write_ass(words: list[dict], out_path: str, *, offset: float,
              width: int, height: int) -> None:
    """Write an ASS file for one scene. `offset` (lead-in) shifts word times so
    captions line up with narration inside the clip."""
    font_size = max(28, int(height * 0.045))
    margin_v = int(height * 0.08)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,DejaVu Sans,{font_size},&H00FFFFFF,&H00000000,&H96000000,1,1,3,1,2,60,60,{margin_v}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    for cue in group_words(words):
        start = _fmt_time(cue["start"] + offset)
        end = _fmt_time(cue["end"] + offset)
        text = cue["text"].replace("\n", " ").replace("{", "(").replace("}", ")")
        lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}\n")

    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("".join(lines))
