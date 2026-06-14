import { NextRequest, NextResponse } from 'next/server';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-shot migration runner. Protected by CRON_SECRET so the endpoint
 * isn't public. Hit it once after each deploy (or wire it into a deploy hook).
 *
 *   curl -X POST https://<deployment>/api/admin/migrate \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const folder = path.join(process.cwd(), 'src/lib/db/migrations');
  try {
    await migrate(db as never, { migrationsFolder: folder });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
