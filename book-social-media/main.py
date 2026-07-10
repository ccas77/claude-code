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


def cmd_publish(fresh: bool = False):
    """Publish the reviewed plan from the last dry run, or generate fresh.

    If a pending publishing plan exists (from --dry-run), it is published
    exactly as reviewed/edited. Otherwise — or with --fresh — a new batch
    is generated and published.
    """
    from publisher import pending_plan_path, publish_plan

    plan_path = None if fresh else pending_plan_path()
    if plan_path:
        print(f"Publishing saved plan: {plan_path}")
        print("(run --publish --fresh to regenerate a new batch instead)\n")
        publish_plan(plan_path)
    else:
        from scheduler import run_batch
        run_batch(dry_run=False)


def cmd_accounts():
    """List connected Post Bridge accounts with ready-to-paste .env lines."""
    from publisher import PostBridgeClient

    ENV_VARS = {
        "instagram": "POSTBRIDGE_INSTAGRAM_ACCOUNT_ID",
        "facebook": "POSTBRIDGE_FACEBOOK_ACCOUNT_ID",
        "tiktok": "POSTBRIDGE_TIKTOK_ACCOUNT_ID",
        "pinterest": "POSTBRIDGE_PINTEREST_ACCOUNT_ID",
    }

    accounts = PostBridgeClient().list_accounts()
    if not accounts:
        print("No connected accounts found in this Post Bridge workspace.")
        print("Connect your social accounts at https://postbridge.app first.")
        return

    print("\nConnected Post Bridge accounts:\n")
    env_lines = []
    for acct in accounts:
        acct_id = str(acct.get("id", ""))
        platform = str(acct.get("platform") or acct.get("provider") or "?").lower()
        name = acct.get("name") or acct.get("username") or ""
        print(f"  {platform:<12} {acct_id:<24} {name}")
        env_var = ENV_VARS.get(platform)
        if env_var and acct_id:
            env_lines.append(f"{env_var}={acct_id}")

    if env_lines:
        print("\nPaste into your .env:\n")
        for line in env_lines:
            print(f"  {line}")
    print()


def cmd_check():
    """Validate configuration, API keys, book files, and schedule settings."""
    ok = True

    def report(passed: bool, label: str, detail: str = "") -> bool:
        nonlocal ok
        mark = " OK " if passed else "FAIL"
        print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))
        ok = ok and passed
        return passed

    print("\n--- Configuration check ---\n")

    if report(bool(Config.ANTHROPIC_API_KEY), "ANTHROPIC_API_KEY set"):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
            client.models.list(limit=1)
            report(True, "Claude API key works")
        except Exception as e:
            report(False, "Claude API key works", str(e)[:120])

    report(bool(Config.POSTBRIDGE_API_KEY), "POSTBRIDGE_API_KEY set")
    report(bool(Config.POSTBRIDGE_WORKSPACE_ID), "POSTBRIDGE_WORKSPACE_ID set")

    remote_ids = None
    if Config.POSTBRIDGE_API_KEY and Config.POSTBRIDGE_WORKSPACE_ID:
        try:
            from publisher import PostBridgeClient
            accounts = PostBridgeClient().list_accounts()
            remote_ids = {str(a.get("id", "")) for a in accounts}
            report(True, f"Post Bridge API key works ({len(accounts)} account(s) connected)")
        except Exception as e:
            report(False, "Post Bridge API key works", str(e)[:120])

    configured = {k: v for k, v in Config.ACCOUNTS.items() if v}
    report(
        bool(configured),
        "At least one platform account ID configured",
        ", ".join(configured) if configured else "run --accounts to find your IDs",
    )
    if remote_ids is not None:
        for platform, acct_id in configured.items():
            report(acct_id in remote_ids, f"{platform} account ID exists in workspace", acct_id)

    from book_reader import READERS
    book_dir = Config.BOOK_DIR
    if not book_dir.is_absolute():
        book_dir = Config.BASE_DIR / book_dir
    files = (
        [p for ext in READERS for p in sorted(book_dir.glob(f"*{ext}"))]
        if book_dir.exists()
        else []
    )
    report(
        bool(files),
        f"Book files in {book_dir}",
        ", ".join(f.name for f in files) if files else "add .txt/.md/.pdf/.epub files",
    )

    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(Config.POST_TIMEZONE)
        report(True, f"POST_TIMEZONE valid ({Config.POST_TIMEZONE})")
    except Exception:
        report(False, "POST_TIMEZONE valid", Config.POST_TIMEZONE)

    try:
        for t in Config.POST_TIMES:
            hour, minute = map(int, t.split(":"))
            if not (0 <= hour < 24 and 0 <= minute < 60):
                raise ValueError(t)
        report(True, f"POST_TIMES valid ({', '.join(Config.POST_TIMES)})")
    except Exception:
        report(False, "POST_TIMES valid", ",".join(Config.POST_TIMES))

    print()
    if ok:
        print("All checks passed. Next: --dry-run, review the plan, then --publish.\n")
    else:
        print("Some checks failed — fix the items marked FAIL above.\n")
        sys.exit(1)


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
  python main.py --check            Validate config, API keys, and book files
  python main.py --accounts         List Post Bridge account IDs for your .env
  python main.py --preview          Show book content and config
  python main.py --dry-run          Generate everything, save plan (no publishing)
  python main.py --publish          Publish the reviewed plan (or generate fresh)
  python main.py --publish --fresh  Skip any saved plan; generate and publish new
  python main.py --schedule         Run continuously on a schedule
  python main.py --generate-only    Generate posts + images only

