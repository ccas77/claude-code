import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  genreId: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = Body.parse(await req.json());

    // Scope to books this user actually owns.
    const owned = await db
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(
        and(inArray(schema.books.id, input.ids), eq(schema.books.ownerId, ownerId)),
      );
    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    await db
      .update(schema.books)
      .set({ genreId: input.genreId, updatedAt: new Date() })
      .where(inArray(schema.books.id, ownedIds));

    return NextResponse.json({ updated: ownedIds.length });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
