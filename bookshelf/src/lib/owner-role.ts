import { auth } from '../auth';

/**
 * Returns true iff the signed-in user is the configured primary owner
 * (OWNER_EMAIL_PRIMARY). The primary owner sees their own Post Bridge accounts
 * unfiltered and manages the per-friend assignment table.
 */
export async function isPrimaryOwner(): Promise<boolean> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return false;
  const primary = (process.env.OWNER_EMAIL_PRIMARY ?? '').toLowerCase();
  return Boolean(primary) && email === primary;
}

export function isPrimaryEmail(email: string | null | undefined): boolean {
  const primary = (process.env.OWNER_EMAIL_PRIMARY ?? '').toLowerCase();
  if (!primary) return false;
  return (email ?? '').toLowerCase() === primary;
}
