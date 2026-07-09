"""Configuration and path resolution for pinfactory.

Everything is anchored to a *project root* — the folder that holds your
`.env`, `themes.yaml`, `keywords.yaml`, and the generated `pinfactory.db`.
By default that is the current working directory, so you can keep several
independent catalogs in separate folders. Override with the ``PINFACTORY_HOME``
environment variable or the ``--home`` CLI flag.

Cadence / anti-spam knobs live in ``config.yaml`` (created by `init`) so they
are easy to edit without touching secrets. Secrets live in ``.env``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

# Directory that ships with the package: bundled fonts.
PACKAGE_DIR = Path(__file__).resolve().parent
BUNDLED_FONTS_DIR = PACKAGE_DIR.parent / "fonts"

# Defaults for the anti-spam / cadence rules from the project brief. Every one
# of these is overridable in config.yaml; the defaults encode the brief's rules.
DEFAULT_CONFIG: dict[str, Any] = {
    "cadence": {
        # Max published pins per calendar week (brief: max 15, default 10).
        "max_pins_per_week": 10,
        # A destination URL may be pinned to multiple boards, but publishes for
        # the same URL must be spaced at least this many hours apart.
        "min_hours_between_same_url": 48,
        # A pin may be re-saved to ONE additional board no sooner than this many
        # days after first publish, then never again.
        "resave_after_days": 5,
        # A failed pin is quarantined after this many failures.
        "quarantine_after_failures": 2,
    },
    "images": {
        "width": 1000,
        "height": 1500,
        "variants": ["headline", "trope_hook", "quote_card", "comp_card"],
    },
    "copy": {
        # Anthropic model is read from .env (ANTHROPIC_MODEL); this is the
        # fallback if that variable is unset.
        "default_model": "claude-opus-4-8",
        "title_max_chars": 100,
        "description_max_chars": 500,
    },
    "boards": {
        # Suggested count per account when proposing boards during init.
        "min_per_account": 5,
        "max_per_account": 8,
    },
}


@dataclass
class Config:
    """Resolved paths + merged settings for one pinfactory project."""

    home: Path
    settings: dict[str, Any] = field(default_factory=dict)

    # --- Paths -------------------------------------------------------------
    @property
    def db_path(self) -> Path:
        return self.home / "pinfactory.db"

    @property
    def env_path(self) -> Path:
        return self.home / ".env"

    @property
    def themes_path(self) -> Path:
        return self.home / "themes.yaml"

    @property
    def keywords_path(self) -> Path:
        return self.home / "keywords.yaml"

    @property
    def config_path(self) -> Path:
        return self.home / "config.yaml"

    @property
    def covers_dir(self) -> Path:
        return self.home / "covers"

    @property
    def textures_dir(self) -> Path:
        """Optional folder of licensed background/texture images you own."""
        return self.home / "textures"

    @property
    def output_dir(self) -> Path:
        return self.home / "output"

    @property
    def review_dir(self) -> Path:
        return self.home / "review"

    @property
    def reports_dir(self) -> Path:
        return self.home / "reports"

    @property
    def fonts_dir(self) -> Path:
        """Prefer a project-local fonts/ folder, else the bundled fonts."""
        local = self.home / "fonts"
        return local if local.is_dir() else BUNDLED_FONTS_DIR

    # --- Settings helpers --------------------------------------------------
    def get(self, *keys: str, default: Any = None) -> Any:
        node: Any = self.settings
        for k in keys:
            if not isinstance(node, dict) or k not in node:
                return default
            node = node[k]
        return node


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(home: str | os.PathLike | None = None) -> Config:
    """Resolve the project root and merge config.yaml over the defaults."""
    root = Path(home or os.environ.get("PINFACTORY_HOME") or Path.cwd()).resolve()
    settings = dict(DEFAULT_CONFIG)
    cfg_file = root / "config.yaml"
    if cfg_file.is_file():
        with cfg_file.open("r", encoding="utf-8") as fh:
            user = yaml.safe_load(fh) or {}
        settings = _deep_merge(settings, user)
    return Config(home=root, settings=settings)


def load_env(cfg: Config) -> dict[str, str]:
    """Read .env into a plain dict (does not mutate os.environ unless asked).

    Uses python-dotenv if available; otherwise a minimal KEY=VALUE parser so the
    app still runs without the dependency for non-secret commands.
    """
    values: dict[str, str] = {}
    if not cfg.env_path.is_file():
        return values
    try:
        from dotenv import dotenv_values

        values = {k: v for k, v in dotenv_values(cfg.env_path).items() if v is not None}
    except Exception:
        for line in cfg.env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            values[k.strip()] = v.strip().strip('"').strip("'")
    return values
