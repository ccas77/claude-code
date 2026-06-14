import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const AddSchema = z.object({
  images: z
    .array(
      z.object({
        url: z.string().url(),
        pathname: z.string().min(1),
        kind: z.enum(['cover', 'angle', 'photo']).default('cover'),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const book = await db.query.books.findFirst({
      where: and(eq(schema.books.id, id), eq(schema.books.ownerId, ownerId)),
    });
    await assertOwns(book ?? null);

    const input = AddSchema.parse(await req.json());
    const inserted = await db
      .insert(schema.bookImages)
      .values(
        input.images.map((img) => ({
          bookId: id,
          blobUrl: img.url,
          blobPathname: img.pathname,
          kind: img.kind,
        })),
      )
      .returning();

    return NextResponse.json({ images: inserted }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
