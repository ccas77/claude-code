import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, mapError } from '@/lib/ownership';
import { requestAdvance } from '@/lib/workers/registry';
import { logEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

/**
 * Per-scene regenerate: clear this scene's image (and clip, and the final
 * video), then let the orchestrator rebuild only what's missing. Everything
 * else stays cached — the row-is-state version of the prototype's
 * delete-the-file-and-rerun flow.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  try {
    const { id, sceneId } = await params;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, id) });
    await assertOwns(story);
    const scene = await db.query.scenes.findFirst({
      where: and(eq(schema.scenes.id, sceneId), eq(schema.scenes.storyId, id)),
    });
    if (!scene) return NextResponse.json({ error: 'no such scene' }, { status: 404 });

    await db
      .update(schema.scenes)
      .set({
        imageUrl: null,
        imagePathname: null,
        clipUrl: null,
        clipPathname: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.scenes.id, sceneId));
    await db
      .update(schema.stories)
      .set({
        videoBlobUrl: null,
        videoBlobPathname: null,
        videoDurationSeconds: null,
        status: 'generating',
        errorInfo: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.stories.id, id));
    await requestAdvance(id);
    await logEvent({
      ownerId: story!.ownerId,
      storyId: id,
      stage: 'regenerate',
      message: `scene ${scene.idx + 1}: regeneration requested`,
    });
    return NextResponse.json({ started: true }, { status: 202 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
