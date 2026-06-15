'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { uploadFile, UploadResult } from '@/lib/upload';
import { UrlsPaste } from '@/components/UrlsPaste';

type GenreOption = { id: string; name: string };

export default function NewBookPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'single' | 'set'>('single');
  const [genreId, setGenreId] = useState<string>('');
  const [accessoriesText, setAccessoriesText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pastedImages, setPastedImages] = useState<UploadResult[]>([]);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/genres')
      .then((r) => r.json())
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setUploading(true);
    try {
      const combined: UploadResult[] = [...pastedImages];
      if (files.length) {
        const uploaded = await Promise.all(
          files.map((f) => uploadFile(f, 'library/books')),
        );
        combined.push(...uploaded);
      }
      const images: (UploadResult & { kind: 'cover' | 'angle' | 'photo' })[] =
        combined.map((u, i) => ({
          ...u,
          kind: i === 0 ? ('cover' as const) : ('angle' as const),
        }));
      const accessories = accessoriesText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          kind,
          genreId: genreId || null,
          accessories,
          images,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const { book } = await res.json();
      router.push(`/library/books/${book.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">New book</h1>
      <form onSubmit={submit} className="mt-6 max-w-2xl space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <p className="text-xs text-stone-500">
            For a set, use the series name (e.g. "The Crimson Trilogy").
          </p>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <fieldset className="block">
          <legend className="text-sm font-medium">Type</legend>
          <p className="text-xs text-stone-500">
            A set renders all covers from the reference photo together.
          </p>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="single"
                checked={kind === 'single'}
                onChange={() => setKind('single')}
              />
              Single book
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="set"
                checked={kind === 'set'}
                onChange={() => setKind('set')}
              />
              Set (trilogy, duet, etc.)
            </label>
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium">Genre</span>
          <select
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          >
            <option value="">No genre yet</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Accessories</span>
          <p className="text-xs text-stone-500">
            Specific items the AI must include in every render of this book. One per
            line or comma-separated. Paste a list.
          </p>
          <textarea
            value={accessoriesText}
            onChange={(e) => setAccessoriesText(e.target.value)}
            rows={4}
            placeholder={'tarantula\nantique key\npressed violet'}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <div>
          <span className="text-sm font-medium">Images</span>
          <p className="text-xs text-stone-500">
            The first image is treated as the cover; the rest are angle shots. Used as
            visual reference so the real book appears in every render.
          </p>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
            className="mt-2 block w-full text-sm"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-stone-600">{files.length} file(s) ready</p>
          )}
          <div className="mt-3">
            <UrlsPaste
              category="library/books"
              onUploaded={(u) => setPastedImages((prev) => [...prev, ...u])}
            />
            {pastedImages.length > 0 && (
              <p className="mt-1 text-xs text-stone-600">
                {pastedImages.length} URL(s) fetched and ready
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Create book'}
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
