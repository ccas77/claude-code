import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { cronUnauthorized } from '@/lib/clocks/auth';

/**
 * Post-on-time clock.
 *
 * Scans for Ready cards whose post time has arrived and hands them off to
 * the POST_CARD handler. Near-instant by design: the video is already
 * made; this is just an outbound API call to post-bridge.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (cronUnauthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.status, 'ready'),
        lte(schema.cards.postTime, now),
        ne(schema.cards.platform, 'preview'),
      ),
    )
    .limit(100);

  let enqueued = 0;
  for (const card of due) {
    const jobId = await enqueue(
      JOB_NAMES.POST_CARD,
      { cardId: card.id },
      { singletonKey: `post:${card.id}` },
    );
    if (jobId) enqueued++;
  }

  return NextResponse.json({ ok: true, found: due.length, enqueued });
}
