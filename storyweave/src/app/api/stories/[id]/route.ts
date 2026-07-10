import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, id) });
    await assertOwns(story);
    const [characters, scenes, events] = await Promise.all([
      db.query.characters.findMany({ where: eq(schema.characters.storyId, id) }),
      db.query.scenes.findMany({
        where: eq(schema.scenes.storyId, id),
        orderBy: asc(schema.scenes.idx),
      }),
      db.query.eventLog.findMany({
        where: eq(schema.eventLog.storyId, id),
        orderBy: desc(schema.eventLog.createdAt),
        limit: 20,
      }),
    ]);
    return NextResponse.json({ story, characters, scenes, events });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, id) });
    await assertOwns(story);
    // Characters, scenes cascade; blobs are left to GC (tolerable orphans,
    // same call bookshelf makes for upload leftovers).
    await db.delete(schema.stories).where(eq(schema.stories.id, id));
    return NextResponse.json({ deleted: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
