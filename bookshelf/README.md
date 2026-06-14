# Bookshelf

Turns book covers into captioned, scheduled videos and auto-posts them across
social platforms.

## Stack

- Next.js 16 App Router + TypeScript, deployed on Vercel (Fluid Compute)
- Postgres (Neon via Vercel Marketplace) with Drizzle ORM
- Job queue: pg-boss (Postgres-backed). Worked by a Vercel Cron job that hits
  `/api/cron/worker` every minute and processes a batch per tick.
- File storage: Vercel Blob
- Zod-validated environment config

## Build stages

The app is built and verified one stage at a time. Each stage must work before
the next begins.

1. **Foundations** - DB, file storage, owner tags, queue + cron worker
2. Three libraries (Music, Book, Genre) CRUD
3. Transcription pipeline (Demucs -> Whisper)
4. Genre recipe distillation
5. Render pipeline
6. Scheduling system (cards + three clocks)
7. post-bridge integration
8. Errors + fallback chains
9. Live board + History screens

## Provisioning (Vercel)

1. Link the project to Vercel.
2. Add the **Neon** Marketplace integration - populates `DATABASE_URL` etc.
3. Create a **Vercel Blob** store - populates `BLOB_READ_WRITE_TOKEN`.
4. Set `OWNER_EMAIL`, `DRY_RUN=true`, and `CRON_SECRET` in Project Settings.
5. Run the initial migration against the provisioned DB:
   `vercel env pull && drizzle-kit push` (one-shot from any environment that
   can reach the DB).

### Verify Stage 1 against the deployed URL

```bash
# Health check
curl https://<deployment>/api/health

# Enqueue a test job
curl -X POST https://<deployment>/api/jobs/test \
  -H 'content-type: application/json' \
  -d '{"message":"round-trip"}'

# Wait up to a minute for the cron worker to fire, then list recorded events
curl https://<deployment>/api/jobs/test
```

## Safety defaults

`DRY_RUN=true` by default. While dry-run is on the app will never:

- post to social platforms
- spend on paid AI APIs
- send notification emails

Flip to `false` only after a stage is fully exercised.

## Owner tagging

Single-user today: every row gets `owner_id` pointing at the user identified
by `OWNER_EMAIL`. Multi-tenant later is a flip - the column already exists,
swap `getOwnerId()` in `src/lib/owner.ts` for a session lookup.
