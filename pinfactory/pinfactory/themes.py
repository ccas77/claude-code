"""Load per-pen-name colour palettes and fonts from themes.yaml.

themes.yaml is user-editable. It has a `defaults` block plus an optional
`pen_names` map. Any pen name not listed falls back to `defaults`, so the app
never needs the file to be complete and never invents a look you didn't specify
— it just reuses the neutral default palette and tells you it did.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from PIL import ImageFont

# Neutral, genre-appropriate fallback used when themes.yaml is missing entirely.
_BUILTIN_DEFAULTS: dict[str, Any] = {
    "fonts": {
        "headline": "Gloock-Regular.ttf",
        "headline_alt": "CrimsonPro-Bold.ttf",
        "body": "WorkSans-Regular.ttf",
        "body_bold": "WorkSans-Bold.ttf",
        "serif": "Lora-Regular.ttf",
        "serif_italic": "Lora-Italic.ttf",
        "accent": "NothingYouCouldDo-Regular.ttf",
    },
    "palette": {
        "bg_top": "#2A1B2E",
        "bg_bottom": "#100A16",
        "scrim": "#05030A",
        "headline": "#F5E9DA",
        "subtext": "#D8C9BC",
        "accent": "#C98A5E",
        "band": "#1B1220",
    },
}


@dataclass
class Theme:
    pen_name: str
    palette: dict[str, str]
    fonts: dict[str, str]
    is_fallback: bool  # True when the pen name wasn't in themes.yaml


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


class ThemeSet:
    def __init__(self, themes_path: Path, fonts_dir: Path):
        self.fonts_dir = Path(fonts_dir)
        raw: dict[str, Any] = {}
        if themes_path and Path(themes_path).is_file():
            with open(themes_path, "r", encoding="utf-8") as fh:
                raw = yaml.safe_load(fh) or {}
        self.defaults = _deep_merge(_BUILTIN_DEFAULTS, raw.get("defaults", {}))
        self.pen_names: dict[str, Any] = raw.get("pen_names", {}) or {}

    def for_pen_name(self, pen_name: str, palette_key: str | None = None) -> Theme:
        key = palette_key or pen_name
        entry = self.pen_names.get(key) or self.pen_names.get(pen_name)
        is_fallback = entry is None
        merged = _deep_merge(self.defaults, entry or {})
        return Theme(
            pen_name=pen_name,
            palette=dict(merged["palette"]),
            fonts=dict(merged["fonts"]),
            is_fallback=is_fallback,
        )

    def font_path(self, name: str) -> Path:
        """Resolve a font filename against the project/bundled fonts dir."""
        p = self.fonts_dir / name
        if p.is_file():
            return p
        # Allow an absolute or already-qualified path.
        cand = Path(name)
        if cand.is_file():
            return cand
        raise FileNotFoundError(
            f"Font '{name}' not found in {self.fonts_dir}. "
            f"Add it to your fonts/ folder or fix the name in themes.yaml."
        )

    def load_font(self, name: str, size: int) -> ImageFont.FreeTypeFont:
        return _cached_font(str(self.font_path(name)), size)


@lru_cache(maxsize=256)
def _cached_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) == 3:
        value = "".join(c * 2 for c in value)
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
