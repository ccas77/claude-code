# StoryWeave

Turns a story premise + character descriptions into an illustrated, narrated
video with Ken Burns motion — and the **same character in every frame**. The
"illustrated story" YouTube format, as one self-contained web app.

A sibling of `bookshelf/`: same stack, same conventions, same Vercel-native
architecture (Next.js App Router, Neon Postgres, Vercel Blob, pg-boss queue
worked by a per-minute cron, bundled ffmpeg rendering inside the worker
function).

## How a video gets made

```
premise ──► script (LLM: scenes + narration + shot notes)
        ──► cast   (reference images per character — the identity lock)
        ──► scenes (image per scene: action + locked description + style lock,
        │           WITH the reference images attached — that's what keeps
        │           the character consistent)
        ──► voice  (TTS narration per scene, word timings for captions)
        ──► clips  (ffmpeg: Ken Burns zoom/pan toward each scene's focal
        │           point, burned captions, scene audio)
        ──► final  (stream-copy concat — instant, any length)
```

Everything asynchronous runs through the pg-boss queue in Postgres, worked by
`/api/cron/worker` every minute (batch sizes keep heavy jobs inside the 300s
budget). Orchestration is one idempotent `story.advance` job that looks at
what exists in the DB and enqueues only what's missing — so retries resume,
and **regenerating one scene** is just clearing its columns and re-advancing.

## Safety default

`DRY_RUN=true` out of the box: **no paid AI calls are ever made**. The
pipeline still runs end-to-end with free placeholders (solid-color scenes,
silent narration, real ffmpeg renders), so every stage can be exercised —
locally or deployed — before a single API key is spent. Flip to `false` to go
live.

## Provisioning (Vercel)

1. Push this directory as a Vercel project (root directory: `storyweave`).
2. Add the **Neon** Marketplace integration — populates `DATABASE_URL`.
3. Create a **Blob** store — populates `BLOB_READ_WRITE_TOKEN`.
4. Set in Project Settings: `DRY_RUN=true`, `CRON_SECRET` (any long random
   string), `AUTH_SECRET` (`openssl rand -base64 32`), `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS=you@example.com`.
5. Deploy. Migrations run at build and again on every worker tick
   (idempotent), so the schema lands automatically.

Go-live keys, when you're ready (see `.env.example` for the full annotated
list): `AI_GATEWAY_API_KEY` is automatic on Vercel (OIDC) for script + images;
`OPENAI_API_KEY` for narration. Then set `DRY_RUN=false`.

### Verify a deployment

```bash
curl https://<deployment>/api/health          # DB + blob + dryRun
curl -X POST https://<deployment>/api/jobs/test \
  -H 'content-type: application/json' -d '{"message":"round-trip"}'
# wait ~1 min for the cron worker, then:
curl https://<deployment>/api/jobs/test       # the echo landed in event_log
```

## Local dev

```bash
pnpm install
cp .env.example .env.local   # set DATABASE_URL to any local Postgres
pnpm db:migrate
pnpm dev
# worker doesn't run on a cron locally — tick it yourself:
watch -n 5 curl -s http://localhost:3000/api/cron/worker
```

No Blob token locally → files land in `.blob-local/` and are served back via
`/_blob/*`, so previews and video playback work offline. Set
`DEV_FAKE_OWNER_EMAIL=you@example.com` to skip OAuth during local testing
(non-production only; never set on Vercel).

## Layout

```
src/app                  pages (list / new / story detail) + API routes
src/app/api/cron/worker  the per-minute queue worker
src/lib/db               drizzle schema + migrations (stories, characters,
                         scenes, event_log)
src/lib/workers          job registry + story.advance orchestrator
src/lib/pipeline         script (LLM) · images (reference-injected) · voice
src/lib/render           ffmpeg: Ken Burns clips, ASS captions, concat
```

## v1 scope and the upgrade path

v1 = make → preview → download. Deliberately not built yet: publishing
(bookshelf's post-bridge integration is the template), Whisper-timed captions
(currently evenly-spread word timings; bookshelf's transcription code is the
template), drift QC on character faces, music beds, image-to-video motion on
hero scenes.
