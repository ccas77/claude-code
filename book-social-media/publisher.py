"""Publishes posts to social media via the Post Bridge API.

Post Bridge (https://postbridge.app) is a social media scheduling and
publishing API that supports Instagram, Facebook, TikTok, Pinterest, and more.

This module handles:
- Uploading images to Post Bridge media storage
- Creating and scheduling posts for each platform
- Checking post status and handling errors
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path

import requests

from config import Config
from post_generator import SocialPost


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


def publish_post(
    client: PostBridgeClient,
    post: SocialPost,
    image_path: Path | None = None,
    scheduled_at: datetime.datetime | None = None,
) -> dict | None:
    """Publish or schedule a single post via Post Bridge.

    Returns the API response, or None if the platform account is not configured.
    """
    account_id = Config.ACCOUNTS.get(post.platform)
    if not account_id:
        print(f"  Skipping {post.platform}: no account ID configured")
        return None

    media_id = None
    if image_path and image_path.exists():
        media_id = client.upload_media(image_path)

    return client.create_post(
        account_id=account_id,
        platform=post.platform,
        content=post.full_text(),
        media_id=media_id,
        scheduled_at=scheduled_at,
    )


def publish_batch(
    posts_with_images: dict[str, list[tuple[SocialPost, Path]]],
    start_time: datetime.datetime | None = None,
) -> list[dict]:
    """Publish a batch of posts, scheduling them at staggered times.

    Args:
        posts_with_images: Dict of platform -> [(post, image_path)] pairs.
        start_time: When to start scheduling. Defaults to tomorrow at the
                     first configured post time.

    Returns:
        List of API response dicts for all published posts.
    """
    client = PostBridgeClient()

    if start_time is None:
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        first_time = Config.POST_TIMES[0]
        hour, minute = map(int, first_time.split(":"))
        start_time = datetime.datetime(
            tomorrow.year, tomorrow.month, tomorrow.day, hour, minute,
            tzinfo=datetime.timezone.utc,
        )

    results = []
    current_time = start_time

    # Interleave platforms so posts are spread across time
    max_posts = max(len(posts) for posts in posts_with_images.values())

    for i in range(max_posts):
        for platform, paired_posts in posts_with_images.items():
            if i >= len(paired_posts):
                continue

            post, image_path = paired_posts[i]

            # Pick next post time from the configured schedule
            time_index = len(results) % len(Config.POST_TIMES)
            hour, minute = map(int, Config.POST_TIMES[time_index].split(":"))

            schedule_dt = current_time.replace(hour=hour, minute=minute)
            if schedule_dt <= datetime.datetime.now(datetime.timezone.utc):
                schedule_dt += datetime.timedelta(days=1)

            try:
                result = publish_post(client, post, image_path, scheduled_at=schedule_dt)
                if result:
                    results.append(result)
            except requests.HTTPError as e:
                print(f"  Failed to publish {platform} post: {e}")

        # Move to next day after cycling through all platforms
        current_time += datetime.timedelta(days=Config.DAYS_BETWEEN_POSTS)

    print(f"\nScheduled {len(results)} posts total")
    return results


def save_publishing_plan(
    posts_with_images: dict[str, list[tuple[SocialPost, Path]]],
    start_time: datetime.datetime | None = None,
) -> Path:
    """Save the publishing plan to a JSON file for review before publishing."""
    Config.POSTS_DIR.mkdir(parents=True, exist_ok=True)

    if start_time is None:
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        first_time = Config.POST_TIMES[0]
        hour, minute = map(int, first_time.split(":"))
        start_time = datetime.datetime(
            tomorrow.year, tomorrow.month, tomorrow.day, hour, minute,
            tzinfo=datetime.timezone.utc,
        )

    plan = []
    current_time = start_time
    max_posts = max(len(posts) for posts in posts_with_images.values())
    post_index = 0

    for i in range(max_posts):
        for platform, paired_posts in posts_with_images.items():
            if i >= len(paired_posts):
                continue
            post, image_path = paired_posts[i]

            time_index = post_index % len(Config.POST_TIMES)
            hour, minute = map(int, Config.POST_TIMES[time_index].split(":"))
            schedule_dt = current_time.replace(hour=hour, minute=minute)

            plan.append({
                "platform": platform,
                "scheduled_at": schedule_dt.isoformat(),
                "post_type": post.post_type,
                "content_preview": post.content[:120] + "..." if len(post.content) > 120 else post.content,
                "hashtags": post.hashtags,
                "image_path": str(image_path),
            })
            post_index += 1

        current_time += datetime.timedelta(days=Config.DAYS_BETWEEN_POSTS)

    output_path = Config.POSTS_DIR / "publishing_plan.json"
    output_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False))
    print(f"  Publishing plan saved to: {output_path}")
    print(f"  {len(plan)} posts across {len(posts_with_images)} platforms")
    return output_path
