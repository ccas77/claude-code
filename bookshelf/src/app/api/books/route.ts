import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const ImageInput = z.object({
  url: z.string().url(),
  pathname: z.string().min(1),
  kind: z.enum(['cover', 'angle', 'photo']).default('cover'),
});

const CreateSchema = z.object({
  title: z.string().min(1).max(280),
  genreId: z.string().uuid().nullable().optional(),
  accessories: z.array(z.string().min(1).max(120)).max(40).optional(),
  images: z.array(ImageInput).optional(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.books)
      .where(eq(schema.books.ownerId, ownerId))
      .orderBy(desc(schema.books.updatedAt));
    return NextResponse.json({ books: rows });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = CreateSchema.parse(await req.json());

    const [created] = await db
      .insert(schema.books)
      .values({
        ownerId,
        title: input.title,
        genreId: input.genreId ?? null,
        accessories: input.accessories ?? [],
      })
      .returning();

    if (input.images?.length) {
      await db.insert(schema.bookImages).values(
        input.images.map((img) => ({
          bookId: created.id,
          blobUrl: img.url,
          blobPathname: img.pathname,
          kind: img.kind,
        })),
      );
    }

    return NextResponse.json({ book: created }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