Setup:
  1. Copy .env.example to .env and fill in your API keys
  2. Run --accounts to get your account IDs, paste them into .env
  3. Place book files in the books/ directory
  4. Run --check to confirm everything is wired up
  5. Run --dry-run, then review/edit output/posts/publishing_plan.json
  6. Run --publish to post exactly what's in the plan
        """,
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Validate config, API keys, and book files")
    group.add_argument("--accounts", action="store_true", help="List Post Bridge accounts and their IDs")
    group.add_argument("--preview", action="store_true", help="Preview book content and settings")
    group.add_argument("--dry-run", action="store_true", help="Generate everything but don't publish")
    group.add_argument("--publish", action="store_true", help="Publish the saved plan, or generate and publish")
    group.add_argument("--schedule", action="store_true", help="Run on a recurring schedule")
    group.add_argument("--schedule-dry", action="store_true", help="Schedule in dry-run mode")
    group.add_argument("--generate-only", action="store_true", help="Generate posts and images only")
    parser.add_argument("--fresh", action="store_true", help="With --publish: ignore any saved plan and regenerate")

    args = parser.parse_args()

    # Validate only what each command actually needs
    if args.check or args.preview:
        pass  # these commands report on configuration themselves
    elif args.accounts:
        if not Config.POSTBRIDGE_API_KEY or not Config.POSTBRIDGE_WORKSPACE_ID:
            print("Error: POSTBRIDGE_API_KEY and POSTBRIDGE_WORKSPACE_ID are required")
            sys.exit(1)
    elif args.dry_run or args.schedule_dry or args.generate_only:
        # Only need Claude API key for content generation
        if not Config.ANTHROPIC_API_KEY:
            print("Error: ANTHROPIC_API_KEY is required")
            sys.exit(1)
    else:
        try:
            active = Config.validate()
            print(f"Active platforms: {', '.join(active.keys())}")
        except ValueError as e:
            print(f"Error: {e}")
            sys.exit(1)

    if args.check:
        cmd_check()
    elif args.accounts:
        cmd_accounts()
    elif args.preview:
        cmd_preview()
    elif args.dry_run:
        cmd_dry_run()
    elif args.publish:
        cmd_publish(fresh=args.fresh)
    elif args.schedule:
        cmd_schedule()
    elif args.schedule_dry:
        cmd_schedule_dry()
    elif args.generate_only:
        cmd_generate_only()


if __name__ == "__main__":
    main()
