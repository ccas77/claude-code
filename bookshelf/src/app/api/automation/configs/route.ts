import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const PLATFORMS = [
  'tiktok', 'instagram', 'youtube', 'x', 'linkedin',
  'facebook', 'pinterest', 'threads', 'bluesky',
] as const;

const CreateSchema = z.object({
  platform: z.enum(PLATFORMS),
  postBridgeAccountId: z.number().int(),
  username: z.string().min(1).max(120),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const configs = await db
      .select()
      .from(schema.automationConfigs)
      .where(eq(schema.automationConfigs.ownerId, ownerId));

    // Attach selection counts and names
    const enriched = await Promise.all(
      configs.map(async (c) => {
        const [books, music] = await Promise.all([
          db
            .select({
              id: schema.automationBookSelections.bookId,
              title: schema.books.title,
              position: schema.automationBookSelections.position,
            })
            .from(schema.automationBookSelections)
            .leftJoin(
              schema.books,
              eq(schema.books.id, schema.automationBookSelections.bookId),
            )
            .where(eq(schema.automationBookSelections.configId, c.id))
            .orderBy(schema.automationBookSelections.position),
          db
            .select({
              id: schema.automationMusicSelections.musicClipId,
              name: schema.musicClips.name,
              position: schema.automationMusicSelections.position,
            })
            .from(schema.automationMusicSelections)
            .leftJoin(
              schema.musicClips,
              eq(schema.musicClips.id, schema.automationMusicSelections.musicClipId),
            )
            .where(eq(schema.automationMusicSelections.configId, c.id))
            .orderBy(schema.automationMusicSelections.position),
        ]);
        return { ...c, books, music };
      }),
    );
    return NextResponse.json({ configs: enriched });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = CreateSchema.parse(await req.json());

    // Upsert: one config per (owner, account) combo.
    const existing = await db.query.automationConfigs.findFirst({
      where: and(
        eq(schema.automationConfigs.ownerId, ownerId),
        eq(schema.automationConfigs.postBridgeAccountId, input.postBridgeAccountId),
      ),
    });
    if (existing) {
      return NextResponse.json({ config: existing });
    }

    const [created] = await db
      .insert(schema.automationConfigs)
      .values({
        ownerId,
        platform: input.platform,
        postBridgeAccountId: input.postBridgeAccountId,
        username: input.username,
        enabled: false,
        intervals: [],
      })
      .returning();

    return NextResponse.json({ config: created }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
