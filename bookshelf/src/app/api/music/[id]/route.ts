import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { delBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  anyGenre: z.boolean().optional(),
  genreIds: z.array(z.string().uuid()).optional(),
  bookIds: z.array(z.string().uuid()).optional(),
});

async function loadOwned(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.musicClips.findFirst({
    where: and(eq(schema.musicClips.id, id), eq(schema.musicClips.ownerId, ownerId)),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const clip = await loadOwned(id);
    const [genreLinks, bookLinks, caption] = await Promise.all([
      db
        .select({ genreId: schema.musicClipGenres.genreId })
        .from(schema.musicClipGenres)
        .where(eq(schema.musicClipGenres.musicClipId, id)),
      db
        .select({ bookId: schema.musicClipBooks.bookId })
        .from(schema.musicClipBooks)
        .where(eq(schema.musicClipBooks.musicClipId, id)),
      db.query.captions.findFirst({ where: eq(schema.captions.musicClipId, id) }),
    ]);
    return NextResponse.json({
      musicClip: clip,
      genreIds: genreLinks.map((l) => l.genreId),
      bookIds: bookLinks.map((l) => l.bookId),
      caption: caption ?? null,
    });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwned(id);
    const input = PatchSchema.parse(await req.json());

    if (input.name !== undefined || input.anyGenre !== undefined) {
      await db
        .update(schema.musicClips)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.anyGenre !== undefined ? { anyGenre: input.anyGenre } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.musicClips.id, id));
    }

    if (input.genreIds !== undefined) {
      await db
        .delete(schema.musicClipGenres)
        .where(eq(schema.musicClipGenres.musicClipId, id));
      if (input.genreIds.length) {
        await db
          .insert(schema.musicClipGenres)
          .values(input.genreIds.map((genreId) => ({ musicClipId: id, genreId })));
      }
    }

    if (input.bookIds !== undefined) {
      await db
        .delete(schema.musicClipBooks)
        .where(eq(schema.musicClipBooks.musicClipId, id));
      if (input.bookIds.length) {
        await db
          .insert(schema.musicClipBooks)
          .values(input.bookIds.map((bookId) => ({ musicClipId: id, bookId })));
      }
    }

    const fresh = await loadOwned(id);
    return NextResponse.json({ musicClip: fresh });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const clip = await loadOwned(id);
    await db.delete(schema.musicClips).where(eq(schema.musicClips.id, id));
    await delBlob(clip.blobPathname).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
