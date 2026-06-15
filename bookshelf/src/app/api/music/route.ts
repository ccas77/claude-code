import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
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
  bookIds: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db
      .select()
      .from(schema.musicClips)
      .where(eq(schema.musicClips.ownerId, ownerId))
      .orderBy(desc(schema.musicClips.updatedAt));

    const ids = rows.map((r) => r.id);
    const [genreLinks, bookLinks] = ids.length
      ? await Promise.all([
          db
            .select({
              musicClipId: schema.musicClipGenres.musicClipId,
              genreId: schema.musicClipGenres.genreId,
            })
            .from(schema.musicClipGenres)
            .where(inArray(schema.musicClipGenres.musicClipId, ids)),
          db
            .select({
              musicClipId: schema.musicClipBooks.musicClipId,
              bookId: schema.musicClipBooks.bookId,
            })
            .from(schema.musicClipBooks)
            .where(inArray(schema.musicClipBooks.musicClipId, ids)),
        ])
      : [[], []];
    const genresByClip = new Map<string, string[]>();
    for (const l of genreLinks) {
      const arr = genresByClip.get(l.musicClipId) ?? [];
      arr.push(l.genreId);
      genresByClip.set(l.musicClipId, arr);
    }
    const booksByClip = new Map<string, string[]>();
    for (const l of bookLinks) {
      const arr = booksByClip.get(l.musicClipId) ?? [];
      arr.push(l.bookId);
      booksByClip.set(l.musicClipId, arr);
    }
    const musicClips = rows.map((r) => ({
      ...r,
      genreIds: genresByClip.get(r.id) ?? [],
      bookIds: booksByClip.get(r.id) ?? [],
    }));
    return NextResponse.json({ musicClips });
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

    if (input.bookIds?.length) {
      await db.insert(schema.musicClipBooks).values(
        input.bookIds.map((bookId) => ({
          musicClipId: created.id,
          bookId,
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
