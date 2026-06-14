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
    const clip = await db.query.musicClips.findFirst({
      where: and(eq(schema.musicClips.id, id), eq(schema.musicClips.ownerId, ownerId)),
    });
    await assertOwns(clip ?? null);

    await db
      .update(schema.musicClips)
      .set({ transcriptionStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.musicClips.id, id));

    const jobId = await enqueue(JOB_NAMES.TRANSCRIBE_MUSIC, { musicClipId: id });

    return NextResponse.json({ enqueued: true, jobId });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
