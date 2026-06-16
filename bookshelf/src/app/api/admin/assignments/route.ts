import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { auth } from '@/auth';
import { mapError, ForbiddenError } from '@/lib/ownership';
import { UnauthorizedError } from '@/lib/owner';
import { isPrimaryEmail } from '@/lib/owner-role';
import {
  listAllAccounts,
  getPostBridgeKeyForEmail,
} from '@/lib/posting/postbridge';

export const dynamic = 'force-dynamic';

/**
 * Per-friend Post Bridge account assignments. Read by the primary owner only.
 *
 *   GET   → { friends, accounts }
 *           friends   = users (non-primary) with their assigned account ids
 *           accounts  = every account on the shared key (the pool to choose from)
 *   PATCH → { ownerId, accountIds } overwrites a single friend's assignments
 */
async function requirePrimary() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new UnauthorizedError();
  if (!isPrimaryEmail(email)) {
    throw new ForbiddenError('Only the primary owner can manage assignments.');
  }
}

export async function GET() {
  try {
    await requirePrimary();

    const primary = (process.env.OWNER_EMAIL_PRIMARY ?? '').toLowerCase();
    const friends = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) <> ${primary}`)
      .orderBy(asc(schema.users.email));

    const allAssignments = friends.length
      ? await db
          .select()
          .from(schema.userAccountAssignments)
          .where(
            inArray(
              schema.userAccountAssignments.ownerId,
              friends.map((f) => f.id),
            ),
          )
      : [];
    const byOwner = new Map<string, number[]>();
    for (const row of allAssignments) {
      const arr = byOwner.get(row.ownerId) ?? [];
      arr.push(row.postBridgeAccountId);
      byOwner.set(row.ownerId, arr);
    }

    // Use the shared key here. Friends can only ever be assigned shared-key
    // accounts (the primary owner's accounts are hidden by design).
    const sharedKey = process.env.POSTBRIDGE_API_KEY_SHARED ?? '';
    const accounts = sharedKey
      ? await listAllAccounts(sharedKey).catch(() => [])
      : [];

    const enrichedFriends = friends.map((f) => ({
      ...f,
      assignedAccountIds: byOwner.get(f.id) ?? [],
    }));

    return NextResponse.json({ friends: enrichedFriends, accounts });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

const PatchSchema = z.object({
  ownerId: z.string().uuid(),
  accountIds: z.array(z.number().int()),
});

export async function PATCH(req: NextRequest) {
  try {
    await requirePrimary();
    const input = PatchSchema.parse(await req.json());

    // Don't let assignments target the primary owner themselves.
    const target = await db.query.users.findFirst({
      where: eq(schema.users.id, input.ownerId),
    });
    if (!target) throw new ForbiddenError('User not found.');
    if (isPrimaryEmail(target.email)) {
      throw new ForbiddenError('Cannot assign accounts to the primary owner.');
    }

    // Replace the set: delete current, insert new.
    await db
      .delete(schema.userAccountAssignments)
      .where(eq(schema.userAccountAssignments.ownerId, input.ownerId));
    if (input.accountIds.length) {
      await db.insert(schema.userAccountAssignments).values(
        input.accountIds.map((postBridgeAccountId) => ({
          ownerId: input.ownerId,
          postBridgeAccountId,
        })),
      );
    }
    return NextResponse.json({ ok: true, count: input.accountIds.length });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
