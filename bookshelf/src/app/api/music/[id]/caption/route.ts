import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const WordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

const PatchSchema = z.object({
  fullText: z.string().optional(),
  words: z.array(WordSchema).optional(),
  reviewed: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();

    const clip = await db.query.musicClips.findFirst({
      where: and(eq(schema.musicClips.id, id), eq(schema.musicClips.ownerId, ownerId)),
    });
    await assertOwns(clip ?? null);

    const input = PatchSchema.parse(await req.json());

    const existing = await db.query.captions.findFirst({
      where: eq(schema.captions.musicClipId, id),
    });

    if (!existing) {
      const [created] = await db
        .insert(schema.captions)
        .values({
          musicClipId: id,
          fullText: input.fullText ?? '',
          words: input.words ?? [],
          reviewed: input.reviewed ?? false,
        })
        .returning();
      return NextResponse.json({ caption: created });
    }

    const [updated] = await db
      .update(schema.captions)
      .set({
        ...(input.fullText !== undefined ? { fullText: input.fullText } : {}),
        ...(input.words !== undefined ? { words: input.words } : {}),
        ...(input.reviewed !== undefined ? { reviewed: input.reviewed } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.captions.musicClipId, id))
      .returning();

    return NextResponse.json({ caption: updated });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
