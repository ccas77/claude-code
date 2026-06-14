import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { enqueue, JOB_NAMES } from '../queue';
import { sendFailureEmail } from '../notify/email';

/**
 * Retry-failures handler. Walks failed cards and:
 *
 * - if errorInfo.kind is 'temporary' and attempts < MAX_ATTEMPTS,
 *   reset to scheduled so the prepare-ahead clock picks it up again.
 * - if attempts >= MAX_ATTEMPTS or kind is 'permanent', send the user a
 *   failure email (resource failures get one notification per card so she
 *   isn't spammed).
 *
 * Triggered on the upkeep clock (hourly).
 */

const MAX_ATTEMPTS = 3;

export async function runRetryFailures({ jobId }: { jobId: string }): Promise<void> {
  const failed = await db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.status, 'failed'))
    .limit(200);

  let retried = 0;
  let notified = 0;

  for (const card of failed) {
    const info = card.errorInfo;
    if (!info) continue;
    const attempts = info.attempts ?? 0;

    if (info.kind === 'temporary' && attempts < MAX_ATTEMPTS && card.postTime > new Date()) {
      await db
        .update(schema.cards)
        .set({ status: 'scheduled', updatedAt: new Date() })
        .where(eq(schema.cards.id, card.id));
      await enqueue(
        JOB_NAMES.RENDER_CARD,
        { cardId: card.id },
        { singletonKey: `render:${card.id}` },
      );
      retried++;
      continue;
    }

    // Permanent, resource, or out of attempts: notify if we haven't already
    const alreadyNotified = await db.query.eventLog.findFirst({
      where: and(
        eq(schema.eventLog.cardId, card.id),
        eq(schema.eventLog.stage, 'notify.sent'),
      ),
    });
    if (alreadyNotified) continue;

    const result = await sendFailureEmail({
      subject: `Bookshelf: card failed (${info.stage}: ${info.kind})`,
      text: `A scheduled post failed and won't recover on its own.

Card: ${card.id}
Platform: ${card.platform} / ${card.accountHandle}
Post time: ${card.postTime.toISOString()}
Stage: ${info.stage}
Kind: ${info.kind}
Message: ${info.message}

Review at /board.`,
    });

    await db.insert(schema.eventLog).values({
      ownerId: card.ownerId,
      cardId: card.id,
      stage: 'notify.sent',
      level: result.sent ? 'info' : 'warn',
      message: result.sent ? 'failure email sent' : `failure email skipped: ${result.reason}`,
      payload: { jobId },
    });
    if (result.sent) notified++;
  }

  await db.insert(schema.eventLog).values({
    ownerId: null,
    cardId: null,
    stage: 'retry.summary',
    level: 'info',
    message: `retry pass: ${retried} retried, ${notified} notified`,
    payload: { jobId, retried, notified, totalFailed: failed.length },
  });
}

export async function notifyOnTerminalFailure(cardId: string): Promise<void> {
  const card = await db.query.cards.findFirst({ where: eq(schema.cards.id, cardId) });
  if (!card?.errorInfo) return;
  const info = card.errorInfo;
  if (info.kind === 'temporary' && (info.attempts ?? 0) < MAX_ATTEMPTS) return;

  const alreadyNotified = await db.query.eventLog.findFirst({
    where: and(
      eq(schema.eventLog.cardId, cardId),
      eq(schema.eventLog.stage, 'notify.sent'),
    ),
  });
  if (alreadyNotified) return;

  await sendFailureEmail({
    subject: `Bookshelf: card failed (${info.stage}: ${info.kind})`,
    text: `Card ${cardId} failed at ${info.stage}: ${info.message}`,
  });

  await db.insert(schema.eventLog).values({
    ownerId: card.ownerId,
    cardId,
    stage: 'notify.sent',
    level: 'info',
    message: 'failure email sent (immediate)',
    payload: { kind: info.kind },
  });
}

