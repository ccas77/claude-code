import type { PostSpec, SubmitResult } from "./types";

export function makeDryRunResult(spec: PostSpec, postLogId: string): SubmitResult {
  return {
    postLogId,
    dryRun: true,
    status: "dry_run",
    pbPostId: `dry_${spec.idempotencyKey}`,
    verification: null,
    error: null,
  };
}

export function dryRunRequestPayload(spec: PostSpec) {
  return {
    dry_run: true,
    caption: spec.caption,
    media: spec.mediaUrls,
    social_accounts: [spec.socialAccountId],
    scheduled_at: spec.scheduledAt ?? null,
    idempotency_key: spec.idempotencyKey,
  };
}
