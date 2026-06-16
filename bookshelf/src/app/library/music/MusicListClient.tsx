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

export function MusicListClient({
  clips,
  genres,
}: {
  clips: Clip[];
  genres: Genre[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anyGenre, setAnyGenre] = useState(false);
  const [pickedGenres, setPickedGenres] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const apply = async () => {
    if (selected.size === 0) return;
    if (!anyGenre && pickedGenres.size === 0) {
      setError('Pick at least one genre, or enable "Any genre".');
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
          anyGenre,
          genreIds: anyGenre ? [] : Array.from(pickedGenres),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSelected(new Set());
      setPickedGenres(new Set());
      setAnyGenre(false);
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
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-3">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={anyGenre}
                onChange={(e) => setAnyGenre(e.target.checked)}
              />
              Any genre
            </label>

            {!anyGenre && (
              <div className="flex flex-wrap gap-2">
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
                  <span className="text-xs text-stone-500">No genres defined yet.</span>
                )}
              </div>
            )}

            {error && (
              <span className="text-xs text-red-700">{error}</span>
            )}

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setPickedGenres(new Set());
                  setAnyGenre(false);
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
