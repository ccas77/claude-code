import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  anyGenre: z.boolean(),
  genreIds: z.array(z.string().uuid()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = Body.parse(await req.json());

    // Scope to clips this user actually owns.
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

    // Flip the any_genre flag (and bump updatedAt).
    await db
      .update(schema.musicClips)
      .set({ anyGenre: input.anyGenre, updatedAt: new Date() })
      .where(inArray(schema.musicClips.id, ownedIds));

    // Clear existing genre links for these clips, then write the new ones.
    await db
      .delete(schema.musicClipGenres)
      .where(inArray(schema.musicClipGenres.musicClipId, ownedIds));

    if (!input.anyGenre && input.genreIds.length > 0) {
      const rows = ownedIds.flatMap((musicClipId) =>
        input.genreIds.map((genreId) => ({ musicClipId, genreId })),
      );
      if (rows.length > 0) {
        await db.insert(schema.musicClipGenres).values(rows);
      }
    }

    return NextResponse.json({ updated: ownedIds.length });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
