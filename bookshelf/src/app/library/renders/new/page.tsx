'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type BookOption = { id: string; title: string };
type MusicOption = { id: string; name: string };

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
        setBooks((b.books ?? []).map((x: { id: string; title: string }) => x));
        setMusic((m.musicClips ?? []).map((x: { id: string; name: string }) => x));
      })
      .catch(() => {});
  }, []);

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
        Pick a book and an audio clip. The full pipeline runs (prompt assembly,
        image gen, animation, composite) and a video is saved to the card. In
        DRY_RUN no external APIs are called - a placeholder video is stored
        instead so you can verify the orchestration.
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
          <select
            value={musicId}
            onChange={(e) => setMusicId(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          >
            <option value="">Choose a clip</option>
            {music.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
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
