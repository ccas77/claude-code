"""QC backend: detect character drift.

After each scene image is generated, compare the character's face in it against
the canonical reference. Similarity below a threshold means the model drifted;
the images stage regenerates (up to a retry limit), then flags for review.
This automates the "audit every 10th frame" advice into the pipeline.

The stub always passes (so offline runs don't loop). The InsightFace backend is
the real, local (CPU-capable) face-embedding check.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


@dataclass
class QCResult:
    passed: bool
    score: float          # cosine similarity to reference, 0..1 (1 == identical)
    note: str = ""


class QCBackend(Protocol):
    threshold: float

    def check(self, image_path: str, reference_paths: list[str]) -> QCResult:
        ...


class StubQC:
    threshold = 0.0

    def check(self, image_path, reference_paths) -> QCResult:
        return QCResult(passed=True, score=1.0, note="stub qc (no drift check)")


class InsightFaceQC:
    """Real drift check. Best for realistic/semi-realistic styles; for heavily
    stylized art a vision-LLM 'same character? yes/no' check is more reliable."""

    def __init__(self):
        self.threshold = float(os.environ.get("STORYFORGE_QC_THRESHOLD", "0.35"))
        self._app = None

    def _lazy(self):
        if self._app is None:  # pragma: no cover - heavy optional dep
            from insightface.app import FaceAnalysis
            app = FaceAnalysis(name="buffalo_l")
            app.prepare(ctx_id=-1, det_size=(640, 640))
            self._app = app
        return self._app

    def _embed(self, path):  # pragma: no cover - heavy optional dep
        import numpy as np
        from PIL import Image
        app = self._lazy()
        faces = app.get(np.array(Image.open(path).convert("RGB")))
        if not faces:
            return None
        return max(faces, key=lambda f: f.det_score).normed_embedding

    def check(self, image_path, reference_paths) -> QCResult:  # pragma: no cover
        import numpy as np
        emb = self._embed(image_path)
        if emb is None:
            return QCResult(False, 0.0, "no face detected in generated image")
        best = 0.0
        for ref in reference_paths:
            ref_emb = self._embed(ref)
            if ref_emb is None:
                continue
            best = max(best, float(np.dot(emb, ref_emb)))
        return QCResult(best >= self.threshold, best,
                        f"cosine={best:.3f} vs threshold {self.threshold}")
