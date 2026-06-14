import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';
import { delBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  try {
    const { id, imageId } = await params;
    const ownerId = await getOwnerId();
    const book = await db.query.books.findFirst({
      where: and(eq(schema.books.id, id), eq(schema.books.ownerId, ownerId)),
    });
    await assertOwns(book ?? null);

    const img = await db.query.bookImages.findFirst({
      where: and(eq(schema.bookImages.id, imageId), eq(schema.bookImages.bookId, id)),
    });
    if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.delete(schema.bookImages).where(eq(schema.bookImages.id, imageId));
    await delBlob(img.blobPathname).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
