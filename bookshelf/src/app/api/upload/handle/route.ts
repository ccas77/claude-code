import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { randomUUID } from 'node:crypto';
import { getOwnerId } from '@/lib/ownership';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Blob client-upload bridge. The browser hits this to mint a
 * single-use upload token, then PUTs the file straight to Blob. Audio
 * clips and high-res images can be many MB, so they bypass the function
 * body limit this way.
 *
 * Caller passes `pathnamePrefix` in clientPayload to choose the bucket
 * folder (genres/refs, books/images, music/audio).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const ownerId = await getOwnerId();

    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const prefix = pickPrefix(clientPayload);
        const ext = extOf(pathname);
        const key = `${prefix}/${ownerId}/${randomUUID()}${ext}`;
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ key, ownerId }),
          pathname: key,
        };
      },
      onUploadCompleted: async () => {
        // No DB write here — the caller records the blob URL when they save
        // the parent entity. Orphaned blobs are tolerable and easy to GC.
      },
    });

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/ogg',
  'audio/vorbis',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
];

function pickPrefix(payload: string | null): string {
  if (!payload) return 'library/misc';
  const allowed = new Set(['library/genres', 'library/books', 'library/music']);
  return allowed.has(payload) ? payload : 'library/misc';
}

function extOf(pathname: string): string {
  const dot = pathname.lastIndexOf('.');
  if (dot < 0) return '';
  const ext = pathname.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}
