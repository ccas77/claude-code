import { NextRequest, NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'x',
  'linkedin',
  'facebook',
  'pinterest',
  'threads',
  'bluesky',
] as const;

const CreateSchema = z.object({
  bookId: z.string().uuid(),
  musicClipId: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  accountHandle: z.string().min(1).max(120),
  postTime: z.coerce.date(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.ownerId, ownerId))
      .orderBy(desc(schema.cards.postTime))
      .limit(200);
    return NextResponse.json({ cards: rows });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = CreateSchema.parse(await req.json());

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

    if (input.postTime.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'postTime must be in the future' },
        { status: 400 },
      );
    }

    const [card] = await db
      .insert(schema.cards)
      .values({
        ownerId,
        status: 'scheduled',
        postTime: input.postTime,
        platform: input.platform,
        accountHandle: input.accountHandle,
        bookId: book.id,
        musicClipId: music.id,
      })
      .returning();

    return NextResponse.json({ card }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
