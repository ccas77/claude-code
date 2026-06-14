'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { uploadFile } from '@/lib/upload';

type GenreOption = { id: string; name: string };

export default function NewMusicPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [anyGenre, setAnyGenre] = useState(false);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/genres')
      .then((r) => r.json())
      .then((d) => setGenres(d.genres ?? []))
      .catch(() => {});
  }, []);

  const toggleGenre = (id: string, checked: boolean) => {
    setGenreIds((prev) => (checked ? [...prev, id] : prev.filter((g) => g !== id)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Pick an audio file.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, 'library/music');
      const res = await fetch('/api/music', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name || file.name,
          url: uploaded.url,
          pathname: uploaded.pathname,
          anyGenre,
          genreIds: anyGenre ? [] : genreIds,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const { musicClip } = await res.json();
      router.push(`/library/music/${musicClip.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">New audio clip</h1>
      <form onSubmit={submit} className="mt-6 max-w-2xl space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="A short label so you can find it later"
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <div>
          <span className="text-sm font-medium">Audio file</span>
          <p className="text-xs text-stone-500">
            mp3, m4a, wav, ogg. Spoken vocals over music; only the speech becomes
            captions.
          </p>
          <input
            type="file"
            accept="audio/*"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm"
          />
        </div>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={anyGenre}
            onChange={(e) => setAnyGenre(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Any genre</span>
            <span className="block text-xs text-stone-500">
              Trending/neutral clips that work over books in any genre.
            </span>
          </span>
        </label>

        {!anyGenre && (
          <div>
            <span className="text-sm font-medium">Genres</span>
            <p className="text-xs text-stone-500">
              Pick every genre this clip suits. Books with any of these genres can use
              it.
            </p>
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={uploading || !file}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Create clip'}
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
