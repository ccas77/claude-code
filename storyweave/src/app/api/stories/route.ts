import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db/client';
import { getOwnerId, mapError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  premise: z.string().min(10).max(4000),
  style: z
    .string()
    .min(1)
    .max(500)
    .default('storybook watercolor illustration, soft painterly edges, cinematic lighting'),
  targetMinutes: z.coerce.number().min(0.5).max(20).default(3),
  characters: z
    .array(
      z.object({
        slug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9_-]{0,40}$/, 'slug: lowercase letters, digits, - or _'),
        description: z.string().min(10).max(1000),
      }),
    )
    .min(1)
    .max(6),
});

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await db.query.stories.findMany({
      where: eq(schema.stories.ownerId, ownerId),
      orderBy: desc(schema.stories.createdAt),
    });
    return NextResponse.json({ stories: rows });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const input = CreateSchema.parse(await req.json());
    const [story] = await db
      .insert(schema.stories)
      .values({
        ownerId,
        title: input.title,
        premise: input.premise,
        style: input.style,
        targetMinutes: input.targetMinutes,
      })
      .returning();
    await db.insert(schema.characters).values(
      input.characters.map((c) => ({
        storyId: story.id,
        slug: c.slug,
        description: c.description,
      })),
    );
    return NextResponse.json({ story }, { status: 201 });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
