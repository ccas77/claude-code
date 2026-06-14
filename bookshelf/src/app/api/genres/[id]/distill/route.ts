import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const genre = await db.query.genres.findFirst({
      where: and(eq(schema.genres.id, id), eq(schema.genres.ownerId, ownerId)),
    });
    await assertOwns(genre ?? null);

    await db
      .update(schema.genres)
      .set({ recipeStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.genres.id, id));

    const jobId = await enqueue(JOB_NAMES.DISTILL_RECIPE, { genreId: id });
    return NextResponse.json({ enqueued: true, jobId });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
