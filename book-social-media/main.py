#!/usr/bin/env python3
from __future__ import annotations

"""Book Social Media Automation - Main Entry Point.

Reads your book files, generates platform-specific posts for Instagram,
Facebook, TikTok, and Pinterest, creates branded images, and publishes
them via Post Bridge on a schedule.

Usage:
    # Dry run: generate posts + images, save plan, but don't publish
    python main.py --dry-run

    # One-shot: generate and publish immediately
    python main.py --publish

    # Scheduled: run continuously, generating and publishing on a cycle
    python main.py --schedule

    # Generate only (no publishing)
    python main.py --generate-only

    # Preview: show what would be generated for each platform
    python main.py --preview
"""

import argparse
import sys
from pathlib import Path

# Ensure the script's directory is in the path
sys.path.insert(0, str(Path(__file__).parent))

from config import Config


def cmd_preview():
    """Preview book content and generation settings without creating anything."""
    from book_reader import read_books
    from post_generator import PLATFORM_GUIDELINES

    print("\n--- Book Content Preview ---\n")
    book = read_books()
    print(f"\nTitle:    {book.title}")
    print(f"Author:   {book.author}")
    print(f"Genre:    {book.genre}")
    print(f"Chapters: {len(book.chapters)}")
    print(f"Quotes:   {len(book.quotes)}")

    if book.quotes:
        print(f"\nSample quotes:")
        for q in book.quotes[:5]:
            print(f'  - "{q}"')

    print(f"\n--- Platform Configuration ---\n")
    for platform in Config.PLATFORMS:
        account_id = Config.ACCOUNTS.get(platform, "")
        status = "configured" if account_id else "NOT configured"
        guidelines = PLATFORM_GUIDELINES[platform]
        print(f"  {platform.upper()}: {status}")
        print(f"    Max length: {guidelines['max_length']}")
        print(f"    Hashtags: {guidelines['hashtag_count']}")
        print(f"    Tone: {guidelines['tone'][:80]}...")
        print()

    print(f"--- Schedule ---\n")
    print(f"  Post times: {', '.join(Config.POST_TIMES)}")
    print(f"  Timezone:   {Config.POST_TIMEZONE}")
    print(f"  Interval:   Every {Config.DAYS_BETWEEN_POSTS} days")
    print(f"  Batch size: {Config.POSTS_PER_BATCH} posts per platform\n")


def cmd_generate_only():
    """Generate posts and images but don't publish."""
    from book_reader import read_books
    from post_generator import generate_posts, save_posts
    from image_generator import generate_images_for_posts

    print("\n[1/3] Reading book files...")
    book = read_books()

    print("\n[2/3] Generating posts...")
    posts = generate_posts(book)
    save_posts(posts)

    print("\n[3/3] Creating images...")
    generate_images_for_posts(posts)

    print("\nDone! Check output/posts/ and output/images/")


def cmd_dry_run():
    """Full pipeline but save plan instead of publishing."""
    from scheduler import run_batch
    run_batch(dry_run=True)


def cmd_publish():
    """One-shot: generate and publish immediately."""
    from scheduler import run_batch
    run_batch(dry_run=False)


def cmd_schedule():
    """Start the recurring scheduler."""
    from scheduler import start_scheduler
    start_scheduler(dry_run=False)


def cmd_schedule_dry():
    """Start the recurring scheduler in dry-run mode."""
    from scheduler import start_scheduler
    start_scheduler(dry_run=True)


def main():
    parser = argparse.ArgumentParser(
        description="Book Social Media Automation System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --preview          Show book content and config
  python main.py --dry-run          Generate everything, save plan (no publishing)
  python main.py --publish          Generate and publish immediately
  python main.py --schedule         Run continuously on a schedule
  python main.py --generate-only    Generate posts + images only

Setup:
  1. Copy .env.example to .env and fill in your API keys
  2. Place book files in the books/ directory
  3. Run --preview to verify everything looks correct
  4. Run --dry-run to generate and review before publishing
  5. Run --publish or --schedule when ready to go live
        """,
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preview", action="store_true", help="Preview book content and settings")
    group.add_argument("--dry-run", action="store_true", help="Generate everything but don't publish")
    group.add_argument("--publish", action="store_true", help="Generate and publish immediately")
    group.add_argument("--schedule", action="store_true", help="Run on a recurring schedule")
    group.add_argument("--schedule-dry", action="store_true", help="Schedule in dry-run mode")
    group.add_argument("--generate-only", action="store_true", help="Generate posts and images only")

    args = parser.parse_args()

    # Validate config (skip for preview which is more forgiving)
    if not args.preview:
        try:
            active = Config.validate()
            print(f"Active platforms: {', '.join(active.keys())}")
        except ValueError as e:
            if args.generate_only:
                # Generate-only just needs Claude API key
                if not Config.ANTHROPIC_API_KEY:
                    print(f"Error: {e}")
                    sys.exit(1)
            else:
                print(f"Error: {e}")
                sys.exit(1)

    commands = {
        "preview": cmd_preview,
        "dry_run": cmd_dry_run,
        "publish": cmd_publish,
        "schedule": cmd_schedule,
        "schedule_dry": cmd_schedule_dry,
        "generate_only": cmd_generate_only,
    }

    for name, func in commands.items():
        if getattr(args, name, False):
            func()
            break


if __name__ == "__main__":
    main()
