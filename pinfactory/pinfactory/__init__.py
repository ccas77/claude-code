"""pinfactory — a local Pinterest organic-traffic engine for a multi-pen-name book catalog.

Three components:
  1. Pin image generator (Pillow) — this file's package `images` module.
  2. Pin copy generator (Anthropic API) — `copy_gen` module (built after Component 1 approval).
  3. Boards + scheduler (Pinterest API v5) — `pinterest`/`scheduler` modules (built last).

All state lives in a local SQLite database so runs are fully resumable.
"""

__version__ = "0.1.0"
