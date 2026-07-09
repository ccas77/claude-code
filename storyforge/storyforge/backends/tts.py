"""TTS backend: narration audio per scene, with word-level timestamps.

We synthesize per scene (not one long file) so scene boundaries land exactly
on audio boundaries — no forced-alignment step. Word timestamps are saved
alongside and become the caption timing for free.
"""

from __future__ import annotations

import os
from typing import Protocol

from ..config import StoryConfig
from .. import ffmpeg


class TTSBackend(Protocol):
    def synthesize(
        self, text: str, cfg: StoryConfig, *, mp3_path: str, words_path_hint: str
    ) -> list[dict]:
        """Write an mp3 to mp3_path and return word timings
        [{"word": str, "start": float, "end": float}, ...]."""
        ...


def _even_word_timings(text: str, duration: float) -> list[dict]:
    words = text.split()
    if not words:
        return []
    per = duration / len(words)
    out = []
    t = 0.0
    for w in words:
        out.append({"word": w, "start": round(t, 3), "end": round(t + per, 3)})
        t += per
    return out


# --------------------------------------------------------------------------
# Stub — produces a real, correctly-sized (near-silent) mp3 whose length is
# derived from the word count and configured speaking pace, plus evenly spaced
# word timings. The rest of the pipeline (timeline, captions) then behaves
# exactly as it would with real narration.
# --------------------------------------------------------------------------

class StubTTS:
    def synthesize(self, text, cfg, *, mp3_path, words_path_hint):
        words = max(1, len(text.split()))
        wps = max(0.5, cfg.words_per_second * cfg.voice.pace)
        duration = max(1.5, words / wps)
        ffmpeg.silent_track(mp3_path, duration)
        return _even_word_timings(text, duration)


# --------------------------------------------------------------------------
# ElevenLabs — real backend. Requires `elevenlabs` + ELEVENLABS_API_KEY and a
# voice_id in story.yaml. Uses the timestamps endpoint for word timings.
# --------------------------------------------------------------------------

class ElevenLabsTTS:
    def synthesize(self, text, cfg, *, mp3_path, words_path_hint):
        try:
            from elevenlabs.client import ElevenLabs
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("pip install elevenlabs to use the elevenlabs tts backend") from e

        client = ElevenLabs()
        voice_id = cfg.voice.voice_id or os.environ.get("ELEVENLABS_VOICE_ID", "")
        if not voice_id:
            raise RuntimeError("elevenlabs backend needs voice.voice_id in story.yaml")

        result = client.text_to_speech.convert_with_timestamps(
            voice_id=voice_id,
            text=text,
            model_id=os.environ.get("STORYFORGE_TTS_MODEL", "eleven_multilingual_v2"),
        )
        os.makedirs(os.path.dirname(mp3_path), exist_ok=True)
        import base64
        with open(mp3_path, "wb") as fh:
            fh.write(base64.b64decode(result.audio_base_64))

        # Convert character-level timestamps into word timings.
        chars = result.alignment.characters
        starts = result.alignment.character_start_times_seconds
        ends = result.alignment.character_end_times_seconds
        return _chars_to_words(chars, starts, ends)


def _chars_to_words(chars, starts, ends) -> list[dict]:
    words, cur, w_start = [], "", None
    for ch, st, en in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append({"word": cur, "start": round(w_start, 3), "end": round(prev_en, 3)})
                cur = ""
            continue
        if not cur:
            w_start = st
        cur += ch
        prev_en = en
    if cur:
        words.append({"word": cur, "start": round(w_start, 3), "end": round(prev_en, 3)})
    return words
