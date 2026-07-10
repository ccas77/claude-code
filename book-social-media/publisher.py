"""Publishes posts to social media via the Post Bridge API.

Post Bridge (https://postbridge.app) is a social media scheduling and
publishing API that supports Instagram, Facebook, TikTok, Pinterest, and more.

This module handles:
- Uploading images to Post Bridge media storage
- Creating and scheduling posts for each platform
- Building and saving a publishing plan (dry run), and publishing a saved
  plan so what you reviewed is exactly what goes live
- Checking post status and handling errors
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from config import Config
from post_generator import SocialPost

PLAN_FILENAME = "publishing_plan.json"


def _parse_time(value: str) -> tuple[int, int]:
    """Parse an 'HH:MM' string into (hour, minute)."""
    hour, minute = map(int, value.strip().split(":"))
    return hour, minute


def post_timezone() -> datetime.tzinfo:
    """Return the configured POST_TIMEZONE, falling back to UTC if invalid."""
    try:
        return ZoneInfo(Config.POST_TIMEZONE)
    except Exception:
        print(
            f"  Warning: unknown POST_TIMEZONE '{Config.POST_TIMEZONE}', using UTC"
        )
        return datetime.timezone.utc


def default_start_time() -> datetime.datetime:
    """Tomorrow at the first configured post time, in POST_TIMEZONE."""
    tz = post_timezone()
    tomorrow = datetime.datetime.now(tz).date() + datetime.timedelta(days=1)
    hour, minute = _parse_time(Config.POST_TIMES[0])
    return datetime.datetime(
        tomorrow.year, tomorrow.month, tomorrow.day, hour, minute, tzinfo=tz
    )


class PostBridgeClient:
    """Client for the Post Bridge publishing API."""

    def __init__(self):
        self.api_key = Config.POSTBRIDGE_API_KEY
        self.workspace_id = Config.POSTBRIDGE_WORKSPACE_ID
        self.base_url = Config.POSTBRIDGE_BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        })

    def _url(self, path: str) -> str:
        """Build full API URL."""
        return f"{self.base_url}/workspaces/{self.workspace_id}{path}"

    def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make an API request with error handling."""
        url = self._url(path)
        response = self.session.request(method, url, **kwargs)

        if not response.ok:
            print(f"  API Error [{response.status_code}]: {response.text[:300]}")
            response.raise_for_status()

        if response.content:
            return response.json()
        return {}

    def upload_media(self, image_path: Path) -> str:
        """Upload an image to Post Bridge and return the media ID.

        Returns:
            The media ID string to reference in post creation.
        """
        with open(image_path, "rb") as f:
            files = {"file": (image_path.name, f, "image/png")}
            result = self._request("POST", "/media", files=files)

        media_id = result.get("id") or result.get("data", {}).get("id", "")
        print(f"  Uploaded media: {image_path.name} -> {media_id}")
        return media_id

    def create_post(
        self,
        account_id: str,
        platform: str,
        content: str,
        media_id: str | None = None,
        scheduled_at: datetime.datetime | None = None,
        pinterest_board_id: str | None = None,
    ) -> dict:
        """Create a post (publish immediately or schedule for later).

        Args:
            account_id: The Post Bridge account ID for the platform.
            platform: Platform name (instagram, facebook, tiktok, pinterest).
            content: The post text/caption.
            media_id: Optional media ID from upload_media().
            scheduled_at: Optional datetime to schedule the post (UTC).
            pinterest_board_id: Required for Pinterest posts.

        Returns:
            API response dict with post details.
        """
        payload = {
            "account_id": account_id,
            "content": content,
            "platform": platform,
        }

        if media_id:
            payload["media"] = [{"id": media_id}]

        if scheduled_at:
            payload["scheduled_at"] = scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ")
            payload["status"] = "scheduled"
        else:
            payload["status"] = "published"

        if platform == "pinterest":
            if pinterest_board_id or Config.PINTEREST_BOARD_ID:
                payload["pinterest_options"] = {
                    "board_id": pinterest_board_id or Config.PINTEREST_BOARD_ID
                }

        result = self._request("POST", "/posts", json=payload)

        post_id = result.get("id") or result.get("data", {}).get("id", "unknown")
        status = "scheduled" if scheduled_at else "published"
        time_str = scheduled_at.strftime("%Y-%m-%d %H:%M UTC") if scheduled_at else "now"
        print(f"  Post {status}: {platform} [{post_id}] at {time_str}")

        return result

    def get_post_status(self, post_id: str) -> dict:
        """Check the status of a published/scheduled post."""
        return self._request("GET", f"/posts/{post_id}")

    def list_accounts(self) -> list[dict]:
        """List all connected social media accounts."""
        result = self._request("GET", "/accounts")
        return result.get("data", result.get("accounts", []))


