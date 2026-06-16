import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { delBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  kind: z.enum(['single', 'set']).optional(),
  genreId: z.string().uuid().nullable().optional(),
  accessories: z.array(z.string().min(1).max(120)).max(40).optional(),
  description: z.string().max(5000).nullable().optional(),
  reviewDump: z.string().max(20000).nullable().optional(),
  tropes: z.array(z.string().min(1).max(120)).max(40).optional(),
  vibeNotes: z.string().max(5000).nullable().optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(40).optional(),
});

async function loadOwned(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.books.findFirst({
    where: and(eq(schema.books.id, id), eq(schema.books.ownerId, ownerId)),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const book = await loadOwned(id);
    const images = await db
      .select()
      .from(schema.bookImages)
      .where(eq(schema.bookImages.bookId, id));
    return NextResponse.json({ book, images });
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

    const [updated] = await db
      .update(schema.books)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.genreId !== undefined ? { genreId: input.genreId } : {}),
        ...(input.accessories !== undefined ? { accessories: input.accessories } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.reviewDump !== undefined ? { reviewDump: input.reviewDump } : {}),
        ...(input.tropes !== undefined ? { tropes: input.tropes } : {}),
        ...(input.vibeNotes !== undefined ? { vibeNotes: input.vibeNotes } : {}),
        ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.books.id, id))
      .returning();

    return NextResponse.json({ book: updated });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwned(id);

    const images = await db
      .select()
      .from(schema.bookImages)
      .where(eq(schema.bookImages.bookId, id));

    await db.delete(schema.books).where(eq(schema.books.id, id));

    await Promise.allSettled(images.map((i) => delBlob(i.blobPathname)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
