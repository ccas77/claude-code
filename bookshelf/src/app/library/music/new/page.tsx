'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/upload';

type GenreOption = { id: string; name: string };
type BookOption = { id: string; title: string };
type BatchResult = { ok: number; failed: { name: string; error: string }[] };

function deriveName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export default function NewMusicPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<'free' | 'genres' | 'books'>('free');
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [books, setBooks] = useState<BookOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchResult | null>(null);

  useEffect(() => {
    fetch('/api/genres')
      .then((r) => r.json())
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
    fetch('/api/books')
      .then((r) => r.json())
      .then((d) =>
        setBooks(
          (d.books ?? []).map((b: { id: string; title: string }) => ({
            id: b.id,
            title: b.title,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  const toggleGenre = (id: string, checked: boolean) => {
    setGenreIds((prev) => (checked ? [...prev, id] : prev.filter((g) => g !== id)));
  };

  const toggleBook = (id: string, checked: boolean) => {
    setBookIds((prev) => (checked ? [...prev, id] : prev.filter((b) => b !== id)));
  };

  const resetForm = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setProgress(null);
    setError(null);
  };

  const onPickFiles = (list: FileList | null) => {
    setFiles(list ? Array.from(list) : []);
    setBatch(null);
    setError(null);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setProgress(null);
    setBatch(null);
    if (files.length === 0) {
      setError('Pick at least one audio file.');
      return;
    }

    setUploading(true);
    const result: BatchResult = { ok: 0, failed: [] };

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const sizeMb = Math.round((f.size / 1024 / 1024) * 10) / 10;
        setProgress(`Uploading ${i + 1}/${files.length}: ${f.name} (${sizeMb} MB)...`);
        try {
          const uploaded = await uploadFile(f, 'library/music');
          const name = deriveName(f.name);
          const res = await fetch('/api/music', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name,
              url: uploaded.url,
              pathname: uploaded.pathname,
              anyGenre: mode === 'free',
              genreIds: mode === 'genres' ? genreIds : [],
              bookIds: mode === 'books' ? bookIds : [],
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `POST /api/music ${res.status}`);
          }
          result.ok++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[music/new] file failed', f.name, err);
          result.failed.push({ name: f.name, error: msg });
        }
      }
      setBatch(result);
      if (result.failed.length === 0) {
        resetForm();
      } else {
        setFiles((prev) => prev.filter((f) => result.failed.find((x) => x.name === f.name)));
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Upload audio</h1>
        <Link
          href="/library/music"
          className="text-sm text-stone-600 hover:underline"
        >
          All clips
        </Link>
      </div>

      {batch && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            batch.failed.length === 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="font-medium">
            Uploaded {batch.ok}.
            {batch.failed.length > 0 && ` ${batch.failed.length} failed:`}
          </div>
          {batch.failed.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {batch.failed.map((f, i) => (
                <li key={i}>
                  <span className="font-mono">{f.name}</span>: {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 max-w-2xl space-y-5">
        <div>
          <span className="text-sm font-medium">Audio files</span>
          <p className="text-xs text-stone-500">
            Pick one or many at once. mp3, m4a, wav, ogg. The filename becomes the
            clip name (you can rename later); the spoken part is transcribed once.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => onPickFiles(e.target.files)}
            className="sr-only"
            id="audio-files-input"
          />
          <label
            htmlFor="audio-files-input"
            className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-dashed border-stone-400 bg-white px-4 py-3 text-sm font-medium text-stone-800 hover:border-stone-500 hover:bg-stone-50"
          >
            <span aria-hidden className="text-lg leading-none">+</span>
            {files.length === 0 ? 'Choose audio files (one or many)' : 'Add more files'}
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md border border-stone-200 bg-white p-2 text-xs">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-stone-500">
                    {Math.round((f.size / 1024 / 1024) * 10) / 10} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-1 text-stone-500 hover:text-red-700"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Applies to {files.length > 1 ? `all ${files.length} clips in this batch` : 'this clip'}
          </p>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium">Restrict to</legend>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4 text-sm">
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="restrict-mode"
                  checked={mode === 'free'}
                  onChange={() => setMode('free')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Free for all</span>
                  <span className="block text-xs text-stone-500">
                    Used over any book in any genre.
                  </span>
                </span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="restrict-mode"
                  checked={mode === 'genres'}
                  onChange={() => setMode('genres')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Specific genres</span>
                  <span className="block text-xs text-stone-500">
                    Only used for books in the genres you pick.
                  </span>
                </span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="restrict-mode"
                  checked={mode === 'books'}
                  onChange={() => setMode('books')}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Specific books</span>
                  <span className="block text-xs text-stone-500">
                    Only used for the exact books you pick.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {mode === 'genres' && (
            <div className="mt-4">
              <span className="text-sm font-medium">Pick genres</span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {genres.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={genreIds.includes(g.id)}
                      onChange={(e) => toggleGenre(g.id, e.target.checked)}
                    />
                    {g.name}
                  </label>
                ))}
                {genres.length === 0 && (
                  <p className="text-xs text-stone-500">
                    No genres yet. Add some under Genres first.
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === 'books' && (
            <div className="mt-4">
              <span className="text-sm font-medium">Pick books</span>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {books.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bookIds.includes(b.id)}
                      onChange={(e) => toggleBook(b.id, e.target.checked)}
                    />
                    <span className="truncate">{b.title}</span>
                  </label>
                ))}
                {books.length === 0 && (
                  <p className="text-xs text-stone-500">No books yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {progress && <p className="text-sm text-stone-600">{progress}</p>}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={uploading || files.length === 0}
            className="rounded-md bg-stone-900 px-6 py-3 text-base font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {uploading
              ? 'Uploading...'
              : files.length > 1
                ? `Upload all (${files.length})`
                : files.length === 1
                  ? 'Upload'
                  : 'Pick files first'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/library/music')}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
          >
            Done
          </button>
        </div>
      </form>
    </div>
  );
}
