import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const card = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
    });
    await assertOwns(card ?? null);
    return NextResponse.json({ card });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const card = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
    });
    await assertOwns(card ?? null);
    await db.delete(schema.cards).where(eq(schema.cards.id, id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
