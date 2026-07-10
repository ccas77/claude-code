"""Configuration loader for book social media automation."""

from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Central configuration loaded from environment variables."""

    # Paths
    BASE_DIR = Path(__file__).parent
    BOOK_DIR = Path(os.getenv("BOOK_DIR", "./books"))
    OUTPUT_DIR = BASE_DIR / "output"
    POSTS_DIR = OUTPUT_DIR / "posts"
    IMAGES_DIR = OUTPUT_DIR / "images"

    # Claude API
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

    # Post Bridge
    POSTBRIDGE_API_KEY = os.getenv("POSTBRIDGE_API_KEY", "")
    POSTBRIDGE_WORKSPACE_ID = os.getenv("POSTBRIDGE_WORKSPACE_ID", "")
    POSTBRIDGE_BASE_URL = "https://app.postbridge.app/api/v1"

    # Social media account IDs in Post Bridge
    ACCOUNTS = {
        "instagram": os.getenv("POSTBRIDGE_INSTAGRAM_ACCOUNT_ID", ""),
        "facebook": os.getenv("POSTBRIDGE_FACEBOOK_ACCOUNT_ID", ""),
        "tiktok": os.getenv("POSTBRIDGE_TIKTOK_ACCOUNT_ID", ""),
        "pinterest": os.getenv("POSTBRIDGE_PINTEREST_ACCOUNT_ID", ""),
    }

    PINTEREST_BOARD_ID = os.getenv("PINTEREST_BOARD_ID", "")

    # Book info
    BOOK_TITLE = os.getenv("BOOK_TITLE", "My Book")
    BOOK_AUTHOR = os.getenv("BOOK_AUTHOR", "Author")
    BOOK_GENRE = os.getenv("BOOK_GENRE", "Fiction")

    # Branding colors
    BRAND_PRIMARY = os.getenv("BRAND_COLOR_PRIMARY", "#1a1a2e")
    BRAND_SECONDARY = os.getenv("BRAND_COLOR_SECONDARY", "#e94560")
    BRAND_ACCENT = os.getenv("BRAND_COLOR_ACCENT", "#0f3460")
    BRAND_FONT_COLOR = os.getenv("BRAND_FONT_COLOR", "#ffffff")

    # Scheduling (POST_TIMES are interpreted in POST_TIMEZONE)
    POST_TIMES = [
        t.strip()
        for t in os.getenv("POST_TIMES", "09:00,13:00,18:00").split(",")
        if t.strip()
    ]
    POST_TIMEZONE = os.getenv("POST_TIMEZONE", "America/New_York")
    DAYS_BETWEEN_POSTS = int(os.getenv("DAYS_BETWEEN_POSTS", "2"))

    # Generation
    POSTS_PER_BATCH = int(os.getenv("POSTS_PER_BATCH", "7"))

    # Supported platforms
    PLATFORMS = ["instagram", "facebook", "tiktok", "pinterest"]

    @classmethod
    def validate(cls):
        """Check that required config values are set."""
        errors = []
        if not cls.ANTHROPIC_API_KEY:
            errors.append("ANTHROPIC_API_KEY is required")
        if not cls.POSTBRIDGE_API_KEY:
            errors.append("POSTBRIDGE_API_KEY is required")
        if not cls.POSTBRIDGE_WORKSPACE_ID:
            errors.append("POSTBRIDGE_WORKSPACE_ID is required")

        active_accounts = {k: v for k, v in cls.ACCOUNTS.items() if v}
        if not active_accounts:
            errors.append("At least one POSTBRIDGE_*_ACCOUNT_ID is required")

        if errors:
            raise ValueError(
                "Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
            )

        return active_accounts
