import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function isMember(userId: string, workspaceId: string): Promise<boolean> {
  const rows = await db
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.userId, userId),
        eq(schema.workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function assertMember(userId: string, workspaceId: string): Promise<string | null> {
  return (await isMember(userId, workspaceId)) ? null : "not a member of that workspace";
}
