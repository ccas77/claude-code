import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

/**
 * Bulk-assign one restriction mode to many clips.
 *
 *   mode = 'free'   -> anyGenre = true,  clear genre + book links
 *   mode = 'genres' -> anyGenre = false, replace genre links with genreIds,
 *                      clear book links
 *   mode = 'books'  -> anyGenre = false, replace book links with bookIds,
 *                      clear genre links
 *
 * Path name is historical ("bulk-genres") but the endpoint covers all three
 * modes; renaming would break the client deploy synchronisation.
 */
const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  mode: z.enum(['free', 'genres', 'books']),
  genreIds: z.array(z.string().uuid()).default([]),
  bookIds: z.array(z.string().uuid()).default([]),
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
      return NextResponse.json({ updated: 0 });
    }

    await db
      .update(schema.musicClips)
      .set({ anyGenre: input.mode === 'free', updatedAt: new Date() })
      .where(inArray(schema.musicClips.id, ownedIds));

    await db
      .delete(schema.musicClipGenres)
      .where(inArray(schema.musicClipGenres.musicClipId, ownedIds));
    await db
      .delete(schema.musicClipBooks)
      .where(inArray(schema.musicClipBooks.musicClipId, ownedIds));

    if (input.mode === 'genres' && input.genreIds.length > 0) {
      const rows = ownedIds.flatMap((musicClipId) =>
        input.genreIds.map((genreId) => ({ musicClipId, genreId })),
      );
      if (rows.length > 0) {
        await db.insert(schema.musicClipGenres).values(rows);
      }
    }

    if (input.mode === 'books' && input.bookIds.length > 0) {
      const rows = ownedIds.flatMap((musicClipId) =>
        input.bookIds.map((bookId) => ({ musicClipId, bookId })),
      );
      if (rows.length > 0) {
        await db.insert(schema.musicClipBooks).values(rows);
      }
    }

    return NextResponse.json({ updated: ownedIds.length });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
