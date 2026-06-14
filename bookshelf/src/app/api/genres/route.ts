import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  styleRecipe: z.string().optional(),
  referenceImages: z
    .array(z.object({ url: z.string().url(), pathname: z.string().min(1) }))
    .optional(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.genres)
      .where(eq(schema.genres.ownerId, ownerId))
      .orderBy(desc(schema.genres.updatedAt));
    return NextResponse.json({ genres: rows });
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
      .insert(schema.genres)
      .values({
        ownerId,
        name: input.name,
        styleRecipe: input.styleRecipe ?? null,
      })
      .returning();

    if (input.referenceImages?.length) {
      await db.insert(schema.genreReferenceImages).values(
        input.referenceImages.map((img) => ({
          genreId: created.id,
          blobUrl: img.url,
          blobPathname: img.pathname,
        })),
      );
      await enqueue(JOB_NAMES.DISTILL_RECIPE, { genreId: created.id });
    }

    return NextResponse.json({ genre: created }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
