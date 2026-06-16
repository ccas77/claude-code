import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

/**
 * Per-user render counts for the last 7 days. Lets the primary owner see who
 * is burning credits across the shared OpenAI/Gemini/Higgsfield budget.
 *
 * Gated by CRON_SECRET so it's not publicly enumerable.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      email: schema.users.email,
      ownerId: schema.users.id,
      renders: sql<number>`count(${schema.cards.id})`,
      lastCreatedAt: sql<Date | null>`max(${schema.cards.createdAt})`,
    })
    .from(schema.users)
    .leftJoin(
      schema.cards,
      sql`${schema.cards.ownerId} = ${schema.users.id} AND ${schema.cards.createdAt} >= ${since}`,
    )
    .groupBy(schema.users.id, schema.users.email)
    .orderBy(sql`count(${schema.cards.id}) desc`);

  return NextResponse.json({ since: since.toISOString(), users: rows });
}
