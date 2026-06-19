import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { assembleImagePrompt } from './prompt';
import { generateBookImage } from './image';
import { verifyCoverMatch } from './cover-check';
import { assembleVideoWithFfmpeg } from './ffmpeg';
import type { ProviderUsage } from '../db/schema';

const MAX_IMAGE_ATTEMPTS = 3;

/**
 * Render orchestrator.
 *
 *   prompt -> image gen -> ffmpeg (motion + audio + captions) -> final mp4
 *
 * Image gen runs against the configured provider (OpenAI gpt-image-1 or
 * Higgsfield when wired). The final video assembly is pure ffmpeg via
 * ffmpeg-static, running in this function. No Replicate, no per-second
 * hosted-compute fees.
 */

type RunArgs = { cardId: string; jobId: string };

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

  // Preserve any pre-existing stamps the scheduler/publish flow put on the
  // card (notably the post-bridge `account:N` entry). The renderer appends
  // its own step rows; it must not clobber what was already there.
  const priorProviders = (card.providersUsed ?? []) as ProviderUsage[];
  const providers: ProviderUsage[] = [...priorProviders];

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
      kind: book.kind ?? 'single',
      accessories: book.accessories ?? [],
      styleRecipe: genre?.styleRecipe ?? null,
      variationSeed: cardId.slice(0, 8),
    });

    // 2. Image gen with cover-match verification loop. Each attempt runs
    //    the configured image-provider chain (primary, optional fallback)
    //    then a Gemini Flash check confirms the generated image still
    //    features the actual book cover. If the check fails (hallucinated
    //    or drifted cover) we regenerate, up to MAX_IMAGE_ATTEMPTS, before
    //    failing the card. ffmpeg never runs on a rejected image.
    const coverUrl = bookImages[0].blobUrl;
    const imageChain = [env().IMAGE_PROVIDER_PRIMARY, env().IMAGE_PROVIDER_FALLBACK]
      .filter(Boolean) as string[];
    let image: Awaited<ReturnType<typeof generateBookImage>> | null = null;
    let imageErr: unknown = null;

    // Rotate through the chain across attempts so a repeated cover-check
    // rejection on the primary advances to the fallback instead of asking
    // the primary again for the same prompt.
    for (let attempt = 0; attempt < MAX_IMAGE_ATTEMPTS; attempt++) {
      const primaryIdx = Math.min(attempt, imageChain.length - 1);
      let candidate: Awaited<ReturnType<typeof generateBookImage>> | null = null;
      for (let i = primaryIdx; i < imageChain.length; i++) {
        try {
          candidate = await generateBookImage({
            prompt,
            referenceImageUrls: bookImages.map((b) => b.blobUrl),
            ownerId: card.ownerId,
            provider: imageChain[i],
          });
          if (i > 0) candidate.fallback = true;
          imageErr = null;
          break;
        } catch (e) {
          imageErr = e;
          if (classifyError(e) === 'permanent') break;
        }
      }
      if (!candidate) break;

      const check = await verifyCoverMatch(
        coverUrl,
        candidate.url,
        book.kind ?? 'single',
      ).catch(() => ({
        ok: true,
        reason: 'verifier unavailable; accepting candidate',
      }));

      if (check.ok) {
        image = candidate;
        providers.push({
          step: 'image',
          provider: candidate.provider,
          fallback: candidate.fallback || attempt > 0,
        });
        providers.push({ step: 'cover-check', provider: 'gemini-2.5-pro', fallback: false });
        break;
      }

      await db.insert(schema.eventLog).values({
        ownerId: card.ownerId,
        cardId,
        stage: 'cover-check.reject',
        level: 'warn',
        message: `attempt ${attempt + 1}/${MAX_IMAGE_ATTEMPTS} rejected: ${check.reason}`,
        payload: { jobId, attempt, candidateUrl: candidate.url },
      });
    }

    if (!image) {
      if (imageErr) throw imageErr;
      throw new Error(
        `cover verification failed after ${MAX_IMAGE_ATTEMPTS} attempts; image gen kept hallucinating`,
      );
    }

    // 3. ffmpeg assembly: still + audio + caption SRT -> finished mp4
    const final = await assembleVideoWithFfmpeg({
      imageUrl: image.url,
      audioUrl: music.blobUrl,
      captionWords: caption?.words ?? [],
      ownerId: card.ownerId,
    });
    providers.push({ step: 'video', provider: final.provider, fallback: false });

    await db
      .update(schema.cards)
      .set({
        status: 'ready',
        videoBlobUrl: final.url,
        videoBlobPathname: final.pathname,
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, cardId));

    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'render.success',
      level: 'info',
      message: 'card rendered, video ready',
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
