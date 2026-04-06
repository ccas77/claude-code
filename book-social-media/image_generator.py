"""Generates branded images for social media posts using Pillow.

Creates quote cards, gradient backgrounds, and styled text overlays
with the book's branding colors. No external image API required.
"""

from __future__ import annotations

import math
import random
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from config import Config
from post_generator import SocialPost


# Platform image dimensions (width x height)
PLATFORM_SIZES = {
    "instagram": (1080, 1080),  # Square post
    "facebook": (1200, 630),  # Landscape link preview
    "tiktok": (1080, 1920),  # Vertical 9:16
    "pinterest": (1000, 1500),  # Vertical 2:3 pin
}

# Post type to visual style mapping
STYLE_MAP = {
    "quote": "quote_card",
    "chapter_teaser": "gradient_text",
    "character_spotlight": "spotlight",
    "theme_exploration": "gradient_text",
    "behind_the_scenes": "minimal",
    "reader_question": "bold_question",
    "book_trivia": "trivia_card",
    "emotional_hook": "quote_card",
    "review_prompt": "bold_question",
    "reading_motivation": "gradient_text",
}


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color string to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Load a font, falling back to default if custom fonts aren't available."""
    font_paths = [
        # Common Linux paths
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        # macOS paths
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in font_paths:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def draw_gradient(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    color_start: tuple[int, int, int],
    color_end: tuple[int, int, int],
    angle: float = 0,
):
    """Draw a linear gradient on the image."""
    # Simple vertical/diagonal gradient
    for y in range(height):
        ratio = y / height
        # Apply angle offset
        for x in range(width):
            angle_offset = (x / width) * math.sin(math.radians(angle)) * 0.3
            r = ratio + angle_offset
            r = max(0, min(1, r))
            color = tuple(
                int(color_start[i] + (color_end[i] - color_start[i]) * r)
                for i in range(3)
            )
            draw.point((x, y), fill=color)


def draw_geometric_accents(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    accent_color: tuple[int, int, int],
    style: str,
):
    """Add subtle geometric decorative elements."""
    accent_with_alpha = accent_color + (40,)  # Low opacity

    if style in ("quote_card", "gradient_text"):
        # Corner accents
        line_len = min(width, height) // 6
        # Top-left corner bracket
        draw.line([(40, 40), (40, 40 + line_len)], fill=accent_color, width=3)
        draw.line([(40, 40), (40 + line_len, 40)], fill=accent_color, width=3)
        # Bottom-right corner bracket
        draw.line(
            [(width - 40, height - 40), (width - 40, height - 40 - line_len)],
            fill=accent_color, width=3,
        )
        draw.line(
            [(width - 40, height - 40), (width - 40 - line_len, height - 40)],
            fill=accent_color, width=3,
        )

    elif style == "bold_question":
        # Large question mark watermark
        font = get_font(min(width, height) // 2, bold=True)
        bbox = draw.textbbox((0, 0), "?", font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text(
            (width - tw - 30, height - th - 20),
            "?",
            fill=(*accent_color, 25),
            font=font,
        )

    elif style == "trivia_card":
        # Dots pattern in corner
        for i in range(5):
            for j in range(5):
                x = width - 80 + i * 15
                y = 50 + j * 15
                if 0 < x < width and 0 < y < height:
                    draw.ellipse(
                        [x - 3, y - 3, x + 3, y + 3], fill=accent_color
                    )


def draw_wrapped_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
    start_x: int,
    start_y: int,
    fill: tuple,
    line_spacing: int = 10,
) -> int:
    """Draw text wrapped to fit within max_width. Returns final Y position."""
    # Estimate characters per line
    avg_char_width = font.getlength("M")
    chars_per_line = max(10, int(max_width / avg_char_width))
    lines = textwrap.wrap(text, width=chars_per_line)

    y = start_y
    for line in lines:
        draw.text((start_x, y), line, fill=fill, font=font)
        bbox = draw.textbbox((0, 0), line, font=font)
        line_height = bbox[3] - bbox[1]
        y += line_height + line_spacing

    return y


def generate_quote_card(post: SocialPost, size: tuple[int, int]) -> Image.Image:
    """Generate a styled quote card image."""
    width, height = size
    primary = hex_to_rgb(Config.BRAND_PRIMARY)
    secondary = hex_to_rgb(Config.BRAND_SECONDARY)
    accent = hex_to_rgb(Config.BRAND_ACCENT)
    font_color = hex_to_rgb(Config.BRAND_FONT_COLOR)

    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")

    # Gradient background
    draw_gradient(draw, width, height, primary, accent, angle=30)

    # Geometric accents
    draw_geometric_accents(draw, width, height, secondary, "quote_card")

    # Opening quote mark
    quote_font = get_font(min(width, height) // 4, bold=True)
    draw.text((60, height // 6 - 40), "\u201c", fill=secondary, font=quote_font)

    # Main quote text
    text = post.content
    if len(text) > 280:
        text = text[:277] + "..."

    # Scale font size based on text length and image size
    base_size = min(width, height) // 14
    if len(text) > 200:
        base_size = int(base_size * 0.75)
    elif len(text) > 100:
        base_size = int(base_size * 0.85)

    body_font = get_font(base_size, bold=False)
    margin = width // 8
    text_y = height // 4
    text_end_y = draw_wrapped_text(
        draw, text, body_font, width - margin * 2, margin, text_y, font_color
    )

    # Author attribution
    author_font = get_font(base_size // 2, bold=True)
    author_text = f"\u2014 {Config.BOOK_AUTHOR}, {Config.BOOK_TITLE}"
    draw.text(
        (margin, min(text_end_y + 30, height - 120)),
        author_text,
        fill=secondary,
        font=author_font,
    )

    # Bottom bar accent
    draw.rectangle(
        [(0, height - 8), (width, height)], fill=secondary
    )

    return img


def generate_gradient_text(post: SocialPost, size: tuple[int, int]) -> Image.Image:
    """Generate a gradient background with prominent text."""
    width, height = size
    primary = hex_to_rgb(Config.BRAND_PRIMARY)
    secondary = hex_to_rgb(Config.BRAND_SECONDARY)
    accent = hex_to_rgb(Config.BRAND_ACCENT)
    font_color = hex_to_rgb(Config.BRAND_FONT_COLOR)

    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")

    # Darker gradient
    dark = tuple(max(0, c - 30) for c in primary)
    draw_gradient(draw, width, height, dark, primary, angle=45)

    draw_geometric_accents(draw, width, height, accent, "gradient_text")

    # Title/hook text (first sentence or short version)
    text = post.caption if len(post.caption) < 120 else post.content[:150]
    title_size = min(width, height) // 10
    title_font = get_font(title_size, bold=True)
    margin = width // 10
    text_y = height // 3
    draw_wrapped_text(draw, text, title_font, width - margin * 2, margin, text_y, font_color)

    # Book title at bottom
    small_font = get_font(title_size // 3)
    book_label = f"{Config.BOOK_TITLE} by {Config.BOOK_AUTHOR}"
    draw.text((margin, height - 80), book_label, fill=secondary, font=small_font)

    # Accent line
    draw.rectangle([(margin, height - 90), (margin + 60, height - 87)], fill=secondary)

    return img


def generate_bold_question(post: SocialPost, size: tuple[int, int]) -> Image.Image:
    """Generate a bold question/CTA style image."""
    width, height = size
    secondary = hex_to_rgb(Config.BRAND_SECONDARY)
    font_color = hex_to_rgb(Config.BRAND_FONT_COLOR)
    primary = hex_to_rgb(Config.BRAND_PRIMARY)

    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")

    # Bold secondary color background with dark overlay
    draw_gradient(draw, width, height, primary, secondary, angle=60)

    draw_geometric_accents(draw, width, height, font_color, "bold_question")

    # Main text — use caption for short punchy text
    text = post.caption if post.caption else post.content[:120]
    title_size = min(width, height) // 8
    title_font = get_font(title_size, bold=True)
    margin = width // 8

    # Center vertically
    draw_wrapped_text(
        draw, text, title_font, width - margin * 2, margin, height // 3, font_color
    )

    # CTA at bottom
    cta_font = get_font(title_size // 3)
    draw.text(
        (margin, height - 100),
        "Share your thoughts below \u2193",
        fill=(*font_color, 200),
        font=cta_font,
    )

    return img


def generate_trivia_card(post: SocialPost, size: tuple[int, int]) -> Image.Image:
    """Generate a trivia/fun fact card."""
    width, height = size
    primary = hex_to_rgb(Config.BRAND_PRIMARY)
    secondary = hex_to_rgb(Config.BRAND_SECONDARY)
    accent = hex_to_rgb(Config.BRAND_ACCENT)
    font_color = hex_to_rgb(Config.BRAND_FONT_COLOR)

    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img, "RGBA")

    draw_gradient(draw, width, height, accent, primary, angle=20)
    draw_geometric_accents(draw, width, height, secondary, "trivia_card")

    # "Did you know?" header
    header_font = get_font(min(width, height) // 12, bold=True)
    margin = width // 8
    draw.text((margin, height // 6), "Did you know?", fill=secondary, font=header_font)

    # Underline
    draw.rectangle(
        [(margin, height // 6 + 60), (margin + 200, height // 6 + 63)],
        fill=secondary,
    )

    # Body text
    body_size = min(width, height) // 16
    body_font = get_font(body_size)
    text = post.content[:250] if len(post.content) > 250 else post.content
    draw_wrapped_text(
        draw, text, body_font, width - margin * 2, margin, height // 3, font_color
    )

    # Book reference
    ref_font = get_font(body_size // 2)
    draw.text(
        (margin, height - 80),
        f"From: {Config.BOOK_TITLE}",
        fill=secondary,
        font=ref_font,
    )

    return img


def generate_minimal(post: SocialPost, size: tuple[int, int]) -> Image.Image:
    """Generate a minimal/clean style image."""
    width, height = size
    font_color = hex_to_rgb(Config.BRAND_PRIMARY)
    accent = hex_to_rgb(Config.BRAND_SECONDARY)

    # White/light background
    img = Image.new("RGB", (width, height), (250, 250, 248))
    draw = ImageDraw.Draw(img)

    margin = width // 8
    # Top accent bar
    draw.rectangle([(margin, 40), (margin + 40, 43)], fill=accent)

    # Text
    title_font = get_font(min(width, height) // 14, bold=True)
    text = post.caption if post.caption else post.content[:160]
    draw_wrapped_text(
        draw, text, title_font, width - margin * 2, margin, height // 3, font_color
    )

    # Author at bottom
    small_font = get_font(min(width, height) // 24)
    draw.text(
        (margin, height - 80),
        Config.BOOK_AUTHOR,
        fill=accent,
        font=small_font,
    )

    return img


# Style function dispatch
STYLE_GENERATORS = {
    "quote_card": generate_quote_card,
    "gradient_text": generate_gradient_text,
    "bold_question": generate_bold_question,
    "trivia_card": generate_trivia_card,
    "spotlight": generate_gradient_text,  # Reuse gradient style
    "minimal": generate_minimal,
}


def generate_image(post: SocialPost) -> Path:
    """Generate an image for a single post and save it to disk."""
    Config.IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    size = PLATFORM_SIZES.get(post.platform, (1080, 1080))
    style_name = STYLE_MAP.get(post.post_type, "gradient_text")
    generator = STYLE_GENERATORS.get(style_name, generate_gradient_text)

    img = generator(post, size)

    # Save with a descriptive filename
    safe_type = post.post_type.replace(" ", "_")
    filename = f"{post.platform}_{safe_type}_{random.randint(1000, 9999)}.png"
    output_path = Config.IMAGES_DIR / filename
    img.save(output_path, "PNG", quality=95)

    return output_path


def generate_images_for_posts(
    posts: dict[str, list[SocialPost]],
) -> dict[str, list[tuple[SocialPost, Path]]]:
    """Generate images for all posts. Returns posts paired with their image paths."""
    results = {}
    for platform, platform_posts in posts.items():
        paired = []
        for post in platform_posts:
            print(f"  Creating image: {platform}/{post.post_type}")
            image_path = generate_image(post)
            paired.append((post, image_path))
        results[platform] = paired
        print(f"  Created {len(paired)} images for {platform}")
    return results
