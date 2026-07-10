"""Automated scheduler for recurring post generation and publishing.

Runs as a long-lived process that generates and publishes new batches
of posts on a configurable schedule. Can also be run as a one-shot
via the CLI.
"""

from __future__ import annotations

import datetime
import time

import schedule

from config import Config
from book_reader import read_books
from post_generator import generate_posts, save_posts
from image_generator import generate_images_for_posts
from publisher import publish_batch, save_publishing_plan


def run_batch(dry_run: bool = False):
    """Run a complete batch: read books, generate posts, create images, publish.

    Args:
        dry_run: If True, generate everything but don't publish (saves plan to disk).
    """
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"\n{'='*60}")
    print(f"  Book Social Media Automation - Batch Run")
    print(f"  {timestamp}")
    print(f"{'='*60}\n")

    # Step 1: Read book content
    print("[1/4] Reading book files...")
    book = read_books()
    print(f"  Book: {book.title} by {book.author}")
    print(f"  Chapters: {len(book.chapters)}, Quotes: {len(book.quotes)}\n")

    # Step 2: Generate platform-specific posts
    print("[2/4] Generating posts with Claude...")
    posts = generate_posts(book)
    posts_file = save_posts(posts)
    total_posts = sum(len(p) for p in posts.values())
    print(f"  Total posts generated: {total_posts}\n")

    # Step 3: Create images
    print("[3/4] Creating images...")
    posts_with_images = generate_images_for_posts(posts)
    total_images = sum(len(p) for p in posts_with_images.values())
    print(f"  Total images created: {total_images}\n")

    # Step 4: Publish or save plan
    if dry_run:
        print("[4/4] Saving publishing plan (dry run)...")
        plan_file = save_publishing_plan(posts_with_images)
        print(f"\n  DRY RUN COMPLETE")
        print(f"  Posts: {posts_file}")
        print(f"  Plan:  {plan_file}")
        print(f"  Images in: {Config.IMAGES_DIR}")
        print(f"\n  Review (and edit) the plan file, then run --publish to")
        print(f"  post exactly what's in it.\n")
    else:
        print("[4/4] Publishing via Post Bridge...")
        results = publish_batch(posts_with_images)
        print(f"\n  PUBLISHED {len(results)} posts!")
        print(f"  Posts saved: {posts_file}")
        print(f"  Images in: {Config.IMAGES_DIR}\n")

    return posts_with_images


def start_scheduler(dry_run: bool = False):
    """Start the recurring scheduler that runs batches at configured intervals.

    The scheduler generates a new batch every DAYS_BETWEEN_POSTS * POSTS_PER_BATCH days,
    ensuring a continuous stream of content.
    """
    cycle_days = Config.DAYS_BETWEEN_POSTS * Config.POSTS_PER_BATCH
    run_time = Config.POST_TIMES[0]  # Run batch generation at first post time

    print(f"Scheduler started")
    print(f"  Batch generation: every {cycle_days} days at {run_time}")
    print(f"  Post times: {', '.join(Config.POST_TIMES)} ({Config.POST_TIMEZONE})")
    print(f"  Days between posts: {Config.DAYS_BETWEEN_POSTS}")
    print(f"  Posts per batch: {Config.POSTS_PER_BATCH}")
    print(f"  Dry run: {dry_run}")
    print(f"\nPress Ctrl+C to stop.\n")

    # Run immediately on start
    run_batch(dry_run=dry_run)

    # Schedule recurring runs
    schedule.every(cycle_days).days.at(run_time).do(run_batch, dry_run=dry_run)

    while True:
        schedule.run_pending()
        time.sleep(60)
