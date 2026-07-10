# DECISIONS

Deviations from `content-engine-architecture.md` (repo root). One entry per deviation, newest first.

## 2026-07-10 — M1 posting core

### D-011: `is_aigc` lives on `social_accounts`, not on `workspaces`
- **Spec §6.1:** "`is_aigc` flag is a per-workspace setting, not hardcoded."
- **What we did:** Column `is_aigc boolean` on `social_accounts` (default `false`), used by the posting service when building the `platform_configurations` block.
- **Why:** Per-account is strictly finer-grained than per-workspace; the "not hardcoded" property is preserved (an admin sets it when the account is added). If a workspace-wide default is later wanted, it can be a `workspaces.default_is_aigc` that seeds the per-account value at insert time. Recorded here so a future reviewer sees the intent.

### D-012: Idempotency enforced in our DB, not just via the header
- **Spec §4 (posting):** requires "bookshelf's idempotency guard".
- **What we did:** `post_log.idempotency_key` has a unique index scoped to workspace. Before hitting PB, `submitPost` checks for a prior row with the same key and returns that result instead of creating a duplicate. We also send `Idempotency-Key` on the `POST /v1/posts` request.
- **Why:** PB's own idempotency behavior is undocumented and untrusted; the DB-side check is the load-bearing guard. The header is a belt-and-braces addition; it's fine if PB ignores it.

### D-013: Media path is URL only in M1
- **Spec §7:** M2 is the asset library; M1 says "post this image now" without specifying URL vs. upload.
- **What we did:** The manual flow accepts a public image URL only.
- **Why:** File upload requires the Supabase Storage bucket wiring and asset library that M2 adds. Standing owner preference is to support BOTH upload and URL paste — flag: revisit `/post-one` in M2 to add the upload path once assets/ is real.

### D-014: DRY_RUN is the default; live posting requires an explicit env
- **Spec §7 M1:** "DRY_RUN mode from day one (bookshelf pattern: placeholder generators, zero paid calls)."
- **What we did:** `postbridgeDryRun()` returns `true` unless `POSTBRIDGE_API_KEY` is set, and any value in `POSTBRIDGE_DRY_RUN` overrides. `submitPost` writes a `post_log` row with `status=dry_run` and never touches the network in that mode.
- **Why:** Owner authorized "everything must work in DRY_RUN without a real PB key." The env-based default (missing key ⇒ dry run) makes it impossible to accidentally go live by omission.

### D-015: RLS closed in this milestone
- **Resolves D-005.** M0 tables received RLS in migration `0001_auth_trigger_and_rls.sql`; M1 tables received RLS in `0003_m1_rls.sql`. Two `SECURITY DEFINER` helpers (`is_workspace_member`, `is_workspace_admin`) power the policies so we do not re-implement membership joins in every rule.
- **Note:** the posting service runs against `DATABASE_URL` (postgres role), which is treated as a service role and bypasses RLS. Any user-session read/write path (Supabase JS client from Next.js) is still gated by these policies.

### D-016: `POST /v1/posts` cannot be retried and the throttler enforces it
- **Spec §6.1:** "never retry post-create."
- **What we did:** `PostBridgeClient.createPost` passes `allowRetry: false` to the fetch wrapper. A 429 there surfaces as a normal error (which lands in `post_log.error`) rather than kicking off automatic retries. All other paths (list posts, list accounts) retain the `rate_limit.reset_ms`-driven 429 handling.

### D-017: Verification walks `/v1/posts`, filters client-side
- **Spec §6.1:** the `social_account_id` query filter is silently ignored (2026-06-26 incident).
- **What we did:** `verify.ts` paginates `/v1/posts` and matches `post.social_accounts[].id === pbAccountId AND post.id === pbPostId` in Node. Scans up to 3 pages by default; result codes are `verified | unverified | not_found`. The full verification object is stored on `post_log.verification`.

## 2026-07-10 — M0 scaffold

### D-001: Folder inside monorepo, not standalone repo
- **Spec §2:** "new standalone repo (e.g. `ccas77/content-engine`)"
- **What we did:** Scaffolded under `/content-engine` inside the existing `ccas77/claude-code` monorepo.
- **Why:** Owner's explicit instruction ("build the scaffold in a new folder called content-engine"). Keeps M0 → M2 iteration next to the audit doc and reference apps; a repo split can happen later without behavior change.

