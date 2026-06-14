import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { env } from '@/lib/config';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { cronUnauthorized } from '@/lib/clocks/auth';

/**
 * Prepare-ahead clock.
 *
 * Scans for cards whose post time is inside the lead-time window and which
 * haven't started rendering yet. Each one gets a RENDER_CARD job. The render
 * worker does the heavy lifting, this clock just decides what to start.
 *
 * Preview cards (platform='preview') are user-triggered test renders. They
 * use their own POST /api/renders entry point, so this scanner skips them.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (cronUnauthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const horizon = new Date(Date.now() + env().LEAD_TIME_HOURS * 60 * 60 * 1000);

  const due = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.status, 'scheduled'),
        lte(schema.cards.postTime, horizon),
        ne(schema.cards.platform, 'preview'),
      ),
    )
    .limit(200);

  let enqueued = 0;
  for (const card of due) {
    const jobId = await enqueue(
      JOB_NAMES.RENDER_CARD,
      { cardId: card.id },
      { singletonKey: `render:${card.id}` },
    );
    if (jobId) enqueued++;
  }

  return NextResponse.json({ ok: true, found: due.length, enqueued, horizon });
}
