import { NextRequest, NextResponse } from 'next/server';
import { verifyCoverMatch } from '@/lib/render/cover-check';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Smoke-test the cover-check verifier. POST a reference URL plus a list
 * of candidate URLs; get back one verdict per candidate. Used to confirm
 * a prompt change behaves correctly against a known-labelled set without
 * burning image-gen credits on a fresh render.
 */

type Body = {
  reference: string;
  candidates: string[];
  kind?: 'single' | 'set';
};

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json()) as Body;
  if (!body.reference || !Array.isArray(body.candidates) || !body.candidates.length) {
    return NextResponse.json({ error: 'reference and candidates required' }, { status: 400 });
  }
  const verdicts = await Promise.all(
    body.candidates.map(async (candidate) => {
      try {
        const verdict = await verifyCoverMatch(
          body.reference,
          candidate,
          body.kind ?? 'single',
        );
        return { candidate, ok: verdict.ok, reason: verdict.reason };
      } catch (e) {
        return {
          candidate,
          ok: null,
          reason: e instanceof Error ? e.message : 'unknown error',
        };
      }
    }),
  );
  return NextResponse.json({ verdicts });
}
