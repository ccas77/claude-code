import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  bookId: z.string().uuid(),
  musicClipId: z.string().uuid(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.cards)
      .where(and(eq(schema.cards.ownerId, ownerId), eq(schema.cards.platform, 'preview')))
      .orderBy(desc(schema.cards.createdAt))
      .limit(50);
    return NextResponse.json({ renders: rows });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = CreateSchema.parse(await req.json());

    // Verify the book + music belong to this owner
    const [book, music] = await Promise.all([
      db.query.books.findFirst({
        where: and(eq(schema.books.id, input.bookId), eq(schema.books.ownerId, ownerId)),
      }),
      db.query.musicClips.findFirst({
        where: and(
          eq(schema.musicClips.id, input.musicClipId),
          eq(schema.musicClips.ownerId, ownerId),
        ),
      }),
    ]);
    if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 });
    if (!music) return NextResponse.json({ error: 'music not found' }, { status: 404 });

    // Far-future postTime keeps Stage 6/7 from ever scheduling this card to post.
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const [card] = await db
      .insert(schema.cards)
      .values({
        ownerId,
        status: 'scheduled',
        postTime: farFuture,
        platform: 'preview',
        accountHandle: 'preview',
        bookId: book.id,
        musicClipId: music.id,
      })
      .returning();

    const jobId = await enqueue(JOB_NAMES.RENDER_CARD, { cardId: card.id });

    return NextResponse.json({ card, jobId }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
