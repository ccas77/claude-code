import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { env } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true };
  } catch (e) {
    checks.database = { ok: false, detail: (e as Error).message };
  }

  checks.blob = {
    ok: true,
    detail: env().BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'local-disk fallback',
  };

  checks.dryRun = { ok: true, detail: env().DRY_RUN ? 'ON (safe)' : 'OFF (live)' };

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
