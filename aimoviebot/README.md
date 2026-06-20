# AI Movie Bot

9:16 vertical AI movies. Character image + location image + scene description → 4–15s video with spoken dialogue baked in by Seedance.

## Deploy

1. Push this branch to GitHub.
2. Create a Vercel project pointing at `aimoviebot/` as the root directory.
3. Storage → Create → Blob (token auto-injects, no env var needed).
4. AI → enable AI Gateway (OIDC auto-auth, no env var needed in production).
5. Deploy.
6. Visit `https://<your-prod-url>/api/oauth/higgsfield` once to connect Higgsfield via OAuth. Tokens persist in Blob; the connection is reused across renders and refreshed automatically.

No API keys to manage. The Higgsfield client uses MCP-over-HTTP with the OAuth access token. If the OAuth flow isn't connected, the pipeline still completes via the AI Gateway fallback (Gemini 3 Pro Image + Seedance 2.0 Fast).

## How it works

- Stage 0: concept (mode A/B/C) → draft sceneDescription + dialogue lines → user approves
- Stages 1–5 run as durable steps in a Vercel Workflow (no serverless timeout pressure)
- Every artifact persists to Blob; the status page renders them as they land

## Cost guard

- 720p / fast / `generate_audio: true` / `aspectRatio: "9:16"` always
- Default duration 4s for iteration; per-render duration override up to 15s
- 1080p is hard-banned via `ALLOW_1080P = false` in `lib/video-module/config.ts`
