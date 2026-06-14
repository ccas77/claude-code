import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message : 'hello';
  const jobId = await enqueue(JOB_NAMES.TEST_ECHO, { message });
  return NextResponse.json({ enqueued: true, jobId, message });
}

export async function GET() {
  const recent = await db
    .select()
    .from(schema.eventLog)
    .where(eq(schema.eventLog.stage, 'queue.test'))
    .orderBy(desc(schema.eventLog.createdAt))
    .limit(20);
  return NextResponse.json({ recent });
}
