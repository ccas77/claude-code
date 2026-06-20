import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const IntervalSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  posts: z.number().int().min(1).max(20),
});

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  intervals: z.array(IntervalSchema).max(10).optional(),
  bookIds: z.array(z.string().uuid()).optional(),
  dailyRenderCap: z.number().int().min(1).max(200).optional(),
});

async function loadOwned(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.automationConfigs.findFirst({
    where: and(
      eq(schema.automationConfigs.id, id),
      eq(schema.automationConfigs.ownerId, ownerId),
    ),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const config = await loadOwned(id);
    const books = await db
      .select({
        id: schema.automationBookSelections.bookId,
        title: schema.books.title,
        position: schema.automationBookSelections.position,
      })
      .from(schema.automationBookSelections)
      .leftJoin(schema.books, eq(schema.books.id, schema.automationBookSelections.bookId))
      .where(eq(schema.automationBookSelections.configId, id))
      .orderBy(schema.automationBookSelections.position);
    return NextResponse.json({ config, books });
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

    if (
      input.enabled !== undefined ||
      input.intervals !== undefined ||
      input.dailyRenderCap !== undefined
    ) {
      await db
        .update(schema.automationConfigs)
        .set({
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          ...(input.intervals !== undefined ? { intervals: input.intervals } : {}),
          ...(input.dailyRenderCap !== undefined
            ? { dailyRenderCap: input.dailyRenderCap }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.automationConfigs.id, id));
    }

    if (input.bookIds !== undefined) {
      await db
        .delete(schema.automationBookSelections)
        .where(eq(schema.automationBookSelections.configId, id));
      if (input.bookIds.length) {
        await db.insert(schema.automationBookSelections).values(
          input.bookIds.map((bookId, position) => ({
            configId: id,
            bookId,
            position,
          })),
        );
      }
    }

    const fresh = await loadOwned(id);
    return NextResponse.json({ config: fresh });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwned(id);
    await db.delete(schema.automationConfigs).where(eq(schema.automationConfigs.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
