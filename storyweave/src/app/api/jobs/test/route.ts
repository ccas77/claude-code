import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

/**
 * Stage-1 round-trip harness: POST enqueues a test job, the cron worker
 * processes it into event_log, GET lists what landed.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const jobId = await enqueue(JOB_NAMES.TEST_ECHO, { message: body.message ?? 'ping' });
  return NextResponse.json({ enqueued: true, jobId }, { status: 202 });
}

export async function GET() {
  const events = await db.query.eventLog.findMany({
    where: eq(schema.eventLog.stage, 'queue.test'),
    orderBy: desc(schema.eventLog.createdAt),
    limit: 20,
  });
  return NextResponse.json({ events });
}
