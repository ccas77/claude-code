import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getOwnerId, mapError } from '@/lib/ownership';
import { putBlob } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  urls: z.array(z.string()).min(1).max(50),
  category: z.enum(['library/genres', 'library/books']),
});

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 25 * 1024 * 1024;

type Result =
  | { ok: true; originalUrl: string; url: string; pathname: string }
  | { ok: false; originalUrl: string; error: string };

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ownerId = await getOwnerId();
    const { urls, category } = Body.parse(await req.json());

    const results: Result[] = await Promise.all(
      urls.map(async (raw): Promise<Result> => {
        const originalUrl = raw.trim();
        if (!originalUrl) return { ok: false, originalUrl, error: 'empty' };
        if (!isHttpUrl(originalUrl)) {
          return { ok: false, originalUrl, error: 'not a valid http(s) URL' };
        }
        try {
          const res = await fetch(originalUrl);
          if (!res.ok) {
            return { ok: false, originalUrl, error: `fetch failed (${res.status})` };
          }
          const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
          if (!ALLOWED.has(ct)) {
            return { ok: false, originalUrl, error: `not an image (got ${ct || 'unknown'})` };
          }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.byteLength > MAX_BYTES) {
            return { ok: false, originalUrl, error: `too large (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)` };
          }
          const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : ct === 'image/gif' ? 'gif' : 'jpg';
          const pathname = `${category}/${ownerId}/${randomUUID()}.${ext}`;
          const stored = await putBlob(pathname, buf);
          return { ok: true, originalUrl, url: stored.url, pathname: stored.pathname };
        } catch (e) {
          return { ok: false, originalUrl, error: (e as Error).message };
        }
      }),
    );

    return NextResponse.json({
      uploaded: results.filter((r): r is Extract<Result, { ok: true }> => r.ok),
      failed: results.filter((r): r is Extract<Result, { ok: false }> => !r.ok),
    });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
