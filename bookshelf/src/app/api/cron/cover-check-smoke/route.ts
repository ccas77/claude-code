import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { verifyCoverMatch } from '@/lib/render/cover-check';
const DEBUG_TOKEN = 'smoke-2026-06-26-cover-check-temp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Smoke-test the cover-check verifier without burning a real render.
 *
 * POST one of:
 *   { cardId }                          - looks up book + rejected candidates from the card's event log
 *   { bookId, candidates: string[] }    - explicit pair
 *
 * Returns one verdict per candidate so we can confirm a prompt change
 * behaves correctly against a known set.
 */

type Body = {
  cardId?: string;
  bookId?: string;
  candidates?: string[];
  kind?: 'single' | 'set';
};

export async function POST(req: NextRequest) {
  if (req.headers.get('x-debug-token') !== DEBUG_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json()) as Body;

  let bookId = body.bookId;
  let candidates = body.candidates ?? [];
  let kind: 'single' | 'set' = body.kind ?? 'single';

  if (body.cardId) {
    const card = await db.query.cards.findFirst({
      where: eq(schema.cards.id, body.cardId),
    });
    if (!card || !card.bookId) {
      return NextResponse.json({ error: 'card not found or has no book' }, { status: 404 });
    }
    bookId = card.bookId;
    const book = await db.query.books.findFirst({
      where: eq(schema.books.id, card.bookId),
    });
    kind = (book?.kind as 'single' | 'set') ?? 'single';
    const events = await db
      .select()
      .from(schema.eventLog)
      .where(
        and(
          eq(schema.eventLog.cardId, body.cardId),
          eq(schema.eventLog.stage, 'cover-check.reject'),
        ),
      )
      .orderBy(desc(schema.eventLog.createdAt))
      .limit(10);
    candidates = events
      .map((e) => (e.payload as { candidateUrl?: string } | null)?.candidateUrl)
      .filter((u): u is string => typeof u === 'string');
  }

  if (!bookId) {
    return NextResponse.json({ error: 'bookId or cardId required' }, { status: 400 });
  }
  if (!candidates.length) {
    return NextResponse.json({ error: 'no candidates to test' }, { status: 400 });
  }

  const images = await db
    .select()
    .from(schema.bookImages)
    .where(eq(schema.bookImages.bookId, bookId));
  const reference = images[0]?.blobUrl;
  if (!reference) {
    return NextResponse.json({ error: 'book has no reference cover' }, { status: 404 });
  }

  const verdicts = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const v = await verifyCoverMatch(reference, candidate, kind);
        return { candidate, ok: v.ok, reason: v.reason };
      } catch (e) {
        return {
          candidate,
          ok: null,
          reason: e instanceof Error ? e.message : 'unknown error',
        };
      }
    }),
  );
  return NextResponse.json({ reference, kind, verdicts });
}
