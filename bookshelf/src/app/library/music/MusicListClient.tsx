'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Clip = {
  id: string;
  name: string;
  anyGenre: boolean;
  shared: boolean;
  transcriptionStatus: string;
};

type Genre = { id: string; name: string };
type Book = { id: string; title: string };

type Mode = 'free' | 'genres' | 'books';
type SortKey = 'updated' | 'name-asc' | 'name-desc' | 'status';
type StatusFilter = 'all' | 'done' | 'pending' | 'processing' | 'failed';
type ShareFilter = 'all' | 'shared' | 'private';
type RestrictionFilter = 'all' | 'free' | 'genres' | 'books';

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

  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [shareFilter, setShareFilter] = useState<ShareFilter>('all');
  const [restrictionFilter, setRestrictionFilter] = useState<RestrictionFilter>('all');

  const visibleClips = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = clips.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'all' && c.transcriptionStatus !== statusFilter) return false;
      if (shareFilter === 'shared' && !c.shared) return false;
      if (shareFilter === 'private' && c.shared) return false;
      if (restrictionFilter === 'free' && !c.anyGenre) return false;
      // genres / books restriction filters need link data we don't have on
      // this row - server would need to send genreCount/bookCount for that.
      return true;
    });
    const sorted = [...filtered];
    switch (sortKey) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'status':
        sorted.sort((a, b) =>
          a.transcriptionStatus.localeCompare(b.transcriptionStatus) ||
          a.name.localeCompare(b.name),
        );
        break;
      case 'updated':
      default:
        // Server already returned by updatedAt desc; preserve that order.
        break;
    }
    return sorted;
  }, [clips, query, statusFilter, shareFilter, restrictionFilter, sortKey]);

  // Inline create state
  const [creatingGenre, setCreatingGenre] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');
  const [creatingBook, setCreatingBook] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState('');
  const [newBookGenreId, setNewBookGenreId] = useState('');

  const allChecked =
    visibleClips.length > 0 &&
    visibleClips.every((c) => selected.has(c.id));
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
    setSelected(allChecked ? new Set() : new Set(visibleClips.map((c) => c.id)));
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

  const bulkShare = async (shared: boolean) => {
    if (selected.size === 0) return;
    setError(null);
    setWorking(true);
    try {
      const res = await fetch('/api/music/bulk-share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), shared }),
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

  const bulkTranscribe = async () => {
    if (selected.size === 0) return;
    setError(null);
    setWorking(true);
    try {
      const res = await fetch('/api/music/bulk-transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
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
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-stone-200 bg-white p-3 text-sm">
            <input
              type="search"
              placeholder="Search by name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-[160px] flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
            />
            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-stone-500">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1"
              >
                <option value="all">All</option>
                <option value="done">Done</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-stone-500">Share</span>
              <select
                value={shareFilter}
                onChange={(e) => setShareFilter(e.target.value as ShareFilter)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1"
              >
                <option value="all">All</option>
                <option value="shared">Shared only</option>
                <option value="private">Private only</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-stone-500">Restriction</span>
              <select
                value={restrictionFilter}
                onChange={(e) => setRestrictionFilter(e.target.value as RestrictionFilter)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1"
              >
                <option value="all">All</option>
                <option value="free">Free for all</option>
              </select>
            </label>
            <label className="ml-auto inline-flex items-center gap-1.5 text-xs">
              <span className="text-stone-500">Sort</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1"
              >
                <option value="updated">Recently updated</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="status">Captions status</option>
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
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
                : `${visibleClips.length} of ${clips.length} clip${clips.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <ul className="divide-y divide-stone-200">
            {visibleClips.map((m) => (
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
                    {m.shared && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        shared
                      </span>
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
        </>
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

            <div className="flex items-center gap-2 flex-wrap border-t border-stone-100 pt-3">
              <span className="text-xs uppercase tracking-wide text-stone-500">
                Also
              </span>
              <button
                type="button"
                onClick={() => bulkShare(true)}
                disabled={working}
                className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
              >
                Share {selected.size}
              </button>
              <button
                type="button"
                onClick={() => bulkShare(false)}
                disabled={working}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Unshare {selected.size}
              </button>
              <button
                type="button"
                onClick={bulkTranscribe}
                disabled={working}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
              >
                Re-transcribe {selected.size}
              </button>
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
