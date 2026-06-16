import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/ownership';
import { assembleVideoWithFfmpeg } from '@/lib/render/ffmpeg';
import { CAPTION_EFFECTS, type CaptionEffect } from '@/lib/render/ass';
import type { ProviderUsage } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * One-shot bypass: render a card directly from a pre-supplied image URL
 * (e.g. one I generated through the Higgsfield MCP from a Claude session).
 * Skips image gen; runs ffmpeg synchronously and writes the card to ready.
 *
 * Auth via CRON_SECRET so this isn't a public surface.
 */

const Body = z.object({
  bookId: z.string().uuid(),
  musicClipId: z.string().uuid(),
  imageUrl: z.string().url(),
  imageProvider: z.string().default('higgsfield/nano-banana (mcp)'),
  effect: z.enum(CAPTION_EFFECTS as [CaptionEffect, ...CaptionEffect[]]).default('fade-drift'),
});

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const ownerId = await getOwnerId();
    const input = Body.parse(await req.json());

    const [book, music] = await Promise.all([
      db.query.books.findFirst({
        where: and(eq(schema.books.id, input.bookId), eq(schema.books.ownerId, ownerId)),
      }),
      db.query.musicClips.findFirst({
        where: and(
          eq(schema.musicClips.id, input.musicClipId),
          eq(schema.musicClips.ownerId, ownerId),
        ),
      }),
    ]);
    if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 });
    if (!music) return NextResponse.json({ error: 'music not found' }, { status: 404 });

    const caption = await db.query.captions.findFirst({
      where: eq(schema.captions.musicClipId, music.id),
    });

    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const [card] = await db
      .insert(schema.cards)
      .values({
        ownerId,
        status: 'preparing',
        postTime: farFuture,
        platform: 'preview',
        accountHandle: 'preview',
        bookId: book.id,
        musicClipId: music.id,
      })
      .returning();

    const providers: ProviderUsage[] = [
      { step: 'image', provider: input.imageProvider, fallback: false },
    ];

    try {
      const final = await assembleVideoWithFfmpeg({
        imageUrl: input.imageUrl,
        audioUrl: music.blobUrl,
        captionWords: caption?.words ?? [],
        ownerId,
        effect: input.effect,
      });
      providers.push({
        step: 'video',
        provider: `${final.provider} (${input.effect})`,
        fallback: false,
      });

      await db
        .update(schema.cards)
        .set({
          status: 'ready',
          videoBlobUrl: final.url,
          videoBlobPathname: final.pathname,
          providersUsed: providers,
          updatedAt: new Date(),
        })
        .where(eq(schema.cards.id, card.id));

      const fresh = await db.query.cards.findFirst({ where: eq(schema.cards.id, card.id) });
      return NextResponse.json({ card: fresh });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await db
        .update(schema.cards)
        .set({
          status: 'failed',
          errorInfo: {
            stage: 'render.ffmpeg',
            message,
            kind: 'permanent',
            attempts: 1,
            lastAttemptAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.cards.id, card.id));
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad request' },
      { status: 400 },
    );
  }
}
