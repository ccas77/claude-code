import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env } from '@/lib/config';
import { putBlob, delBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Public health gate: DB reachable, storage writable, dry-run state. */
export async function GET() {
  const checks: Record<string, boolean | string> = {};
  let ok = true;

  try {
    await db.execute(sql`select 1`);
    checks.database = true;
  } catch (err) {
    checks.database = err instanceof Error ? err.message : 'failed';
    ok = false;
  }

  try {
    const probe = `health/probe-${Date.now()}.txt`;
    await putBlob(probe, Buffer.from('ok'));
    await delBlob(probe);
    checks.blob = true;
  } catch (err) {
    checks.blob = err instanceof Error ? err.message : 'failed';
    ok = false;
  }

  checks.dryRun = env().DRY_RUN;

  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
