# Book Social Media Automation

Reads your book files, generates platform-specific posts for **Instagram**, **Facebook**, **TikTok**, and **Pinterest**, creates branded images, and publishes them automatically via **Post Bridge** on a schedule.

## How It Works

```
Book Files (.txt, .md, .pdf, .epub)
        │
        ▼
  ┌─────────────┐
  │ Book Reader  │  Extracts chapters, quotes, themes
  └──────┬──────┘
         ▼
  ┌──────────────────┐
  │  Post Generator   │  Claude API creates platform-tailored posts
  │  (Claude API)     │  with hashtags, hooks, and CTAs
  └──────┬───────────┘
         ▼
  ┌──────────────────┐
  │  Image Generator  │  Creates branded quote cards, gradient
  │  (Pillow)         │  graphics, trivia cards per post type
  └──────┬───────────┘
         ▼
  ┌──────────────────┐
  │   Publisher       │  Uploads media + schedules posts via
  │  (Post Bridge)    │  Post Bridge API on a staggered calendar
  └──────────────────┘
```

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env with your API keys and book info

# 3. Add your book files
cp your-book.pdf books/

# 4. Preview
python main.py --preview

# 5. Dry run (generates everything, saves plan, no publishing)
python main.py --dry-run

# 6. Go live
python main.py --publish          # One-shot
python main.py --schedule         # Continuous scheduler
```

## Commands

| Command | Description |
|---------|-------------|
| `--preview` | Show book content summary and configuration |
| `--dry-run` | Full pipeline but save plan instead of publishing |
| `--publish` | Generate and publish immediately |
| `--schedule` | Run continuously, generating new batches on a cycle |
| `--schedule-dry` | Scheduled dry runs for testing |
| `--generate-only` | Generate posts + images without publishing |

## Configuration

All settings via environment variables (`.env` file):

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key for post generation |
| `POSTBRIDGE_API_KEY` | Post Bridge API key |
| `POSTBRIDGE_WORKSPACE_ID` | Your Post Bridge workspace |
| `POSTBRIDGE_*_ACCOUNT_ID` | Account IDs for each platform |
| `BOOK_TITLE` / `BOOK_AUTHOR` / `BOOK_GENRE` | Book metadata |
| `BRAND_COLOR_PRIMARY` / `SECONDARY` / `ACCENT` | Hex colors for image branding |
| `POST_TIMES` | Comma-separated times (24h format) |
| `DAYS_BETWEEN_POSTS` | Spacing between posts per platform |
| `POSTS_PER_BATCH` | Number of posts generated per platform per batch |

## Platform Optimization

Each platform gets posts tailored to its audience and format:

- **Instagram**: Visual quote cards, 20-25 hashtags, aspirational tone, carousel-ready
- **Facebook**: Longer narratives, discussion prompts, 3-5 hashtags, community-driven
- **TikTok**: Short punchy hooks, trend-aware, 5-8 hashtags, BookTok optimized
- **Pinterest**: SEO-optimized pins, aesthetic imagery, keyword-rich descriptions

## Image Styles

Images are auto-generated based on post type:

- **Quote cards** — Gradient background with decorative brackets and attribution
- **Gradient text** — Bold text overlays on dark gradients
- **Bold question** — High-contrast CTA-style cards
- **Trivia cards** — "Did you know?" format with dot accents
- **Minimal** — Clean white background, editorial style

## Project Structure

```
book-social-media/
├── main.py              # CLI entry point
├── config.py            # Configuration loader
├── book_reader.py       # Book file parsing (txt, md, pdf, epub)
├── post_generator.py    # Claude API post generation
├── image_generator.py   # Pillow-based image creation
├── publisher.py         # Post Bridge API client
├── scheduler.py         # Recurring batch scheduler
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
├── books/               # Place your book files here
└── output/
    ├── posts/           # Generated post JSON + publishing plans
    └── images/          # Generated post images
```

## Post Bridge Setup

1. Sign up at [postbridge.app](https://postbridge.app)
2. Connect your Instagram, Facebook, TikTok, and Pinterest accounts
3. Copy your API key and workspace ID to `.env`
4. Copy each platform's account ID to the corresponding env variable
