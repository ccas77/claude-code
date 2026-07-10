import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { readLocalBlob } from '@/lib/storage';
import { env } from '@/lib/config';

export const dynamic = 'force-dynamic';

/**
 * Serves the local-disk blob fallback (.blob-local/) in dev so image and
 * video previews work without a Vercel Blob token. When a token is set this
 * route is never used — stored urls point at real Blob hosts.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (env().BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const { path: parts } = await params;
  const pathname = parts.join('/');
  if (pathname.includes('..')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const bytes = await readLocalBlob(pathname);
    const type =
      {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
      }[path.extname(pathname)] ?? 'application/octet-stream';
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
