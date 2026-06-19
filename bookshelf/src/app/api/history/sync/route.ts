import { NextResponse } from 'next/server';
import { runStatsRefresh } from '@/lib/posting/refreshStats';
import { getOwnerId } from '@/lib/owner';
import { mapError } from '@/lib/ownership';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * On-demand stats refresh, scoped to the signed-in user. Backfills missing
 * share URLs from /v1/posts/{id}/results and pulls fresh view/like/comment/
 * share counts from /v1/analytics. Triggered by the Sync button on
 * /history.
 */
export async function POST() {
  try {
    const ownerId = await getOwnerId();
    const result = await runStatsRefresh({
      jobId: randomUUID(),
      ownerScope: ownerId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
