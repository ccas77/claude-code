import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { verifyCoverMatch } from '@/lib/render/cover-check';
import { cronUnauthorized } from '@/lib/clocks/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Smoke-test the cover-check verifier. POST { bookId, candidates[] };
 * the route looks up the book's reference cover URL and runs the verifier
 * against each candidate. Used to confirm a prompt change behaves
 * correctly against known-labelled images without burning a real render.
 */

type Body = { bookId: string; candidates: string[]; kind?: 'single' | 'set' };

export async function POST(req: NextRequest) {
  if (cronUnauthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json()) as Body;
  if (!body.bookId || !Array.isArray(body.candidates) || !body.candidates.length) {
    return NextResponse.json({ error: 'bookId and candidates required' }, { status: 400 });
  }
  const images = await db
    .select()
    .from(schema.bookImages)
    .where(eq(schema.bookImages.bookId, body.bookId));
  const reference = images[0]?.blobUrl;
  if (!reference) {
    return NextResponse.json({ error: 'book has no reference cover' }, { status: 404 });
  }
  const verdicts = await Promise.all(
    body.candidates.map(async (candidate) => {
      try {
        const v = await verifyCoverMatch(reference, candidate, body.kind ?? 'single');
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
  return NextResponse.json({ reference, verdicts });
}
