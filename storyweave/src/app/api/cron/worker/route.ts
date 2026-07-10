import { NextRequest, NextResponse } from 'next/server';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import { db } from '@/lib/db/client';
import { boss } from '@/lib/queue';
import { getBatchSize, getHandler, registeredQueues } from '@/lib/workers/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The per-minute Vercel Cron worker — bookshelf's pattern verbatim.
 * Pull a batch from each registered queue, run handlers inline, complete or
 * fail each job explicitly (fail + retryLimit gives backoff retries).
 * Migrations run first every tick; the drizzle journal makes them a no-op
 * after first apply, so deploys self-migrate within a minute.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await migrate(db as never, {
      migrationsFolder: path.join(process.cwd(), 'src/lib/db/migrations'),
    });
  } catch (err) {
    console.error('[worker] migrate failed', err);
  }

  const b = await boss();
  const summary: Record<string, { done: number; failed: number }> = {};

  for (const name of registeredQueues()) {
    await b.createQueue(name).catch(() => {});
    const jobs = await b.fetch(name, { batchSize: getBatchSize(name) });
    const handler = getHandler(name);
    if (!handler || jobs.length === 0) continue;

    const counts = { done: 0, failed: 0 };
    for (const job of jobs) {
      try {
        await handler(job.data, job.id);
        await b.complete(name, job.id);
        counts.done++;
      } catch (err) {
        console.error(`[worker] ${name} ${job.id} failed:`, err);
        await b.fail(name, job.id, { error: err instanceof Error ? err.message : String(err) });
        counts.failed++;
      }
    }
    summary[name] = counts;
  }

  return NextResponse.json({ ok: true, summary });
}
