import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { assertOwns, getOwnerId, mapError, ForbiddenError } from '@/lib/ownership';
import { getOwnerEmail } from '@/lib/owner';
import { isPrimaryEmail } from '@/lib/owner-role';
import type { ProviderUsage } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * Promote a "preview" render to a real, postable card. The user picks a
 * Post Bridge account, a caption, and either "post now" or a scheduled time.
 * The card.platform flips from "preview" to the actual platform; the account
 * id is stamped on providersUsed for runPost to resolve.
 */
const PublishSchema = z.object({
  accountId: z.number().int().positive(),
  platform: z.string().min(1),
  accountHandle: z.string().min(1),
  caption: z.string().max(4000),
  postAt: z.string().datetime().optional(), // ISO; omit for "now"
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ownerId = await getOwnerId();
    const card = await db.query.cards.findFirst({
      where: and(eq(schema.cards.id, id), eq(schema.cards.ownerId, ownerId)),
    });
    await assertOwns(card ?? null);
    if (card!.status !== 'ready' || !card!.videoBlobUrl) {
      return NextResponse.json(
        { error: 'render is not ready yet' },
        { status: 409 },
      );
    }

    const input = PublishSchema.parse(await req.json());
    const postTime = input.postAt ? new Date(input.postAt) : new Date();

    // Account assignment guard: friends can only publish to accounts the
    // primary owner has explicitly assigned to them. The primary owner has
    // unrestricted access to her own Post Bridge accounts.
    const ownerEmail = await getOwnerEmail(card!.ownerId);
    if (!isPrimaryEmail(ownerEmail)) {
      const allowed = await db
        .select({ id: schema.userAccountAssignments.postBridgeAccountId })
        .from(schema.userAccountAssignments)
        .where(eq(schema.userAccountAssignments.ownerId, card!.ownerId));
      const allowedSet = new Set(allowed.map((r) => r.id));
      if (!allowedSet.has(input.accountId)) {
        throw new ForbiddenError('That account is not assigned to you.');
      }
    }

    // Stamp account id on providersUsed (drop any prior post-account stamp).
    const priorProviders = (card!.providersUsed ?? []) as ProviderUsage[];
    const providers: ProviderUsage[] = [
      ...priorProviders.filter(
        (p) => !(p.step === 'post' && p.provider.startsWith('account:')),
      ),
      {
        step: 'post',
        provider: `account:${input.accountId}`,
        fallback: false,
      },
    ];

    const [updated] = await db
      .update(schema.cards)
      .set({
        platform: input.platform,
        accountHandle: input.accountHandle,
        caption: input.caption,
        postTime,
        providersUsed: providers,
        updatedAt: new Date(),
      })
      .where(eq(schema.cards.id, id))
      .returning();

    await db.insert(schema.eventLog).values({
      ownerId,
      cardId: id,
      stage: 'publish.manual',
      level: 'info',
      message: `manual publish queued for ${input.platform}/${input.accountHandle}`,
      payload: {
        accountId: input.accountId,
        postTime: postTime.toISOString(),
      },
    });

    return NextResponse.json({ card: updated });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
