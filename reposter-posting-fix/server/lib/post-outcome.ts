// Records the outcome of every attempt to publish a scheduled post, so a
// post can never again silently disappear. This is the core of the fix:
// the send path currently swallows errors; here we classify + persist them.
//
// ADAPT: point this import at the same Upstash client the rest of the app
// uses (the one in the winners/facebook-report routes).
import { redis } from "@/lib/redis";

export type PostState =
  | "scheduled" // waiting for its send window
  | "sending" // picked up by the worker, in flight
  | "posted" // confirmed published
  | "failed" // send attempted and rejected
  | "skipped"; // worker chose not to send it (window/dedup/filter)

/**
 * Why a send failed. `auth` and `permission` mean a human must reconnect the
 * account — retrying will never help. `transient`/`rate_limited` are safe to
 * retry. `content`/`skipped_*` are per-post problems that need the post
 * edited, not retried.
 */
export type FailureKind =
  | "auth" // token expired / invalid credentials
  | "permission" // account lacks permission / scope for this action
  | "rate_limited"
  | "transient" // network, 5xx, timeout
  | "content" // media/caption rejected by the platform
  | "skipped_window" // not sent: outside the computed send window
  | "skipped_duplicate" // not sent: already-posted guard fired
  | "skipped_filter" // not sent: some other filter excluded it
  | "unknown";

export interface PostOutcome {
  postId: string;
  accountId: string | null;
  platform: string | null;
  state: PostState;
  failureKind: FailureKind | null;
  failureMessage: string | null; // the raw provider/skip reason, verbatim
  attempts: number;
  updatedAt: number;
}

const RETRYABLE: ReadonlySet<FailureKind> = new Set([
  "transient",
  "rate_limited",
]);

export function isRetryable(kind: FailureKind): boolean {
  return RETRYABLE.has(kind);
}

const outcomeKey = (postId: string) => `post:outcome:${postId}`;
const FAILED_INDEX = "post:failed"; // sorted set: score = updatedAt

/**
 * Persist an outcome and keep a `post:failed` index so /api/status can list
 * failures without scanning every post. Pipelined: one Upstash round-trip.
 */
export async function recordOutcome(
  o: Omit<PostOutcome, "updatedAt">,
  now: number,
): Promise<void> {
  const outcome: PostOutcome = { ...o, updatedAt: now };
  const p = redis.pipeline();
  p.set(outcomeKey(o.postId), JSON.stringify(outcome));
  if (o.state === "failed" || o.state === "skipped") {
    p.zadd(FAILED_INDEX, { score: now, member: o.postId });
  } else {
    p.zrem(FAILED_INDEX, o.postId); // a later success clears a prior failure
  }
  await p.exec();
}

export async function getOutcome(postId: string): Promise<PostOutcome | null> {
  const raw = await redis.get<string | PostOutcome>(outcomeKey(postId));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as PostOutcome) : raw;
}

/** Most-recent failures/skips for the status endpoint and UI. */
export async function recentFailures(limit = 100): Promise<PostOutcome[]> {
  const ids = await redis.zrange<string[]>(FAILED_INDEX, 0, limit - 1, {
    rev: true,
  });
  if (!ids?.length) return [];
  const p = redis.pipeline();
  ids.forEach((id) => p.get(outcomeKey(id)));
  const rows = (await p.exec()) as (string | PostOutcome | null)[];
  return rows
    .map((r) => (typeof r === "string" ? JSON.parse(r) : r))
    .filter(Boolean) as PostOutcome[];
}
