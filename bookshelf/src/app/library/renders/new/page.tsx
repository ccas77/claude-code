'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type BookOption = {
  id: string;
  title: string;
  genreId: string | null;
};

type MusicOption = {
  id: string;
  name: string;
  anyGenre: boolean;
  genreIds: string[];
  bookIds: string[];
};

export default function NewRenderPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookOption[]>([]);
  const [music, setMusic] = useState<MusicOption[]>([]);
  const [bookId, setBookId] = useState('');
  const [musicId, setMusicId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/books').then((r) => r.json()),
      fetch('/api/music').then((r) => r.json()),
    ])
      .then(([b, m]) => {
        setBooks(
          (b.books ?? []).map((x: BookOption) => ({
            id: x.id,
            title: x.title,
            genreId: x.genreId ?? null,
          })),
        );
        setMusic(
          (m.musicClips ?? []).map((x: MusicOption) => ({
            id: x.id,
            name: x.name,
            anyGenre: x.anyGenre,
            genreIds: x.genreIds ?? [],
            bookIds: x.bookIds ?? [],
          })),
        );
      })
      .catch(() => {});
  }, []);

  const book = useMemo(() => books.find((b) => b.id === bookId) ?? null, [books, bookId]);

  // Partition the eligible clips into the same three priority buckets the
  // auto-scheduler uses: book-specific > genre-matching > free-for-all.
  const buckets = useMemo(() => {
    if (!book) {
      return { bookSpecific: [], genreMatch: [], freeForAll: [] };
    }
    const bookSpecific: MusicOption[] = [];
    const genreMatch: MusicOption[] = [];
    const freeForAll: MusicOption[] = [];
    for (const m of music) {
      if (m.bookIds.includes(book.id)) {
        bookSpecific.push(m);
        continue;
      }
      if (book.genreId && m.genreIds.includes(book.genreId)) {
        genreMatch.push(m);
        continue;
      }
      if (m.anyGenre) {
        freeForAll.push(m);
        continue;
      }
    }
    const byName = (a: MusicOption, b: MusicOption) =>
      a.name.localeCompare(b.name);
    bookSpecific.sort(byName);
    genreMatch.sort(byName);
    freeForAll.sort(byName);
    return { bookSpecific, genreMatch, freeForAll };
  }, [book, music]);

  const totalEligible =
    buckets.bookSpecific.length +
    buckets.genreMatch.length +
    buckets.freeForAll.length;

  // Clear the music selection if the chosen clip is no longer eligible after
  // changing books.
  useEffect(() => {
    if (!musicId) return;
    const allEligible = [
      ...buckets.bookSpecific,
      ...buckets.genreMatch,
      ...buckets.freeForAll,
    ];
    if (!allEligible.some((m) => m.id === musicId)) {
      setMusicId('');
    }
  }, [bookId, buckets, musicId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/renders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, musicClipId: musicId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const { card } = await res.json();
      router.push(`/library/renders/${card.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Test render</h1>
      <p className="mt-2 text-sm text-stone-600">
        Pick a book and an audio clip eligible for it. The clip list filters to
        match what the auto-scheduler would pick: clips pinned to this book,
        clips tagged with its genre, or clips marked free-for-all.
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
          {!book ? (
            <p className="mt-1 text-xs text-stone-500">
              Pick a book first; the clip list will narrow to what's eligible.
            </p>
          ) : totalEligible === 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              No eligible clips for this book. Either pin some clips to it
              (Music &gt; pick a clip &gt; Specific books), tag clips with its
              genre, or mark a clip Free for all.
            </p>
          ) : (
            <select
              value={musicId}
              onChange={(e) => setMusicId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            >
              <option value="">Choose a clip</option>
              {buckets.bookSpecific.length > 0 && (
                <optgroup label={`Pinned to this book (${buckets.bookSpecific.length})`}>
                  {buckets.bookSpecific.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {buckets.genreMatch.length > 0 && (
                <optgroup label={`This book's genre (${buckets.genreMatch.length})`}>
                  {buckets.genreMatch.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {buckets.freeForAll.length > 0 && (
                <optgroup label={`Free for all (${buckets.freeForAll.length})`}>
                  {buckets.freeForAll.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={!bookId || !musicId || submitting}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {submitting ? 'Starting...' : 'Start render'}
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
