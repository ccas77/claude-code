import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logEvent } from "@/lib/db/event-log";
import { postbridgeDryRun } from "@/lib/env";
import { AllowlistDenied, assertUserCanPost } from "./allowlist";
import { PostBridgeClient } from "./client";
import { dryRunRequestPayload, makeDryRunResult } from "./dry-run";
import { postSpecSchema, type PostSpec, type SubmitResult, type VerificationResult } from "./types";
import { verifyCreation } from "./verify";

export { AllowlistDenied, assertUserCanPost, listAllowedAccounts } from "./allowlist";
export { PostBridgeClient } from "./client";
export type { PostSpec, SubmitResult, VerificationResult } from "./types";
export { postSpecSchema } from "./types";

interface SubmitOptions {
  // Force dry-run for a specific submission regardless of env; env dry-run
  // still overrides live-mode callers.
  forceDryRun?: boolean;
  verifyPages?: number;
}

export async function submitPost(
  input: unknown,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const spec = postSpecSchema.parse(input);
  const dryRun = options.forceDryRun || postbridgeDryRun();

  // Load the target account inside the workspace scope.
  const [account] = await db
    .select()
    .from(schema.socialAccounts)
    .where(eq(schema.socialAccounts.id, spec.socialAccountId))
    .limit(1);
  if (!account) throw new Error(`social_account ${spec.socialAccountId} not found`);
  if (account.workspaceId !== spec.workspaceId) {
    throw new Error(`social_account ${spec.socialAccountId} is not in workspace ${spec.workspaceId}`);
  }
  if (!account.isActive) throw new Error(`social_account ${spec.socialAccountId} is inactive`);

  if (spec.actorUserId) {
    await assertUserCanPost(spec.actorUserId, spec.socialAccountId);
  }

  // Idempotency: if we already have a row with this key, return it instead of creating a new one.
  const [existing] = await db
    .select()
    .from(schema.postLog)
    .where(eq(schema.postLog.idempotencyKey, spec.idempotencyKey))
    .limit(1);
  if (existing) {
    return {
      postLogId: existing.id,
      dryRun: existing.dryRun,
      status: existing.status,
      pbPostId: existing.pbPostId,
      verification: (existing.verification as unknown as VerificationResult | null) ?? null,
      error: existing.error,
    };
  }

  const [row] = await db
    .insert(schema.postLog)
    .values({
      workspaceId: spec.workspaceId,
      actorUserId: spec.actorUserId,
      socialAccountId: spec.socialAccountId,
      idempotencyKey: spec.idempotencyKey,
      caption: spec.caption,
      mediaUrls: spec.mediaUrls,
      dryRun,
      status: dryRun ? "dry_run" : "submitted",
      requestPayload: dryRun ? dryRunRequestPayload(spec) : {},
    })
    .returning({ id: schema.postLog.id });
  const postLogId = row.id;

  if (dryRun) {
    await logEvent({
      workspaceId: spec.workspaceId,
      actorUserId: spec.actorUserId,
      eventType: "post.dry_run",
      entityType: "post_log",
      entityId: postLogId,
      payload: { socialAccountId: spec.socialAccountId, mediaCount: spec.mediaUrls.length },
    });
    return makeDryRunResult(spec, postLogId);
  }

  // Live path: hit PB, never retry, then verify.
  const client = new PostBridgeClient({
    apiKey: process.env.POSTBRIDGE_API_KEY,
    baseUrl: process.env.POSTBRIDGE_BASE_URL ?? "https://api.post-bridge.com",
  });

  const requestPayload = {
    caption: spec.caption,
    media: spec.mediaUrls,
    social_accounts: [account.pbAccountId],
    platform_configurations: {
      [account.platform]: { is_aigc: account.isAigc },
    },
    scheduled_at: spec.scheduledAt,
    idempotency_key: spec.idempotencyKey,
  };

  let pbPostId: string | null = null;
  let responsePayload: unknown = null;
  try {
    const created = await client.createPost(requestPayload);
    pbPostId = created.id;
    responsePayload = created.raw;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.postLog)
      .set({ status: "failed", error: message, requestPayload })
      .where(eq(schema.postLog.id, postLogId));
    await logEvent({
      workspaceId: spec.workspaceId,
      actorUserId: spec.actorUserId,
      eventType: "post.failed",
      entityType: "post_log",
      entityId: postLogId,
      payload: { error: message },
    });
    return {
      postLogId,
      dryRun: false,
      status: "failed",
      pbPostId: null,
      verification: null,
      error: message,
    };
  }

  const verification =
    pbPostId != null
      ? await verifyCreation(client, account.pbAccountId, pbPostId, options.verifyPages ?? 3)
      : null;

  const finalStatus: SubmitResult["status"] =
    verification?.status === "verified"
      ? "verified"
      : verification?.status === "unverified" || verification?.status === "not_found"
        ? "unverified"
        : "submitted";

  await db
    .update(schema.postLog)
    .set({
      status: finalStatus,
      pbPostId,
      requestPayload,
      responsePayload: (responsePayload as Record<string, unknown>) ?? {},
      verification: (verification as unknown as Record<string, unknown>) ?? {},
      verifiedAt: verification?.status === "verified" ? new Date() : null,
    })
    .where(eq(schema.postLog.id, postLogId));

  await logEvent({
    workspaceId: spec.workspaceId,
    actorUserId: spec.actorUserId,
    eventType: `post.${finalStatus}`,
    entityType: "post_log",
    entityId: postLogId,
    payload: { pbPostId, verification },
  });

  return {
    postLogId,
    dryRun: false,
    status: finalStatus,
    pbPostId,
    verification,
    error: null,
  };
}
