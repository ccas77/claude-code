import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export class AllowlistDenied extends Error {
  constructor(
    public userId: string,
    public socialAccountId: string,
  ) {
    super(`user ${userId} is not on the allow-list for social_account ${socialAccountId}`);
  }
}

// Post Bridge has no workspace isolation: a single API key sees every account.
// Enforce a default-deny per-user allow-list in our own DB before every call.
export async function assertUserCanPost(userId: string, socialAccountId: string): Promise<void> {
  const rows = await db
    .select({ userId: schema.socialAccountAllowlist.userId })
    .from(schema.socialAccountAllowlist)
    .where(
      and(
        eq(schema.socialAccountAllowlist.userId, userId),
        eq(schema.socialAccountAllowlist.socialAccountId, socialAccountId),
      ),
    )
    .limit(1);
  if (rows.length === 0) throw new AllowlistDenied(userId, socialAccountId);
}

export async function listAllowedAccounts(userId: string) {
  return db
    .select({
      id: schema.socialAccounts.id,
      platform: schema.socialAccounts.platform,
      handle: schema.socialAccounts.handle,
      workspaceId: schema.socialAccounts.workspaceId,
      isActive: schema.socialAccounts.isActive,
      pbAccountId: schema.socialAccounts.pbAccountId,
    })
    .from(schema.socialAccountAllowlist)
    .innerJoin(
      schema.socialAccounts,
      eq(schema.socialAccountAllowlist.socialAccountId, schema.socialAccounts.id),
    )
    .where(eq(schema.socialAccountAllowlist.userId, userId));
}