### D-002: CI workflow lives at repo root, not inside `content-engine/`
- **Spec §7:** M0 requires "CI: typecheck + build".
- **What we did:** Added `.github/workflows/content-engine-ci.yml` at the monorepo root with `paths:` filters scoped to `content-engine/**`, and `working-directory: content-engine`.
- **Why:** GitHub Actions only reads workflows from the repo-root `.github/workflows/` directory. A nested `content-engine/.github/workflows/ci.yml` would never run. This is a consequence of D-001.

### D-003 (resolved in M1): Lockfile now committed
- **Original:** "No local install, dependency lockfile, or build run during scaffold."
- **Resolution:** Owner authorized a one-time install as part of M1. `pnpm install` was run in `content-engine/`, producing `pnpm-lock.yaml`. CI now uses `--frozen-lockfile`. Dependency versions were bumped at install time because `@inngest/next` is not a real package (that import is served from the `inngest` package itself) and Next 15.1.3 carries CVE-2025-66478. Current pins: Next 16.2.10, Inngest 4.12.0, Drizzle ORM 0.45.2, drizzle-kit 0.31.10, Supabase SSR 0.7.0.
- **Follow-on:** `pnpm-workspace.yaml` was added with `allowBuilds:` for `esbuild`, `sharp`, `protobufjs` (pnpm 11 moved this config out of `package.json`). `packageManager` was re-pinned to `pnpm@11.6.0` to match the local install and CI uses pnpm 11.

### D-004: Auth users mirrored via `profiles` table
- **Spec §3:** lists `users / workspace_members` but doesn't fix the shape.
- **What we did:** `workspace_members.user_id` FKs to a `profiles` table (id = auth.users.id, email, display_name). Migration `0001_auth_trigger_and_rls.sql` installs a `SECURITY DEFINER` trigger on `auth.users` (`handle_new_user`) that upserts `profiles` on insert/update.
- **Why:** Drizzle can't own the Supabase-managed `auth` schema; `profiles` is the standard Supabase pattern for extending auth users with app columns.

### D-005 (resolved in M1 — see D-015)

### D-006: `packageManager` pinned to pnpm 11
- Superseded by D-003 note above.

### D-007: Custom migrator (`src/lib/db/migrate.ts`) instead of `drizzle-kit push`
- **Spec:** Silent.
- **What we did:** Migration application uses `drizzle-orm/postgres-js/migrator` reading from `src/lib/db/migrations`, driven by `pnpm db:migrate`. This is the standard drizzle-kit journal format, so future generation with `drizzle-kit generate` interoperates.
- **Why:** Push-style workflows lose the ability to inject raw SQL migrations (RLS policies, triggers). We need raw SQL for the auth trigger and every RLS policy, so we standardize on generate + apply from files.

### D-008: RLS helpers are `SECURITY DEFINER`
- **What we did:** `is_workspace_member(uuid)` and `is_workspace_admin(uuid)` are `SECURITY DEFINER` functions that read `workspace_members` with `auth.uid()`. Policies call them instead of embedding joins.
- **Why:** Without `SECURITY DEFINER`, the RLS policy on `workspaces` recursively depends on RLS on `workspace_members`, and Postgres will refuse the join under RLS. `SET search_path = public` inside each function pins schema resolution so the definer's privileges cannot be abused.

### D-009: `workspace_members_owner_bootstrap` policy
- **What we did:** Explicit `INSERT` policy that lets a workspace owner add themselves as the first member.
- **Why:** Without this, the admin-only write policy prevents anyone (including the creator) from ever joining a new workspace — chicken-and-egg. This is the narrow bootstrap seam; all other `workspace_members` writes still require admin.

### D-010: `event_log` is server-write only from the user session
- **What we did:** No `INSERT` policy on `event_log` for user sessions. Only reads are policy-gated. Writes must come from server-role code (`DATABASE_URL`).
- **Why:** Event log is append-only ground truth; letting the browser insert into it would allow forged history.
