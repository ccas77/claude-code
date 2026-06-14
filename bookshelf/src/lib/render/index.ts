import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { assembleImagePrompt } from './prompt';
import { generateBookImage } from './image';
import { animateImage } from './animate';
import { compositeFinalVideo } from './composite';
import type { ProviderUsage } from '../db/schema';

/**
 * Render orchestrator. Given a card id, walks:
 *
 *   prompt assembly -> image gen -> img2vid -> composite -> final video
 *
 * Updates the card to 'preparing' on entry, 'ready' on success (with the
 * final video URL stored), 'failed' on any throw. Records which provider
 * was used at each step on card.providersUsed.
 *
 * DRY_RUN short-circuits the external calls and writes a placeholder
 * URL so the rest of the pipeline (scheduling, posting) can be exercised
 * without spending on AI APIs.
 */

type RunArgs = { cardId: string; jobId: string };

const PLACEHOLDER_VIDEO_URL = 'https://www.w3.org/2010/05/sintel/trailer.mp4';

export async function runRender({ cardId, jobId }: RunArgs): Promise<void> {
  const card = await db.query.cards.findFirst({ where: eq(schema.cards.id, cardId) });
  if (!card) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      cardId: null,
      stage: 'render',
      level: 'warn',
      message: `card ${cardId} not found, skipping`,
      payload: { jobId },
    });
    return;
  }

  if (!card.bookId || !card.musicClipId) {
    await fail(card, jobId, 'card missing book or music', 'permanent');
    return;
  }

  await db
    .update(schema.cards)
    .set({ status: 'preparing', updatedAt: new Date() })
    .where(eq(schema.cards.id, cardId));

  if (env().DRY_RUN) {
    const providers: ProviderUsage[] = [
      { step: 'image', provider: 'dry-run', fallback: false },
      { step: 'video', provider: 'dry-run', fallback: false },
    ];
    await db
      .update(schema.cards)
      .set({
        status: 'ready',
        videoBlobUrl: PLACEHOLDER_VIDEO_URL,
        videoBlobPathname: 'placeholder',
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, cardId));
    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'render.dry_run',
      level: 'info',
      message: '[dry-run] render skipped, placeholder video saved',
      payload: { jobId },
    });
    return;
  }

  const providers: ProviderUsage[] = [];

  try {
    const book = await db.query.books.findFirst({
      where: eq(schema.books.id, card.bookId),
    });
    if (!book) throw new Error('book vanished mid-render');

    const genre = book.genreId
      ? await db.query.genres.findFirst({ where: eq(schema.genres.id, book.genreId) })
      : null;

    const bookImages = await db
      .select()
      .from(schema.bookImages)
      .where(eq(schema.bookImages.bookId, book.id));
    if (bookImages.length === 0) {
      throw new Error('book has no images for visual reference');
    }

    const music = await db.query.musicClips.findFirst({
      where: eq(schema.musicClips.id, card.musicClipId),
    });
    if (!music) throw new Error('music clip vanished mid-render');

    const caption = await db.query.captions.findFirst({
      where: eq(schema.captions.musicClipId, music.id),
    });

    // 1. Prompt
    const prompt = assembleImagePrompt({
      bookTitle: book.title,
      accessories: book.accessories ?? [],
      styleRecipe: genre?.styleRecipe ?? null,
      variationSeed: cardId.slice(0, 8),
    });

    // 2. Image gen with fallback chain
    const imageChain = [env().IMAGE_PROVIDER_PRIMARY, env().IMAGE_PROVIDER_FALLBACK]
      .filter(Boolean) as string[];
    let image: Awaited<ReturnType<typeof generateBookImage>> | null = null;
    let imageErr: unknown = null;
    for (let i = 0; i < imageChain.length; i++) {
      try {
        image = await generateBookImage({
          prompt,
          referenceImageUrls: bookImages.map((b) => b.blobUrl),
          ownerId: card.ownerId,
          provider: imageChain[i],
        });
        if (i > 0) image.fallback = true;
        imageErr = null;
        break;
      } catch (e) {
        imageErr = e;
        if (classifyError(e) === 'permanent') break;
      }
    }
    if (!image) throw imageErr instanceof Error ? imageErr : new Error('image generation failed');
    providers.push({ step: 'image', provider: image.provider, fallback: image.fallback });

    // 3. Animate
    const animated = await animateImage({
      imageUrl: image.url,
      ownerId: card.ownerId,
    });
    providers.push({ step: 'video', provider: animated.provider, fallback: animated.fallback });

    // 4. Composite (audio + captions)
    const finalVideo = await compositeFinalVideo({
      silentVideoUrl: animated.url,
      audioUrl: music.blobUrl,
      captionWords: caption?.words ?? [],
      ownerId: card.ownerId,
    });

    await db
      .update(schema.cards)
      .set({
        status: 'ready',
        videoBlobUrl: finalVideo.url,
        videoBlobPathname: finalVideo.pathname,
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, cardId));

    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'render.success',
      level: 'info',
      message: `card rendered, video ready`,
      payload: { jobId, providers },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await fail(card, jobId, message, classifyError(err));
    throw err;
  }
}

function classifyError(err: unknown): 'temporary' | 'resource' | 'permanent' {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('rate') || msg.includes('429') || msg.includes('credit') || msg.includes('quota')) {
    return 'resource';
  }
  if (msg.includes('timeout') || msg.includes('5')) return 'temporary';
  return 'permanent';
}

async function fail(
  card: typeof schema.cards.$inferSelect,
  jobId: string,
  message: string,
  kind: 'temporary' | 'resource' | 'permanent',
): Promise<void> {
  await db
    .update(schema.cards)
    .set({
      status: 'failed',
      errorInfo: {
        stage: 'render',
        message,
        kind,
        attempts: 1,
        lastAttemptAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.cards.id, card.id));

  await db.insert(schema.eventLog).values({
    ownerId: card.ownerId,
    cardId: card.id,
    stage: 'render.error',
    level: 'error',
    message,
    payload: { jobId, kind },
  });
}
