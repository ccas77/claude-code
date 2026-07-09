"""Swappable backend interfaces.

Every stage that touches an external AI service goes through one of these
protocols, so the choice of provider is a config/env decision rather than a
code change. Selection happens in `select()` below, driven by env vars:

    STORYFORGE_LLM     = stub | anthropic          (default: stub)
    STORYFORGE_IMAGE   = stub | gemini             (default: stub)
    STORYFORGE_TTS     = stub | elevenlabs         (default: stub)
    STORYFORGE_QC      = stub | insightface        (default: stub)

The "stub" backends need no API keys and produce real, inspectable assets, so
the whole pipeline runs end-to-end offline. Swap any one to a real provider
without touching the stages.
"""

from __future__ import annotations

import os

from .image import GeminiImage, ImageBackend, StubImage
from .llm import AnthropicLLM, LLMBackend, StubLLM
from .qc import InsightFaceQC, QCBackend, StubQC
from .tts import ElevenLabsTTS, StubTTS, TTSBackend

__all__ = [
    "LLMBackend", "ImageBackend", "TTSBackend", "QCBackend", "Backends", "select",
]


class Backends:
    def __init__(self, llm: LLMBackend, image: ImageBackend,
                 tts: TTSBackend, qc: QCBackend):
        self.llm = llm
        self.image = image
        self.tts = tts
        self.qc = qc


def select() -> Backends:
    llm_name = os.environ.get("STORYFORGE_LLM", "stub").lower()
    img_name = os.environ.get("STORYFORGE_IMAGE", "stub").lower()
    tts_name = os.environ.get("STORYFORGE_TTS", "stub").lower()
    qc_name = os.environ.get("STORYFORGE_QC", "stub").lower()

    llm: LLMBackend = {"stub": StubLLM, "anthropic": AnthropicLLM}[llm_name]()
    image: ImageBackend = {"stub": StubImage, "gemini": GeminiImage}[img_name]()
    tts: TTSBackend = {"stub": StubTTS, "elevenlabs": ElevenLabsTTS}[tts_name]()
    qc: QCBackend = {"stub": StubQC, "insightface": InsightFaceQC}[qc_name]()
    return Backends(llm, image, tts, qc)
