"""Image backend: generate one illustration per scene.

This is the consistency core. The *stage* (stages/images.py) assembles the
final prompt as:

    scene.image_prompt + locked character description(s) + style lock

and passes the character reference images alongside. A reference-based image
model (Gemini "Nano Banana", Flux+PuLID, Midjourney --cref, ...) uses those
references to hold the character's identity steady across every scene. That
injection — not careful per-scene prompting — is why the protagonist looks the
same in every frame.
"""

from __future__ import annotations

import hashlib
import os
from typing import Protocol


class ImageBackend(Protocol):
    def generate(
        self,
        prompt: str,
        *,
        references: list[str],
        width: int,
        height: int,
        seed: int | None,
        out_path: str,
    ) -> None:
        """Write a PNG to out_path."""
        ...


def _seed_from(prompt: str, seed: int | None) -> int:
    if seed is not None:
        return seed
    return int(hashlib.sha256(prompt.encode()).hexdigest(), 16) % (2**31)


# --------------------------------------------------------------------------
# Stub — renders a legible placeholder frame with PIL. Distinct per scene so
# the Ken Burns motion is actually observable in the output video, and it
# surfaces the exact prompt + references so you can review the pipeline offline.
# --------------------------------------------------------------------------

class StubImage:
    def generate(self, prompt, *, references, width, height, seed, out_path):
        from PIL import Image, ImageDraw, ImageFont

        rng = _seed_from(prompt, seed)
        # deterministic dusk-ish palette derived from the seed
        base = ((rng >> 3) % 60 + 20, (rng >> 9) % 60 + 30, (rng >> 15) % 80 + 60)
        top = tuple(min(255, c + 60) for c in base)

        img = Image.new("RGB", (width, height), base)
        draw = ImageDraw.Draw(img)
        # vertical gradient
        for y in range(height):
            t = y / height
            col = tuple(int(top[i] * (1 - t) + base[i] * t) for i in range(3))
            draw.line([(0, y), (width, y)], fill=col)

        # a "subject" marker so successive frames differ visibly
        cx = int(width * (0.3 + 0.4 * ((rng >> 5) % 100) / 100))
        cy = int(height * 0.62)
        r = int(min(width, height) * 0.12)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     fill=tuple(min(255, c + 90) for c in base),
                     outline=(255, 255, 255), width=3)

        font_big = _font(int(height * 0.05))
        font_small = _font(int(height * 0.028))
        draw.text((int(width * 0.04), int(height * 0.05)),
                  "STORYFORGE — stub image", font=font_small, fill=(255, 255, 255))
        _wrapped(draw, prompt, (int(width * 0.04), int(height * 0.80)),
                 font_small, width - int(width * 0.08), fill=(240, 240, 240))
        if references:
            names = ", ".join(os.path.basename(r) for r in references)
            draw.text((int(width * 0.04), int(height * 0.11)),
                      f"refs: {names}", font=font_small, fill=(210, 230, 255))

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        img.save(out_path)


def _font(size: int):
    from PIL import ImageFont
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _wrapped(draw, text, xy, font, max_w, fill):
    words, line, y = text.split(), "", xy[1]
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            line = trial
        else:
            draw.text((xy[0], y), line, font=font, fill=fill)
            y += int(font.size * 1.25)
            line = w
    if line:
        draw.text((xy[0], y), line, font=font, fill=fill)


# --------------------------------------------------------------------------
# Gemini ("Nano Banana") — real backend.
# Requires `google-genai` and GEMINI_API_KEY. Reference images are passed as
# additional image parts; the model keeps the character consistent.
# --------------------------------------------------------------------------

class GeminiImage:
    def __init__(self):
        self.model = os.environ.get("STORYFORGE_IMAGE_MODEL", "gemini-2.5-flash-image")

    def generate(self, prompt, *, references, width, height, seed, out_path):
        try:
            from google import genai
        except ImportError as e:  # pragma: no cover
            raise RuntimeError("pip install google-genai to use the gemini image backend") from e
        from PIL import Image
        import io

        client = genai.Client()
        parts: list = [prompt]
        for ref in references:
            parts.append(Image.open(ref))

        resp = client.models.generate_content(model=self.model, contents=parts)
        for part in resp.candidates[0].content.parts:
            data = getattr(getattr(part, "inline_data", None), "data", None)
            if data:
                img = Image.open(io.BytesIO(data)).convert("RGB")
                img = img.resize((width, height))
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                img.save(out_path)
                return
        raise RuntimeError("gemini returned no image part")
