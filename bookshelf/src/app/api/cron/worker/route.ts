import { NextRequest, NextResponse } from 'next/server';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { db } from '@/lib/db/client';
import { boss } from '@/lib/queue';
import { getHandler, getBatchSize, registeredQueues } from '@/lib/workers/registry';

/**
 * Vercel-native worker. Runs on every cron tick.
 * Polls each registered queue and processes one batch per tick.
 *
 * Scale by:
 *   - increasing batch size (BATCH_SIZE)
 *   - increasing cron frequency (vercel.json)
 *   - splitting heavy queues into their own routes
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  // Vercel cron sets Authorization: Bearer ${CRON_SECRET}
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) return unauthorized();
  }

  // Idempotent - drizzle's journal table skips already-applied
  // migrations. This means a new deploy picks up schema changes on the
  // next cron tick (~1 min) instead of needing a manual migrate step.
  try {
    await migrate(db as never, {
      migrationsFolder: path.join(process.cwd(), 'src/lib/db/migrations'),
    });
  } catch {
    // Migration errors surface via cron logs; don't block worker.
  }

  const b = await boss();
  const summary: Record<string, { processed: number; failed: number }> = {};

  for (const name of registeredQueues()) {
    await b.createQueue(name).catch(() => {});
    const jobs = await b.fetch(name, { batchSize: getBatchSize(name) });
    const counts = { processed: 0, failed: 0 };
    const handler = getHandler(name);
    if (!handler) continue;

    for (const job of jobs) {
      try {
        await handler(job.data, job.id);
        await b.complete(name, job.id);
        counts.processed++;
      } catch (err) {
        await b.fail(name, job.id, { error: (err as Error).message });
        counts.failed++;
      }
    }
    summary[name] = counts;
  }

  return NextResponse.json({ ok: true, summary });
}
