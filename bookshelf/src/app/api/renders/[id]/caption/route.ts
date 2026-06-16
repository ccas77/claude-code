import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { generateCaption } from '@/lib/captions/generate';

export const dynamic = 'force-dynamic';

/**
 * Generate a caption riff for this render. Reads the linked book's saved
 * source material plus the audio caption text and asks Gemini Flash for a
 * fresh BookTok-style caption.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const card = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
    });
    await assertOwns(card ?? null);
    if (!card!.bookId) {
      return NextResponse.json(
        { error: 'card has no linked book' },
        { status: 409 },
      );
    }

    const book = await db.query.books.findFirst({
      where: eq(schema.books.id, card!.bookId),
    });
    if (!book) {
      return NextResponse.json({ error: 'book not found' }, { status: 404 });
    }

    const genre = book.genreId
      ? await db.query.genres.findFirst({
          where: eq(schema.genres.id, book.genreId),
        })
      : null;

    const audioCaption = card!.musicClipId
      ? await db.query.captions.findFirst({
          where: eq(schema.captions.musicClipId, card!.musicClipId),
        })
      : null;

    const tagPool = Array.from(
      new Set([...(book.hashtags ?? []), ...(genre?.defaultHashtags ?? [])]),
    );

    const caption = await generateCaption({
      bookTitle: book.title,
      isSet: book.kind === 'set',
      description: book.description,
      reviewDump: book.reviewDump,
      tropes: book.tropes ?? [],
      vibeNotes: book.vibeNotes,
      audioCaption: audioCaption?.fullText ?? null,
      hashtags: tagPool,
    });

    return NextResponse.json({ caption });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
