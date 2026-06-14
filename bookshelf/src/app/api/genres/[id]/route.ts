import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { delBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  styleRecipe: z.string().nullable().optional(),
});

async function loadOwned(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.genres.findFirst({
    where: and(eq(schema.genres.id, id), eq(schema.genres.ownerId, ownerId)),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const genre = await loadOwned(id);
    const refs = await db
      .select()
      .from(schema.genreReferenceImages)
      .where(eq(schema.genreReferenceImages.genreId, id));
    return NextResponse.json({ genre, referenceImages: refs });
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
      .update(schema.genres)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.styleRecipe !== undefined ? { styleRecipe: input.styleRecipe } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.genres.id, id))
      .returning();

    return NextResponse.json({ genre: updated });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwned(id);

    const refs = await db
      .select()
      .from(schema.genreReferenceImages)
      .where(eq(schema.genreReferenceImages.genreId, id));

    await db.delete(schema.genres).where(eq(schema.genres.id, id));

    await Promise.allSettled(refs.map((r) => delBlob(r.blobPathname)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
