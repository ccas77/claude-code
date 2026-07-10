"""Generates platform-specific social media posts using Claude API.

Creates tailored content for Instagram, Facebook, TikTok, and Pinterest,
each optimized for the platform's audience, format, and best practices.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

import anthropic

from config import Config
from book_reader import BookContent


@dataclass
class SocialPost:
    """A generated social media post for a specific platform."""

    platform: str
    content: str
    hashtags: list[str]
    image_prompt: str  # Description for image generation
    post_type: str  # quote, teaser, behind_scenes, review_prompt, trivia, etc.
    caption: str  # Short version for platforms with limits

    def full_text(self) -> str:
        """Return the post content with hashtags appended."""
        tags = " ".join(f"#{tag}" for tag in self.hashtags)
        return f"{self.content}\n\n{tags}"


PLATFORM_GUIDELINES = {
    "instagram": {
        "max_length": 2200,
        "hashtag_count": "20-25",
        "tone": "Visual, aspirational, emotional. Use line breaks for readability. Include a call-to-action.",
        "formats": "carousel text, quote cards, behind-the-scenes, reader Q&A prompts, book aesthetics",
    },
    "facebook": {
        "max_length": 5000,
        "hashtag_count": "3-5",
        "tone": "Conversational, storytelling-driven, community-focused. Ask questions to drive engagement.",
        "formats": "longer narratives, discussion prompts, excerpt sharing, event announcements, polls",
    },
    "tiktok": {
        "max_length": 300,
        "hashtag_count": "5-8",
        "tone": "Punchy, hook-driven, trendy. Start with a hook. Short sentences. Gen-Z friendly but authentic.",
        "formats": "hot takes, plot summaries without spoilers, character debates, BookTok trends, reading vlogs",
    },
    "pinterest": {
        "max_length": 500,
        "hashtag_count": "5-10",
        "tone": "Inspirational, aesthetic, search-optimized. Use keywords naturally for discoverability.",
        "formats": "quote pins, reading list graphics, aesthetic mood boards, book recommendation pins",
    },
}

POST_TYPES = [
    "quote",
    "chapter_teaser",
    "character_spotlight",
    "theme_exploration",
    "behind_the_scenes",
    "reader_question",
    "book_trivia",
    "emotional_hook",
    "review_prompt",
    "reading_motivation",
]


# JSON schema for structured outputs — guarantees every response parses,
# so a batch can never be silently lost to malformed JSON.
POSTS_SCHEMA = {
    "type": "object",
    "properties": {
        "posts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "content": {"type": "string"},
                    "hashtags": {"type": "array", "items": {"type": "string"}},
                    "image_prompt": {"type": "string"},
                    "post_type": {"type": "string", "enum": POST_TYPES},
                    "caption": {"type": "string"},
                },
                "required": ["content", "hashtags", "image_prompt", "post_type", "caption"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["posts"],
    "additionalProperties": False,
}


def build_system_prompt(book: BookContent) -> str:
    """Build the shared system prompt.

    This is identical for every platform in a batch, so it is sent with a
    cache_control breakpoint — the book summary is paid for once per batch
    and the remaining platform calls read it from the prompt cache.
    """
    return f"""You are an expert social media content creator specializing in book marketing.
You write posts to promote this book:

{book.summary_for_prompt()}

POST TYPE VARIETY - use a mix of these types across each batch:
{', '.join(POST_TYPES)}

IMPORTANT RULES:
- Never include major spoilers
- Each post must feel fresh and unique — no repetition
- Hashtags should mix popular book hashtags with niche ones relevant to the genre (without # prefix)
- Include an image_prompt that describes a visually compelling image to pair with the post
- The image_prompt should describe a mood, scene, or aesthetic — NOT include any text
- The caption is a shorter version of the post (under 150 chars) for thumbnail/preview use
- Make the content genuinely engaging, not generic "buy my book" spam"""


def build_platform_prompt(platform: str, batch_size: int) -> str:
    """Build the small per-platform user message."""
    guidelines = PLATFORM_GUIDELINES[platform]

    return f"""Generate {batch_size} unique social media posts for {platform.upper()}.

PLATFORM RULES FOR {platform.upper()}:
- Max length: {guidelines['max_length']} characters
- Hashtag count: {guidelines['hashtag_count']}
- Tone: {guidelines['tone']}
- Best formats: {guidelines['formats']}"""


def parse_posts_response(response_text: str, platform: str) -> list[SocialPost]:
    """Parse Claude's JSON response into SocialPost objects."""
    # Structured outputs guarantee valid JSON, but keep the fence-stripping
    # fallback so hand-edited saved responses still parse.
    cleaned = response_text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        posts_data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"  Warning: Failed to parse JSON for {platform}: {e}")
        print(f"  Response preview: {cleaned[:200]}")
        return []

    if isinstance(posts_data, dict):
        posts_data = posts_data.get("posts", [])

    posts = []
    for item in posts_data:
        posts.append(
            SocialPost(
                platform=platform,
                content=item.get("content", ""),
                hashtags=item.get("hashtags", []),
                image_prompt=item.get("image_prompt", ""),
                post_type=item.get("post_type", "quote"),
                caption=item.get("caption", ""),
            )
        )

    return posts


def generate_posts(
    book: BookContent,
    platforms: list[str] | None = None,
    batch_size: int | None = None,
) -> dict[str, list[SocialPost]]:
    """Generate social media posts for all specified platforms.

    Returns a dict mapping platform name to list of SocialPost objects.
    """
    if platforms is None:
        platforms = [p for p in Config.PLATFORMS if Config.ACCOUNTS.get(p)]
    if batch_size is None:
        batch_size = Config.POSTS_PER_BATCH

    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
    all_posts: dict[str, list[SocialPost]] = {}

    # The system prompt (book summary + shared rules) is byte-identical for
    # every platform, so the first call writes it to the prompt cache and
    # the remaining calls read it at ~10% of the input price.
    system_prompt = build_system_prompt(book)

    for platform in platforms:
        print(f"  Generating {batch_size} posts for {platform}...")

        message = client.messages.create(
            model=Config.CLAUDE_MODEL,
            max_tokens=16000,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {"role": "user", "content": build_platform_prompt(platform, batch_size)}
            ],
            output_config={"format": {"type": "json_schema", "schema": POSTS_SCHEMA}},
        )

        usage = message.usage
        cached = getattr(usage, "cache_read_input_tokens", 0) or 0
        print(
            f"  Tokens: {usage.input_tokens} in ({cached} from cache), "
            f"{usage.output_tokens} out"
        )

        response_text = next(
            (block.text for block in message.content if block.type == "text"), ""
        )
        posts = parse_posts_response(response_text, platform)
        all_posts[platform] = posts
        print(f"  Generated {len(posts)} posts for {platform}")

    return all_posts


def save_posts(posts: dict[str, list[SocialPost]]) -> Path:
    """Save generated posts to a JSON file for review/editing before publishing."""
    from pathlib import Path
    import datetime

    Config.POSTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Config.POSTS_DIR / f"posts_{timestamp}.json"

    serializable = {}
    for platform, platform_posts in posts.items():
        serializable[platform] = [
            {
                "platform": p.platform,
                "content": p.content,
                "hashtags": p.hashtags,
                "image_prompt": p.image_prompt,
                "post_type": p.post_type,
                "caption": p.caption,
                "full_text": p.full_text(),
            }
            for p in platform_posts
        ]

    output_path.write_text(json.dumps(serializable, indent=2, ensure_ascii=False))
    print(f"  Posts saved to: {output_path}")
    return output_path
