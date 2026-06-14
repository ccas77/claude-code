'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uploadFile, UploadResult } from '@/lib/upload';

export default function NewGenrePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUploading(true);
    try {
      let referenceImages: UploadResult[] = [];
      if (files.length) {
        referenceImages = await Promise.all(
          files.map((f) => uploadFile(f, 'library/genres')),
        );
      }
      const res = await fetch('/api/genres', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, referenceImages }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const { genre } = await res.json();
      router.push(`/library/genres/${genre.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">New genre</h1>
      <form onSubmit={submit} className="mt-6 max-w-2xl space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. thriller, monster romance, cozy mystery"
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <div>
          <span className="text-sm font-medium">Reference images</span>
          <p className="text-xs text-stone-500">
            Roughly 12 images that define the genre&apos;s visual language. Upload
            multiple at once.
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => onPick(e.target.files)}
            className="mt-2 block w-full text-sm"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-stone-600">{files.length} file(s) ready</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={uploading || !name}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Create genre'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
