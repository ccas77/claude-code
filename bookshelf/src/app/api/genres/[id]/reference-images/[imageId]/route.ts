import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { delBlob } from '@/lib/storage';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  try {
    const { id, imageId } = await params;
    const ownerId = await getOwnerId();
    const genre = await db.query.genres.findFirst({
      where: and(eq(schema.genres.id, id), eq(schema.genres.ownerId, ownerId)),
    });
    await assertOwns(genre ?? null);

    const ref = await db.query.genreReferenceImages.findFirst({
      where: and(
        eq(schema.genreReferenceImages.id, imageId),
        eq(schema.genreReferenceImages.genreId, id),
      ),
    });
    if (!ref) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db
      .delete(schema.genreReferenceImages)
      .where(eq(schema.genreReferenceImages.id, imageId));
    await delBlob(ref.blobPathname).catch(() => {});

    await db
      .update(schema.genres)
      .set({ recipeStatus: 'pending', updatedAt: new Date() })
      .where(eq(schema.genres.id, id));
    await enqueue(JOB_NAMES.DISTILL_RECIPE, { genreId: id });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
