import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  listAllAccounts,
  getPostBridgeKeyForEmail,
} from '@/lib/posting/postbridge';
import { db, schema } from '@/lib/db/client';
import { auth } from '@/auth';
import { mapError } from '@/lib/ownership';
import { UnauthorizedError, getOwnerIdForEmail } from '@/lib/owner';
import { isPrimaryEmail } from '@/lib/owner-role';

export const dynamic = 'force-dynamic';

/**
 * Account dropdown source. The primary owner sees every account on her
 * Post Bridge key. Friends see only the accounts the primary owner has
 * explicitly assigned to them from the shared Post Bridge key.
 */
export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (!email) throw new UnauthorizedError();

    const apiKey = getPostBridgeKeyForEmail(email);
    const accounts = await listAllAccounts(apiKey);

    if (isPrimaryEmail(email)) {
      return NextResponse.json({ accounts });
    }

    const ownerId = await getOwnerIdForEmail(email);
    const assigned = await db
      .select({ id: schema.userAccountAssignments.postBridgeAccountId })
      .from(schema.userAccountAssignments)
      .where(eq(schema.userAccountAssignments.ownerId, ownerId));
    const allowed = new Set(assigned.map((r) => r.id));
    const filtered = accounts.filter((a) => allowed.has(a.id));
    return NextResponse.json({ accounts: filtered });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
