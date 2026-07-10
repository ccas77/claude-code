import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, mapError } from '@/lib/ownership';
import { requestAdvance } from '@/lib/workers/registry';
import { logEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

/**
 * Kick off (or resume) generation. The advance orchestrator inspects what
 * already exists and enqueues only the missing work, so pressing the button
 * again after a failure resumes instead of starting over.
 *
 * { force: true } wipes the scenes and video and regenerates from scratch.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await db.query.stories.findFirst({ where: eq(schema.stories.id, id) });
    await assertOwns(story);

    const body = await req.json().catch(() => ({}));
    if (body?.force === true) {
      await db.delete(schema.scenes).where(eq(schema.scenes.storyId, id));
      await db
        .update(schema.characters)
        .set({ referenceImages: [] })
        .where(eq(schema.characters.storyId, id));
      await db
        .update(schema.stories)
        .set({ videoBlobUrl: null, videoBlobPathname: null, videoDurationSeconds: null })
        .where(eq(schema.stories.id, id));
    }

    await db
      .update(schema.stories)
      .set({ status: 'scripting', errorInfo: null, updatedAt: new Date() })
      .where(eq(schema.stories.id, id));
    await requestAdvance(id);
    await logEvent({
      ownerId: story!.ownerId,
      storyId: id,
      stage: 'generate',
      message: body?.force ? 'full regeneration requested' : 'generation requested',
    });
    return NextResponse.json({ started: true }, { status: 202 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
