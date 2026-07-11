// The wrapper that replaces the current fire-and-forget send. Every post now
// ends in exactly one recorded terminal state — posted, failed, or skipped —
// with the reason kept. No path falls through silently.

import {
  FailureKind,
  isRetryable,
  PostState,
  recordOutcome,
} from "./post-outcome";

// ADAPT: your existing Post Bridge call. It should THROW on non-2xx (include
// the response body/status in the error) rather than returning a falsy value
// that the old code ignored. If it currently returns {ok:false}, convert that
// to a throw, or map it below.
import { sendToPostBridge } from "@/lib/postbridge";

export interface ScheduledPost {
  id: string;
  accountId: string | null;
  platform: string | null;
  // ...whatever the send needs (text, mediaUrls, scheduledFor, etc.)
  [k: string]: unknown;
}

/**
 * Map a provider error to a FailureKind. ADAPT the string/҂status checks to
 * what Post Bridge actually returns — the point is that auth/permission
 * failures are classified as non-retryable so they surface as "reconnect",
 * while 5xx/network/429 are retried.
 */
export function classifyError(err: unknown): {
  kind: FailureKind;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const m = message.toLowerCase();
  const status = (err as { status?: number })?.status;

  if (status === 401 || /invalid.*token|token.*expired|unauthorized|oauth/.test(m))
    return { kind: "auth", message };
  if (status === 403 || /permission|not authorized|forbidden|scope/.test(m))
    return { kind: "permission", message };
  if (status === 429 || /rate.?limit|too many requests/.test(m))
    return { kind: "rate_limited", message };
  if (
    (status !== undefined && status >= 500) ||
    /timeout|econnreset|network|fetch failed|getaddrinfo|eai_again/.test(m)
  )
    return { kind: "transient", message };
  if (/media|caption|too long|duplicate|invalid.*content|unsupported/.test(m))
    return { kind: "content", message };
  return { kind: "unknown", message };
}

const MAX_ATTEMPTS = 3;

/**
 * Attempt to publish one post. Returns the terminal state. The worker loop
 * should call this for each due post and MUST NOT swallow anything itself —
 * this function already records every outcome.
 */
export async function sendPost(
  post: ScheduledPost,
  now: number,
  attemptsSoFar = 0,
): Promise<PostState> {
  const base = {
    postId: post.id,
    accountId: post.accountId,
    platform: post.platform,
  };

  let attempt = attemptsSoFar;
  // Retry only transient/rate-limit classes, up to MAX_ATTEMPTS.
  // (No sleep between tries here — a serverless worker should re-pick the post
  // on its next tick; if you retry inline, add a small backoff.)
  while (true) {
    attempt++;
    try {
      await sendToPostBridge(post);
      await recordOutcome(
        {
          ...base,
          state: "posted",
          failureKind: null,
          failureMessage: null,
          attempts: attempt,
        },
        now,
      );
      return "posted";
    } catch (err) {
      const { kind, message } = classifyError(err);
      const canRetry = isRetryable(kind) && attempt < MAX_ATTEMPTS;
      await recordOutcome(
        {
          ...base,
          state: "failed",
          failureKind: kind,
          failureMessage: message,
          attempts: attempt,
        },
        now,
      );
      if (!canRetry) return "failed";
      // fall through to retry
    }
  }
}

/**
 * Call this instead of silently `continue`-ing when the worker decides a due
 * post should NOT be sent (outside window, already posted, filtered). The
 * reason becomes visible instead of the post just never going out.
 */
export async function skipPost(
  post: ScheduledPost,
  kind: "skipped_window" | "skipped_duplicate" | "skipped_filter",
  reason: string,
  now: number,
): Promise<void> {
  await recordOutcome(
    {
      postId: post.id,
      accountId: post.accountId,
      platform: post.platform,
      state: "skipped",
      failureKind: kind,
      failureMessage: reason,
      attempts: 0,
    },
    now,
  );
}
