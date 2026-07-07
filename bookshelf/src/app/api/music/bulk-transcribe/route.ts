import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = Body.parse(await req.json());

    const owned = await db
      .select({ id: schema.musicClips.id })
      .from(schema.musicClips)
      .where(
        and(
          inArray(schema.musicClips.id, input.ids),
          eq(schema.musicClips.ownerId, ownerId),
        ),
      );
    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ enqueued: 0 });
    }

    await db
      .update(schema.musicClips)
      .set({ transcriptionStatus: 'pending', updatedAt: new Date() })
      .where(inArray(schema.musicClips.id, ownedIds));

    await Promise.all(
      ownedIds.map((musicClipId) =>
        enqueue(JOB_NAMES.TRANSCRIBE_MUSIC, { musicClipId }),
      ),
    );

    return NextResponse.json({ enqueued: ownedIds.length });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
