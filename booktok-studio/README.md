# BookTok Studio — one book, every output

Enter a book once → get every output type your book apps make (slideshow,
BookTok video storyboard, quote video, meme, Top-N list, quadrant carousel,
Pinterest pin, social card, reel).

Self-contained: no database, no API keys, no external services. Rendering is
zero-dependency SVG (DRY_RUN) so it runs and deploys with zero setup. Real
Gemini image gen + ffmpeg video swap in behind the same `BookModule` interface
(see `app/lib/catalog.ts`).

## Deploy (get a URL, no localhost)
Import this folder as a new project on vercel.com (New Project → pick the repo →
set Root Directory to `booktok-studio` → Deploy). Framework auto-detects as
Next.js. No environment variables needed.

## Run locally (optional)
    pnpm install && pnpm dev   # http://localhost:3000
