# content-engine

Single app replacing the fleet of one-off social-media apps. See `content-engine-architecture.md` at repo root for the full blueprint.

**Milestone M0 (this scaffold):** Next.js + Drizzle + Supabase + Inngest wiring, auth, workspaces/members/pen_names, event_log, CI (typecheck + build).

Do not deviate from the architecture doc silently. Log deviations in `DECISIONS.md`.

## Stack (fixed)

- Next.js App Router + TypeScript
- Supabase Postgres via Drizzle ORM
- Supabase Auth (Google sign-in, roles: admin | member)
- Inngest for jobs/scheduling
- Post Bridge (M1)

## Local layout

```
src/
  app/          Next.js routes (UI + API)
  services/     Shared capabilities (posting, scheduling, ai, rendering, assets, observability)
  modules/      Content-type handlers (slideshow first)
  lib/db/       Drizzle schema + migrations
  lib/supabase/ Server + browser clients
inngest/        Function definitions
```

## Env

Copy `.env.example` to `.env.local` and fill in the values from Supabase + Inngest dashboards. Env is validated at boot in `src/lib/env.ts`; missing values fail fast.
