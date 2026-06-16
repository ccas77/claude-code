import { eq } from 'drizzle-orm';
import { db, schema } from './db/client';
import { auth } from '../auth';

/**
 * Session-based owner resolution. Reads the signed-in Google email from the
 * Auth.js JWT, upserts a `users` row by email, returns that row's id.
 *
 * Cron endpoints and admin handlers run without a session and must call
 * getOwnerIdForEmail directly with the owner email they're operating on
 * (resolved from the card row's stamped owner_id).
 */

export class UnauthorizedError extends Error {
  constructor(msg = 'Not signed in') {
    super(msg);
  }
}

export async function getOwnerId(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new UnauthorizedError();
  return getOwnerIdForEmail(email);
}

export async function getOwnerIdForEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, normalized),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(schema.users)
    .values({ email: normalized })
    .returning({ id: schema.users.id });
  return created.id;
}

export async function getOwnerEmail(ownerId: string): Promise<string | null> {
  const row = await db.query.users.findFirst({
    where: eq(schema.users.id, ownerId),
  });
  return row?.email ?? null;
}
