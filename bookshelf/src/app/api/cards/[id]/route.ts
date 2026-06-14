import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  postTime: z.coerce.date().optional(),
  accountHandle: z.string().min(1).max(120).optional(),
});

async function loadOwned(id: string) {
  const ownerId = await getOwnerId();
  const row = await db.query.cards.findFirst({
    where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
  });
  await assertOwns(row ?? null);
  return row!;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const card = await loadOwned(id);
    return NextResponse.json({ card });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const card = await loadOwned(id);
    if (card.status === 'posted') {
      return NextResponse.json({ error: 'cannot edit a posted card' }, { status: 400 });
    }
    const input = PatchSchema.parse(await req.json());
    const [updated] = await db
      .update(schema.cards)
      .set({
        ...(input.postTime !== undefined ? { postTime: input.postTime } : {}),
        ...(input.accountHandle !== undefined
          ? { accountHandle: input.accountHandle }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, id))
      .returning();
    return NextResponse.json({ card: updated });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await loadOwned(id);
    await db.delete(schema.cards).where(eq(schema.cards.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
