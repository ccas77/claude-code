import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  pathname: z.string().min(1),
  durationSeconds: z.number().int().positive().optional(),
  anyGenre: z.boolean().optional(),
  genreIds: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.musicClips)
      .where(eq(schema.musicClips.ownerId, ownerId))
      .orderBy(desc(schema.musicClips.updatedAt));
    return NextResponse.json({ musicClips: rows });
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
      .insert(schema.musicClips)
      .values({
        ownerId,
        name: input.name,
        blobUrl: input.url,
        blobPathname: input.pathname,
        durationSeconds: input.durationSeconds ?? null,
        anyGenre: input.anyGenre ?? false,
      })
      .returning();

    if (input.genreIds?.length) {
      await db.insert(schema.musicClipGenres).values(
        input.genreIds.map((genreId) => ({
          musicClipId: created.id,
          genreId,
        })),
      );
    }

    await enqueue(JOB_NAMES.TRANSCRIBE_MUSIC, { musicClipId: created.id });

    return NextResponse.json({ musicClip: created }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
