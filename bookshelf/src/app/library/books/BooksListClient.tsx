'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Book = {
  id: string;
  title: string;
  genreName: string | null;
};

type Genre = { id: string; name: string };

export function BooksListClient({
  books,
  genres,
}: {
  books: Book[];
  genres: Genre[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedGenreId, setPickedGenreId] = useState<string>('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = books.length > 0 && selected.size === books.length;
  const someChecked = selected.size > 0 && !allChecked;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(books.map((b) => b.id)));
  };

  const apply = async () => {
    if (selected.size === 0) return;
    setError(null);
    setWorking(true);
    try {
      const res = await fetch('/api/books/bulk-genre', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selected),
          genreId: pickedGenreId === '' ? null : pickedGenreId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSelected(new Set());
      setPickedGenreId('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Books</h1>
        <Link
          href="/library/books/new"
          className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-base font-semibold text-white hover:bg-stone-800"
        >
          <span aria-hidden className="text-lg leading-none">+</span>
          New book
        </Link>
      </div>

      {books.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No books yet. Add one with its cover and any accessories specific to the
          story.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
          <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = someChecked;
              }}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${books.length} book${books.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <ul className="divide-y divide-stone-200">
            {books.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(b.id)}
                  onChange={() => toggleOne(b.id)}
                  aria-label={`Select ${b.title}`}
                />
                <Link
                  href={`/library/books/${b.id}`}
                  className="flex flex-1 items-center justify-between"
                >
                  <div>
                    <span className="font-medium">{b.title}</span>
                    {b.genreName && (
                      <span className="ml-2 text-xs text-stone-500">{b.genreName}</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>

            <label className="flex items-center gap-2 text-sm">
              Genre
              <select
                value={pickedGenreId}
                onChange={(e) => setPickedGenreId(e.target.value)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm focus:border-stone-500 focus:outline-none"
              >
                <option value="">No genre</option>
                {genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            {error && <span className="text-xs text-red-700">{error}</span>}

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setPickedGenreId('');
                  setError(null);
                }}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={working}
                className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {working ? 'Applying...' : `Apply to ${selected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
