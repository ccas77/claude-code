import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const AddSchema = z.object({
  images: z
    .array(z.object({ url: z.string().url(), pathname: z.string().min(1) }))
    .min(1),
});

async function loadOwnedGenre(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.genres.findFirst({
    where: and(eq(schema.genres.id, id), eq(schema.genres.ownerId, ownerId)),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwnedGenre(id);
    const input = AddSchema.parse(await req.json());

    const inserted = await db
      .insert(schema.genreReferenceImages)
      .values(
        input.images.map((img) => ({
          genreId: id,
          blobUrl: img.url,
          blobPathname: img.pathname,
        })),
      )
      .returning();

    // Re-distill the recipe when references change
    await db
      .update(schema.genres)
      .set({ recipeStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.genres.id, id));
    await enqueue(JOB_NAMES.DISTILL_RECIPE, { genreId: id });

    return NextResponse.json({ referenceImages: inserted }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
