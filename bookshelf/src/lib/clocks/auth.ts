import type { NextRequest } from 'next/server';

/**
 * Shared cron-auth check. Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
 * If no secret is configured the route is left open (dev only).
 */
export function cronUnauthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') !== `Bearer ${secret}`;
}
