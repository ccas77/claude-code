import { eq } from 'drizzle-orm';
import { db, schema } from './db/client';
import { auth } from '../auth';

/**
 * Session-based owner resolution, copied from bookshelf. Reads the signed-in
 * Google email from the Auth.js JWT, upserts a `users` row, returns its id.
 *
 * DEV_FAKE_OWNER_EMAIL (non-production only) lets local scripts and curl
 * exercise owner-scoped routes without OAuth. Never set it on Vercel.
 */

export class UnauthorizedError extends Error {
  constructor(msg = 'Not signed in') {
    super(msg);
  }
}

export async function getOwnerId(): Promise<string> {
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_FAKE_OWNER_EMAIL) {
    return getOwnerIdForEmail(process.env.DEV_FAKE_OWNER_EMAIL);
  }
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
