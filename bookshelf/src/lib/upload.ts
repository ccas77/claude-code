'use client';

import { upload } from '@vercel/blob/client';

export type UploadResult = { url: string; pathname: string };

export async function uploadFile(
  file: File,
  category: 'library/genres' | 'library/books' | 'library/music',
): Promise<UploadResult> {
  const blob = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: '/api/upload/handle',
    clientPayload: category,
  });
  return { url: blob.url, pathname: blob.pathname };
}
