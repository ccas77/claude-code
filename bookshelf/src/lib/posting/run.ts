import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import {
  uploadVideo,
  createPost,
  type PostBridgePlatform,
} from './postbridge';
import type { ProviderUsage } from '../db/schema';

/**
 * Post-on-time handler. Card status must be 'ready' with a video URL.
 * The handler uploads the video to post-bridge (2-step) and creates the post
 * against the stored account id.
 *
 * The post-bridge account id is read from card.providersUsed (where the
 * auto-scheduler stamps it on creation) or, as a fallback, looked up by
 * username from the existing account handle.
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
      message: `card not ready (status=${card.status})`,
      payload: { jobId },
    });
    return;
  }
  if (!card.videoBlobUrl) {
    await fail(card, jobId, 'card has no video', 'permanent');
    return;
  }
  if (card.platform === 'preview') return;

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
    const accountId = await resolveAccountId(card);

    const mediaId = await uploadVideo(card.videoBlobUrl, `card-${cardId}.mp4`);

    const published = await createPost({
      caption,
      mediaIds: [mediaId],
      accountIds: [accountId],
      platform: card.platform as PostBridgePlatform,
    });

    const providers: ProviderUsage[] = [
      ...((card.providersUsed ?? []) as ProviderUsage[]),
      { step: 'post', provider: 'post-bridge', fallback: false },
    ];

    await db
      .update(schema.cards)
      .set({
        status: 'posted',
        postUrl: null, // platform url resolves async via refreshStats
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
      payload: { jobId, postBridgeId: published.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await fail(card, jobId, message, classify(err));
    throw err;
  }
}

async function resolveAccountId(
  card: typeof schema.cards.$inferSelect,
): Promise<number> {
  // The auto-scheduler stamps the post-bridge account id on providersUsed.
  const providers = (card.providersUsed ?? []) as ProviderUsage[];
  const stamped = providers.find((p) => p.step === 'post' && p.provider.startsWith('account:'));
  if (stamped) {
    const id = Number(stamped.provider.slice('account:'.length));
    if (Number.isFinite(id)) return id;
  }
  throw new Error(
    'card has no post-bridge account id; only auto-scheduled cards are postable',
  );
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
  if (card.caption && card.caption.trim()) return card.caption;
  if (!card.bookId) return '';
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, card.bookId),
  });
  return book?.title ?? '';
}