def build_plan(
    posts_with_images: dict[str, list[tuple[SocialPost, Path]]],
    start_time: datetime.datetime | None = None,
) -> list[dict]:
    """Assign a schedule slot to every post and return full plan entries.

    Platforms are interleaved so posts spread across days, and times are
    taken from POST_TIMES interpreted in POST_TIMEZONE.
    """
    if start_time is None:
        start_time = default_start_time()

    entries: list[dict] = []
    current_day = start_time
    max_posts = max(len(posts) for posts in posts_with_images.values())

    for i in range(max_posts):
        for platform, paired_posts in posts_with_images.items():
            if i >= len(paired_posts):
                continue
            post, image_path = paired_posts[i]

            time_index = len(entries) % len(Config.POST_TIMES)
            hour, minute = _parse_time(Config.POST_TIMES[time_index])
            schedule_dt = current_day.replace(hour=hour, minute=minute)

            entries.append({
                "platform": platform,
                "scheduled_at": schedule_dt.isoformat(),
                "post_type": post.post_type,
                "content": post.content,
                "hashtags": post.hashtags,
                "caption": post.caption,
                "image_path": str(image_path) if image_path else "",
                "status": "pending",
            })

        current_day += datetime.timedelta(days=Config.DAYS_BETWEEN_POSTS)

    return entries


def save_publishing_plan(
    posts_with_images: dict[str, list[tuple[SocialPost, Path]]],
    start_time: datetime.datetime | None = None,
) -> Path:
    """Save the full publishing plan to a JSON file for review and editing.

    The plan is the source of truth for publishing: edit content/hashtags/
    scheduled_at in the file, then run --publish to post exactly that.
    """
    Config.POSTS_DIR.mkdir(parents=True, exist_ok=True)

    entries = build_plan(posts_with_images, start_time)
    plan = {
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "timezone": Config.POST_TIMEZONE,
        "status": "pending",
        "posts": entries,
    }

    output_path = Config.POSTS_DIR / PLAN_FILENAME
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False))
    print(f"  Publishing plan saved to: {output_path}")
    print(f"  {len(entries)} posts across {len(posts_with_images)} platforms")
    return output_path


def pending_plan_path() -> Path | None:
    """Return the saved plan file if it still has unpublished posts."""
    path = Config.POSTS_DIR / PLAN_FILENAME
    if not path.exists():
        return None
    try:
        plan = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
    if isinstance(plan, dict) and plan.get("status") in ("pending", "partial"):
        return path
    return None


def publish_plan(plan_path: Path) -> list[dict]:
    """Publish the posts in a saved plan file, exactly as reviewed/edited.

    Entries already published (e.g. on a retry after a partial failure) are
    skipped. Scheduled times that have passed are pushed forward day by day.
    The plan file is rewritten with per-post statuses afterwards.
    """
    plan_path = Path(plan_path)
    plan = json.loads(plan_path.read_text())
    if not isinstance(plan, dict) or "posts" not in plan:
        raise ValueError(f"Not a publishing plan file: {plan_path}")
    if plan.get("status") == "published":
        raise ValueError(
            f"Plan already published: {plan_path}\n"
            "Run --dry-run to generate a new plan, or --publish --fresh."
        )

    client = PostBridgeClient()
    now = datetime.datetime.now(datetime.timezone.utc)
    results = []

    for entry in plan["posts"]:
        if entry.get("status") == "published":
            continue

        account_id = Config.ACCOUNTS.get(entry["platform"])
        if not account_id:
            print(f"  Skipping {entry['platform']}: no account ID configured")
            entry["status"] = "skipped"
            continue

        scheduled_at = datetime.datetime.fromisoformat(entry["scheduled_at"])
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=post_timezone())
        while scheduled_at <= now:
            scheduled_at += datetime.timedelta(days=1)

        media_id = None
        image_path = Path(entry["image_path"]) if entry.get("image_path") else None
        if image_path and image_path.exists():
            media_id = client.upload_media(image_path)
        elif image_path:
            print(f"  Warning: image missing, posting without media: {image_path}")

        tags = " ".join(f"#{t}" for t in entry.get("hashtags", []))
        content = f"{entry['content']}\n\n{tags}" if tags else entry["content"]

        try:
            result = client.create_post(
                account_id=account_id,
                platform=entry["platform"],
                content=content,
                media_id=media_id,
                scheduled_at=scheduled_at.astimezone(datetime.timezone.utc),
            )
            entry["status"] = "published"
            results.append(result)
        except requests.HTTPError as e:
            print(f"  Failed to publish {entry['platform']} post: {e}")
            entry["status"] = "failed"

    done = all(e.get("status") in ("published", "skipped") for e in plan["posts"])
    plan["status"] = "published" if done else "partial"
    plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False))

    print(f"\nScheduled {len(results)} posts from plan")
    if not done:
        print("Some posts failed — fix the issue and run --publish again to retry them.")
    return results


def publish_batch(
    posts_with_images: dict[str, list[tuple[SocialPost, Path]]],
    start_time: datetime.datetime | None = None,
) -> list[dict]:
    """Save a plan for a freshly generated batch and publish it.

    Going through the plan file means every publish leaves a reviewable
    record on disk, and failed posts can be retried with --publish.
    """
    plan_path = save_publishing_plan(posts_with_images, start_time)
    return publish_plan(plan_path)
