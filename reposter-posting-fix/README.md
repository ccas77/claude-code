# Stop reposter posts failing silently

Symptom: some scheduled posts publish, others silently don't — Post Bridge
shows every account still connected, nothing expired, and there are **no
runtime errors in Vercel**. That combination means the failures happen inside
the app's own send path and are being **swallowed** (caught and discarded, or
the post is skipped with a bare `continue`). This package makes every post end
in one recorded, visible state so the real cause stops hiding.

> Built without direct access to the reposter repo (this session is scoped to
> `ccas77/claude-code` only and `add_repo` is failing). Wire the two `// ADAPT`
> points to existing code — the Upstash client and the Post Bridge call.

## First: which half of the pipeline is it?

Before/while wiring this in, answer one question by looking at Post Bridge's
**post history** (the per-post activity log, not the connections page):

- **The missing post shows in PB as `failed`** → it reached Post Bridge and the
  platform rejected it. Cause is at send time: `classifyError` in
  `send-post.ts` will now capture the exact reason (auth / rate-limit /
  content).
- **The missing post is not in PB at all** → the app dropped it *before*
  sending. Cause is the worker's selection logic — a send-window / timezone
  math bug or an over-eager already-posted (dedup) guard silently skipping it.
  `skipPost()` will now record which guard fired.

Either way you get a reason; you no longer have to guess.

## What the package does

| File | Role |
|---|---|
| `server/lib/post-outcome.ts` | Persists a per-post outcome (`posted`/`failed`/`skipped`) with the reason to Upstash, and keeps a `post:failed` index so status can list failures cheaply. |
| `server/lib/send-post.ts` | `sendPost()` wraps the Post Bridge call: records success, classifies + records failures, retries only transient/rate-limit classes. `skipPost()` records a deliberate skip instead of a silent `continue`. `classifyError()` turns provider errors into actionable kinds (auth → "reconnect", not retried). |

## Integration

1. **Wire the two `// ADAPT` imports**: the `redis` client, and
   `sendToPostBridge(post)`. Make the Post Bridge call **throw on non-2xx**
   with the response status/body in the error — that is the single most
   important change; the old code almost certainly ignores a failed response.

2. **In the posting worker/cron**, replace the current inner loop:
   ```ts
   for (const post of duePosts) {
     // OLD: try { await send(post) } catch { /* swallowed */ }
     // OLD: if (alreadyPosted(post)) continue;      // silent
     if (alreadyPosted(post)) { await skipPost(post, "skipped_duplicate", "already posted", now); continue; }
     if (!inWindow(post))      { await skipPost(post, "skipped_window", `now=${now} window=${post.scheduledFor}`, now); continue; }
     await sendPost(post, now);   // records posted|failed itself; never throws past here
   }
   ```
   Crucially, do **not** wrap `sendPost` in a try/catch that discards the
   error — it already records everything.

3. **Surface it in `/api/status`** (the endpoint already exists): add
   ```ts
   import { recentFailures } from "@/lib/post-outcome";
   // ...
   const failures = await recentFailures(100);
   // include in the JSON: { failedCount: failures.length, failures }
   ```
   and render a "Failed / skipped posts" list with `failureKind` +
   `failureMessage` in the UI. Show accounts with `failureKind: "auth"` or
   `"permission"` as **needs reconnect**.

4. **Deploy.** Within one cron cycle the status page will show exactly which
   posts failed and why. Then fix the actual cause (reconnect a specific
   account, correct the send-window math, loosen the dedup guard) with real
   information instead of guesses.

## Note on retry semantics

`sendPost` retries only `transient` and `rate_limited`. `auth`/`permission`
are recorded once and left for a human — retrying an expired token just burns
API calls. If your worker is a per-minute Vercel cron, prefer letting the next
tick re-pick a still-`failed` transient post over inline retry loops, so one
post can't eat the whole 300s budget.
