import { eq } from 'drizzle-orm';
import { db, schema } from './db/client';
import { env } from './config';

/**
 * Single-user mode: there is exactly one owner today, identified by OWNER_EMAIL.
 * Every row in the system gets that owner's id stamped on it.
 *
 * Multi-user later is a flip - the owner_id column already exists. Swap this
 * function for a session/auth lookup and nothing else has to change.
 */
let cachedOwnerId: string | null = null;

export async function getOwnerId(): Promise<string> {
  if (cachedOwnerId) return cachedOwnerId;

  const ownerEmail = env().OWNER_EMAIL;
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, ownerEmail),
  });

  if (existing) {
    cachedOwnerId = existing.id;
    return existing.id;
  }

  const [created] = await db
    .insert(schema.users)
    .values({ email: ownerEmail })
    .returning({ id: schema.users.id });

  cachedOwnerId = created.id;
  return created.id;
}
