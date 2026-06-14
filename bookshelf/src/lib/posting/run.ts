import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { publishToPlatform, type PostBridgePlatform } from './postbridge';
import type { ProviderUsage } from '../db/schema';

/**
 * Post-on-time handler. Pulls the Ready card, hands the finished video to
 * post-bridge, marks the card Posted with the live URL.
 *
 * DRY_RUN skips the API call and writes a placeholder URL so the rest of
 * the system can be exercised without spending.
 */

type RunArgs = { cardId: string; jobId: string };

export async function runPost({ cardId, jobId }: RunArgs): Promise<void> {
  const card = await db.query.cards.findFirst({ where: eq(schema.cards.id, cardId) });
  if (!card) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      cardId: null,
      stage: 'post',
      level: 'warn',
      message: `card ${cardId} not found`,
      payload: { jobId },
    });
    return;
  }

  if (card.status !== 'ready') {
    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'post.skip',
      level: 'info',
      message: `card not ready (status=${card.status}), skipping`,
      payload: { jobId },
    });
    return;
  }
  if (!card.videoBlobUrl) {
    await fail(card, jobId, 'card has no video', 'permanent');
    return;
  }
  if (card.platform === 'preview') return; // safety net

  if (env().DRY_RUN) {
    const providers: ProviderUsage[] = [
      ...((card.providersUsed ?? []) as ProviderUsage[]),
      { step: 'post', provider: 'dry-run', fallback: false },
    ];
    await db
      .update(schema.cards)
      .set({
        status: 'posted',
        postUrl: 'https://example.invalid/dry-run',
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, cardId));
    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'post.dry_run',
      level: 'info',
      message: `[dry-run] would post to ${card.platform}/${card.accountHandle}`,
      payload: { jobId },
    });
    return;
  }

  try {
    const caption = await buildCaption(card);
    const published = await publishToPlatform({
      platform: card.platform as PostBridgePlatform,
      accountHandle: card.accountHandle,
      videoUrl: card.videoBlobUrl,
      caption,
    });

    const providers: ProviderUsage[] = [
      ...((card.providersUsed ?? []) as ProviderUsage[]),
      { step: 'post', provider: 'post-bridge', fallback: false },
    ];

    await db
      .update(schema.cards)
      .set({
        status: 'posted',
        postUrl: published.url,
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, cardId));

    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId,
      stage: 'post.success',
      level: 'info',
      message: `posted to ${card.platform}/${card.accountHandle}`,
      payload: { jobId, postBridgeId: published.id, url: published.url },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await fail(card, jobId, message, classify(err));
    throw err;
  }
}

function classify(err: unknown): 'temporary' | 'resource' | 'permanent' {
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
  const prior = card.errorInfo?.attempts ?? 0;
  await db
    .update(schema.cards)
    .set({
      status: 'failed',
      errorInfo: {
        stage: 'post',
        message,
        kind,
        attempts: prior + 1,
        lastAttemptAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.cards.id, card.id));

  await db.insert(schema.eventLog).values({
    ownerId: card.ownerId,
    cardId: card.id,
    stage: 'post.error',
    level: 'error',
    message,
    payload: { jobId, kind },
  });
}

async function buildCaption(card: typeof schema.cards.$inferSelect): Promise<string> {
  if (!card.bookId) return '';
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, card.bookId),
  });
  if (!book) return '';
  // Minimal caption: book title. The user can extend per-platform later.
  return book.title;
}
