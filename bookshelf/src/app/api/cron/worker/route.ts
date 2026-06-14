import { NextRequest, NextResponse } from 'next/server';
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
