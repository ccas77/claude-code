'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Clip = {
  id: string;
  name: string;
  anyGenre: boolean;
  transcriptionStatus: string;
};

type Genre = { id: string; name: string };
type Book = { id: string; title: string };

type Mode = 'free' | 'genres' | 'books';

export function MusicListClient({
  clips,
  genres: initialGenres,
  books: initialBooks,
}: {
  clips: Clip[];
  genres: Genre[];
  books: Book[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('genres');
  const [pickedGenres, setPickedGenres] = useState<Set<string>>(new Set());
  const [pickedBooks, setPickedBooks] = useState<Set<string>>(new Set());
  const [genres, setGenres] = useState<Genre[]>(initialGenres);
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline create state
  const [creatingGenre, setCreatingGenre] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');
  const [creatingBook, setCreatingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookGenreId, setNewBookGenreId] = useState('');

  const allChecked = clips.length > 0 && selected.size === clips.length;
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
    setSelected(allChecked ? new Set() : new Set(clips.map((c) => c.id)));
  };

  const togglePickedGenre = (id: string) => {
    setPickedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePickedBook = (id: string) => {
    setPickedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancel = () => {
    setSelected(new Set());
    setPickedGenres(new Set());
    setPickedBooks(new Set());
    setMode('genres');
    setError(null);
    setCreatingGenre(false);
    setCreatingBook(false);
    setNewGenreName('');
    setNewBookTitle('');
    setNewBookGenreId('');
  };

  const addGenre = async () => {
    const name = newGenreName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch('/api/genres', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { genre: Genre };
      setGenres((prev) => {
        const next = [...prev, data.genre];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setPickedGenres((prev) => new Set([...prev, data.genre.id]));
      setNewGenreName('');
      setCreatingGenre(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const addBook = async () => {
    const title = newBookTitle.trim();
    if (!title) return;
    setError(null);
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          genreId: newBookGenreId || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { book: { id: string; title: string } };
      setBooks((prev) => {
        const next = [...prev, { id: data.book.id, title: data.book.title }];
        next.sort((a, b) => a.title.localeCompare(b.title));
        return next;
      });
      setPickedBooks((prev) => new Set([...prev, data.book.id]));
      setNewBookTitle('');
      setNewBookGenreId('');
      setCreatingBook(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const apply = async () => {
    if (selected.size === 0) return;
    if (mode === 'genres' && pickedGenres.size === 0) {
      setError('Pick at least one genre, or switch to "Free for all".');
      return;
    }
    if (mode === 'books' && pickedBooks.size === 0) {
      setError('Pick at least one book, or switch mode.');
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const res = await fetch('/api/music/bulk-genres', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selected),
          mode,
          genreIds: mode === 'genres' ? Array.from(pickedGenres) : [],
          bookIds: mode === 'books' ? Array.from(pickedBooks) : [],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      cancel();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const sortedGenres = useMemo(
    () => [...genres].sort((a, b) => a.name.localeCompare(b.name)),
    [genres],
  );
  const sortedBooks = useMemo(
    () => [...books].sort((a, b) => a.title.localeCompare(b.title)),
    [books],
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Music</h1>
        <Link
          href="/library/music/new"
          className="inline-flex items-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-base font-semibold text-white hover:bg-stone-800"
        >
          <span aria-hidden className="text-lg leading-none">+</span>
          Upload audio
        </Link>
      </div>

      {clips.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No clips yet. Upload an audio file; the spoken part will be transcribed once
          and the captions reused forever.
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
                : `${clips.length} clip${clips.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <ul className="divide-y divide-stone-200">
            {clips.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggleOne(m.id)}
                  aria-label={`Select ${m.name}`}
                />
                <Link
                  href={`/library/music/${m.id}`}
                  className="flex flex-1 items-center justify-between"
                >
                  <span className="font-medium">
                    {m.name}
                    {m.anyGenre && (
                      <span className="ml-2 text-xs text-stone-500">any genre</span>
                    )}
                  </span>
                  <span className="text-xs text-stone-500">
                    captions: {m.transcriptionStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3">
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <span className="text-stone-400">|</span>
              <span className="text-xs uppercase tracking-wide text-stone-500">
                Restrict to
              </span>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="bulk-mode"
                  checked={mode === 'free'}
                  onChange={() => setMode('free')}
                />
                Free for all
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="bulk-mode"
                  checked={mode === 'genres'}
                  onChange={() => setMode('genres')}
                />
                Specific genres
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="bulk-mode"
                  checked={mode === 'books'}
                  onChange={() => setMode('books')}
                />
                Specific books
              </label>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={working}
                  className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-40"
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

            {mode === 'genres' && (
              <div className="flex flex-wrap items-center gap-2">
                {sortedGenres.map((g) => {
                  const on = pickedGenres.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => togglePickedGenre(g.id)}
                      className={
                        on
                          ? 'rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white'
                          : 'rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-100'
                      }
                    >
                      {g.name}
                    </button>
                  );
                })}
                {sortedGenres.length === 0 && (
                  <span className="text-xs text-stone-500">No genres yet.</span>
                )}
                {!creatingGenre ? (
                  <button
                    type="button"
                    onClick={() => setCreatingGenre(true)}
                    className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-100"
                  >
                    + New genre
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs">
                    <input
                      autoFocus
                      type="text"
                      value={newGenreName}
                      onChange={(e) => setNewGenreName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addGenre();
                        }
                        if (e.key === 'Escape') {
                          setCreatingGenre(false);
                          setNewGenreName('');
                        }
                      }}
                      placeholder="Genre name"
                      className="w-32 bg-transparent px-1 outline-none"
                    />
                    <button
                      type="button"
                      onClick={addGenre}
                      className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-white"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingGenre(false);
                        setNewGenreName('');
                      }}
                      className="text-stone-500"
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}

            {mode === 'books' && (
              <div className="flex flex-wrap items-center gap-2">
                {sortedBooks.map((b) => {
                  const on = pickedBooks.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => togglePickedBook(b.id)}
                      className={
                        on
                          ? 'rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white max-w-[20rem] truncate'
                          : 'rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-100 max-w-[20rem] truncate'
                      }
                      title={b.title}
                    >
                      {b.title}
                    </button>
                  );
                })}
                {sortedBooks.length === 0 && (
                  <span className="text-xs text-stone-500">No books yet.</span>
                )}
                {!creatingBook ? (
                  <button
                    type="button"
                    onClick={() => setCreatingBook(true)}
                    className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-100"
                  >
                    + New book
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs">
                    <input
                      autoFocus
                      type="text"
                      value={newBookTitle}
                      onChange={(e) => setNewBookTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addBook();
                        }
                        if (e.key === 'Escape') {
                          setCreatingBook(false);
                          setNewBookTitle('');
                          setNewBookGenreId('');
                        }
                      }}
                      placeholder="Book title"
                      className="w-40 bg-transparent px-1 outline-none"
                    />
                    <select
                      value={newBookGenreId}
                      onChange={(e) => setNewBookGenreId(e.target.value)}
                      className="bg-transparent text-[10px] outline-none"
                    >
                      <option value="">No genre</option>
                      {sortedGenres.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addBook}
                      className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-white"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingBook(false);
                        setNewBookTitle('');
                        setNewBookGenreId('');
                      }}
                      className="text-stone-500"
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}

            {mode === 'free' && (
              <p className="text-xs text-stone-500">
                These clips will be used over books in any genre.
              </p>
            )}

            {error && <span className="text-xs text-red-700">{error}</span>}
          </div>
        </div>
      )}
    </>
  );
}
