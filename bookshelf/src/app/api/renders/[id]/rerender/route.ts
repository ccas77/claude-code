import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError, ForbiddenError } from '@/lib/ownership';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import type { ProviderUsage } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Re-render a card from scratch. Keeps the same book + music + caption +
 * platform + account + postTime, but drops the video URL and stamped
 * render-step providers so a fresh image + caption riff + ffmpeg pass runs.
 * Refuses to re-render a card that has already posted: the live post on
 * Facebook/TikTok/etc is unchanged, so producing a fresh video at that point
 * would only mislead the operator and risk a double-post if the post cron
 * re-fires.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const card = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
    });
    await assertOwns(card ?? null);
    if (card!.status === 'posted') {
      throw new ForbiddenError(
        "Already posted - re-rendering won't update the live post.",
      );
    }

    // Race guard: refuse if the linked music clip is still in the middle of
    // a transcription. Without this, hitting Re-render right after kicking
    // off a re-transcribe runs the render against the OLD captions and the
    // burned-in subtitles end up wrong (or empty, if the non-vocal filter
    // strips the placeholder tokens).
    if (card!.musicClipId) {
      const clip = await db.query.musicClips.findFirst({
        where: eq(schema.musicClips.id, card!.musicClipId),
      });
      if (
        clip &&
        (clip.transcriptionStatus === 'pending' ||
          clip.transcriptionStatus === 'processing')
      ) {
        throw new ForbiddenError(
          `Music clip is still being transcribed (status: ${clip.transcriptionStatus}). Wait for it to finish, then re-render.`,
        );
      }
    }

    // Preserve only stamps the scheduler/publish flow put on the card (the
    // post-bridge account assignment). Drop the render-step rows so the new
    // run's image/cover-check/video stamps land cleanly.
    const prior = (card!.providersUsed ?? []) as ProviderUsage[];
    const preserved = prior.filter(
      (p) => p.step === 'post' && p.provider.startsWith('account:'),
    );

    await db
      .update(schema.cards)
      .set({
        status: 'scheduled',
        videoBlobUrl: null,
        videoBlobPathname: null,
        errorInfo: null,
        providersUsed: preserved,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, id));

    const jobId = await enqueue(
      JOB_NAMES.RENDER_CARD,
      { cardId: id },
      { singletonKey: `render:${id}:${Date.now()}` },
    );

    await db.insert(schema.eventLog).values({
      ownerId,
      cardId: id,
      stage: 'render.rerun',
      level: 'info',
      message: 'manual re-render requested',
      payload: { jobId },
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
