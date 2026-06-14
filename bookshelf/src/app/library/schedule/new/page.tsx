'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Book = { id: string; title: string; genreId: string | null };
type Music = { id: string; name: string; anyGenre: boolean };

const PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'x',
  'linkedin',
  'facebook',
  'pinterest',
  'threads',
  'bluesky',
] as const;

export default function NewSchedulePage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [music, setMusic] = useState<Music[]>([]);
  const [musicGenres, setMusicGenres] = useState<Record<string, string[]>>({});
  const [bookId, setBookId] = useState('');
  const [musicId, setMusicId] = useState('');
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>('tiktok');
  const [accountHandle, setAccountHandle] = useState('');
  const [postTime, setPostTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/books').then((r) => r.json()),
      fetch('/api/music').then((r) => r.json()),
    ])
      .then(async ([b, m]) => {
        setBooks(b.books ?? []);
        setMusic(m.musicClips ?? []);
        // Fetch each clip's genre list so we can match
        const detail = await Promise.all(
          (m.musicClips ?? []).map((clip: Music) =>
            fetch(`/api/music/${clip.id}`).then((r) => r.json()),
          ),
        );
        const map: Record<string, string[]> = {};
        for (const d of detail) {
          map[d.musicClip.id] = d.genreIds ?? [];
        }
        setMusicGenres(map);
      })
      .catch(() => {});
  }, []);

  const book = books.find((b) => b.id === bookId);

  const musicSorted = useMemo(() => {
    if (!book?.genreId) return music;
    const match = (m: Music) =>
      m.anyGenre || (musicGenres[m.id] ?? []).includes(book.genreId!);
    return [...music].sort((a, b) => Number(match(b)) - Number(match(a)));
  }, [book, music, musicGenres]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bookId,
          musicClipId: musicId,
          platform,
          accountHandle,
          postTime: new Date(postTime).toISOString(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      router.push('/library/schedule');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Schedule a post</h1>
      <p className="mt-2 text-sm text-stone-600">
        The render pipeline will start preparing this video automatically once
        the post time falls inside the lead-time window. By default that&apos;s
        3 hours before post time; tune with LEAD_TIME_HOURS.
      </p>

      <form onSubmit={submit} className="mt-6 max-w-xl space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Book</span>
          <select
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          >
            <option value="">Choose a book</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Audio clip</span>
          {book?.genreId && (
            <p className="text-xs text-stone-500">
              Genre-matching clips are listed first; any-genre clips follow.
            </p>
          )}
          <select
            value={musicId}
            onChange={(e) => setMusicId(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          >
            <option value="">Choose a clip</option>
            {musicSorted.map((m) => {
              const match =
                !!book?.genreId &&
                (m.anyGenre || (musicGenres[m.id] ?? []).includes(book.genreId));
              return (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {match ? ' · match' : ''}
                  {m.anyGenre ? ' (any)' : ''}
                </option>
              );
            })}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Platform</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Account handle</span>
            <input
              type="text"
              value={accountHandle}
              onChange={(e) => setAccountHandle(e.target.value)}
              required
              placeholder="@yourhandle"
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Post time</span>
          <input
            type="datetime-local"
            value={postTime}
            onChange={(e) => setPostTime(e.target.value)}
            required
            className="mt-1 block rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting || !bookId || !musicId || !accountHandle || !postTime}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {submitting ? 'Scheduling...' : 'Schedule'}
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
