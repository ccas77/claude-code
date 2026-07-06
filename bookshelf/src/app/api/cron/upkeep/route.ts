import { NextRequest, NextResponse } from 'next/server';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { db } from '@/lib/db/client';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { cronUnauthorized } from '@/lib/clocks/auth';

/**
 * Upkeep clock.
 *
 * Hourly maintenance: retry recoverable failures (Stage 8 logic), refresh
 * post-bridge stats on recently posted cards (Stage 7 logic), and clean up
 * orphaned files (Stage 8). Triggers fan-out queue jobs; the actual work
 * happens in worker handlers.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (cronUnauthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Drizzle's migrator is idempotent (tracks applied migrations in a
  // journal table), so re-running it hourly is a no-op after the first
  // pass. Doing it here means new deploys pick up schema changes without
  // a manual /api/admin/migrate step.
  let migrated: boolean | { error: string } = false;
  try {
    await migrate(db as never, {
      migrationsFolder: path.join(process.cwd(), 'src/lib/db/migrations'),
    });
    migrated = true;
  } catch (err) {
    migrated = { error: (err as Error).message };
  }

  const retryJob = await enqueue(
    JOB_NAMES.RETRY_FAILURES,
    { triggeredAt: new Date().toISOString() },
    { singletonKey: 'retry-failures' },
  );
  const statsJob = await enqueue(
    JOB_NAMES.REFRESH_STATS,
    { triggeredAt: new Date().toISOString() },
    { singletonKey: 'refresh-stats' },
  );

  return NextResponse.json({ ok: true, migrated, retryJob, statsJob });
}
