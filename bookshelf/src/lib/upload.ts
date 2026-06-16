'use client';

import { upload } from '@vercel/blob/client';

export type UploadResult = { url: string; pathname: string };

const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export async function uploadFile(
  file: File,
  category: 'library/genres' | 'library/books' | 'library/music',
): Promise<UploadResult> {
  console.log('[upload] start', { name: file.name, size: file.size, type: file.type, category });
  try {
    const blob = await withTimeout(
      upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/handle',
        clientPayload: category,
      }),
      UPLOAD_TIMEOUT_MS,
      'upload',
    );
    console.log('[upload] done', { url: blob.url, pathname: blob.pathname });
    return { url: blob.url, pathname: blob.pathname };
  } catch (err) {
    console.error('[upload] failed', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
