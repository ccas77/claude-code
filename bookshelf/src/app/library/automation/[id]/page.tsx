'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { UnsavedBar } from '@/components/UnsavedBar';

type Interval = { start: string; end: string; posts: number };

type Config = {
  id: string;
  platform: string;
  username: string;
  postBridgeAccountId: number;
  enabled: boolean;
  intervals: Interval[];
  bookPointer: number;
  musicPointer: number;
  lastPostedAt: string | null;
};

type Selection = { id: string; title?: string | null; name?: string | null; position: number };

type BookOption = { id: string; title: string; genreId: string | null };
type MusicOption = { id: string; name: string; anyGenre: boolean; genreIds: string[] };
type GenreOption = { id: string; name: string };

const ANY_GENRE_KEY = '__any_genre__';
const NO_GENRE_KEY = '__no_genre__';

export default function AutomationConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [server, setServer] = useState<Config | null>(null);
  const [serverBookIds, setServerBookIds] = useState<string[]>([]);
  const [serverMusicIds, setServerMusicIds] = useState<string[]>([]);

  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftIntervals, setDraftIntervals] = useState<Interval[]>([]);
  const [draftBookIds, setDraftBookIds] = useState<string[]>([]);
  const [draftMusicIds, setDraftMusicIds] = useState<string[]>([]);

  const [allBooks, setAllBooks] = useState<BookOption[]>([]);
  const [allMusic, setAllMusic] = useState<MusicOption[]>([]);
  const [allGenres, setAllGenres] = useState<GenreOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [cfgRes, booksRes, musicRes, genresRes] = await Promise.all([
      fetch(`/api/automation/configs/${id}`),
      fetch('/api/books'),
      fetch('/api/music'),
      fetch('/api/genres'),
    ]);
    if (!cfgRes.ok) {
      setError('Failed to load');
      return;
    }
    const d = await cfgRes.json();
    setServer(d.config);
    const bookIds = (d.books ?? []).map((b: Selection) => b.id);
    const musicIds = (d.music ?? []).map((m: Selection) => m.id);
    setServerBookIds(bookIds);
    setServerMusicIds(musicIds);

    setDraftEnabled(d.config.enabled);
    setDraftIntervals(d.config.intervals);
    setDraftBookIds(bookIds);
    setDraftMusicIds(musicIds);

    if (booksRes.ok) {
      const b = await booksRes.json();
      setAllBooks(b.books ?? []);
    }
    if (musicRes.ok) {
      const m = await musicRes.json();
      setAllMusic(m.musicClips ?? []);
    }
    if (genresRes.ok) {
      const g = await genresRes.json();
      setAllGenres(g.genres ?? []);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => {
    if (!server) return false;
    if (draftEnabled !== server.enabled) return true;
    if (JSON.stringify(draftIntervals) !== JSON.stringify(server.intervals)) return true;
    if (draftBookIds.join('|') !== serverBookIds.join('|')) return true;
    if (draftMusicIds.join('|') !== serverMusicIds.join('|')) return true;
    return false;
  }, [server, draftEnabled, draftIntervals, draftBookIds, draftMusicIds, serverBookIds, serverMusicIds]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/automation/configs/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: draftEnabled,
          intervals: draftIntervals,
          bookIds: draftBookIds,
          musicClipIds: draftMusicIds,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!server) return;
    setDraftEnabled(server.enabled);
    setDraftIntervals(server.intervals);
    setDraftBookIds(serverBookIds);
    setDraftMusicIds(serverMusicIds);
  };

  const remove = async () => {
    if (!confirm(`Delete automation for @${server?.username}? This stops auto-posting to that account.`)) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/automation/configs/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/automation');
    else setDeleting(false);
  };

  const addInterval = () =>
    setDraftIntervals([...draftIntervals, { start: '18:00', end: '23:00', posts: 1 }]);
  const updateInterval = (idx: number, patch: Partial<Interval>) =>
    setDraftIntervals(draftIntervals.map((iv, i) => (i === idx ? { ...iv, ...patch } : iv)));
  const removeInterval = (idx: number) =>
    setDraftIntervals(draftIntervals.filter((_, i) => i !== idx));

  if (!server) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            @{server.username}
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            {server.platform} &middot; post-bridge id {server.postBridgeAccountId} &middot;
            {server.lastPostedAt
              ? ` last posted ${new Date(server.lastPostedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`
              : ' never posted'}
          </p>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <section>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Automation enabled</span>
            <span className="block text-xs text-stone-500">
              When on, the cron auto-creates and posts cards during the time windows
              below.
            </span>
          </span>
        </label>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Posting windows (London time)</h2>
          <button
            type="button"
            onClick={addInterval}
            className="rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
          >
            Add window
          </button>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Each window posts N times spread evenly across its time range.
        </p>
        <ul className="mt-3 space-y-2">
          {draftIntervals.map((iv, idx) => (
            <li key={idx} className="flex items-center gap-2 rounded border border-stone-200 bg-white p-2">
              <input
                type="time"
                value={iv.start}
                onChange={(e) => updateInterval(idx, { start: e.target.value })}
                className="rounded border border-stone-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-stone-500">to</span>
              <input
                type="time"
                value={iv.end}
                onChange={(e) => updateInterval(idx, { end: e.target.value })}
                className="rounded border border-stone-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-stone-500">posts</span>
              <input
                type="number"
                min={1}
                max={20}
                value={iv.posts}
                onChange={(e) => updateInterval(idx, { posts: Number(e.target.value) || 1 })}
                className="w-16 rounded border border-stone-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => removeInterval(idx)}
                className="ml-auto text-xs text-red-700 hover:underline"
              >
                remove
              </button>
            </li>
          ))}
          {draftIntervals.length === 0 && (
            <li className="text-xs text-stone-500">No windows yet. Add one.</li>
          )}
        </ul>
      </section>

      <BulkPickSection
        title="Books in rotation"
        subtitle={`Cron picks the next book at the pointer position, then advances. Pointer: ${server.bookPointer % Math.max(1, draftBookIds.length)}`}
        groups={groupBooksByGenre(allBooks, allGenres)}
        selectedIds={new Set(draftBookIds)}
        onChange={(ids) => setDraftBookIds(ids)}
        emptyMessage="No books yet."
      />

      <BulkPickSection
        title="Music clips eligible for use"
        subtitle="The cron prefers clips matching the chosen book's genre, falls back to any-genre, then any."
        groups={groupMusicByGenre(allMusic, allGenres)}
        selectedIds={new Set(draftMusicIds)}
        onChange={(ids) => setDraftMusicIds(ids)}
        emptyMessage="No music clips yet."
      />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <UnsavedBar visible={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}

// ----- grouping helpers + the bulk-pick UI -----

type PickItem = { id: string; label: string; subLabel?: string };
type PickGroup = { key: string; title: string; items: PickItem[] };

function groupBooksByGenre(
  books: BookOption[],
  genres: GenreOption[],
): PickGroup[] {
  const genreNameById = new Map(genres.map((g) => [g.id, g.name]));
  const buckets = new Map<string, PickItem[]>();
  for (const b of books) {
    const key = b.genreId ?? NO_GENRE_KEY;
    const arr = buckets.get(key) ?? [];
    arr.push({ id: b.id, label: b.title });
    buckets.set(key, arr);
  }
  const groups: PickGroup[] = [];
  for (const [key, items] of buckets.entries()) {
    items.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({
      key,
      title:
        key === NO_GENRE_KEY ? 'No genre' : genreNameById.get(key) ?? 'Unknown genre',
      items,
    });
  }
  groups.sort((a, b) => {
    if (a.key === NO_GENRE_KEY) return 1;
    if (b.key === NO_GENRE_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
  return groups;
}

function groupMusicByGenre(
  clips: MusicOption[],
  genres: GenreOption[],
): PickGroup[] {
  const genreNameById = new Map(genres.map((g) => [g.id, g.name]));
  const buckets = new Map<string, PickItem[]>();
  for (const c of clips) {
    if (c.anyGenre) {
      const arr = buckets.get(ANY_GENRE_KEY) ?? [];
      arr.push({ id: c.id, label: c.name });
      buckets.set(ANY_GENRE_KEY, arr);
      continue;
    }
    if (c.genreIds.length === 0) {
      const arr = buckets.get(NO_GENRE_KEY) ?? [];
      arr.push({ id: c.id, label: c.name });
      buckets.set(NO_GENRE_KEY, arr);
      continue;
    }
    // A clip can appear under multiple genre groups it's tagged with.
    for (const gid of c.genreIds) {
      const arr = buckets.get(gid) ?? [];
      arr.push({ id: c.id, label: c.name });
      buckets.set(gid, arr);
    }
  }
  const groups: PickGroup[] = [];
  for (const [key, items] of buckets.entries()) {
    items.sort((a, b) => a.label.localeCompare(b.label));
    const title =
      key === ANY_GENRE_KEY
        ? 'Any genre'
        : key === NO_GENRE_KEY
          ? 'No genre'
          : genreNameById.get(key) ?? 'Unknown genre';
    groups.push({ key, title, items });
  }
  groups.sort((a, b) => {
    // Any-genre first, no-genre last, the rest alphabetically.
    if (a.key === ANY_GENRE_KEY) return -1;
    if (b.key === ANY_GENRE_KEY) return 1;
    if (a.key === NO_GENRE_KEY) return 1;
    if (b.key === NO_GENRE_KEY) return -1;
    return a.title.localeCompare(b.title);
  });
  return groups;
}

function BulkPickSection({
  title,
  subtitle,
  groups,
  selectedIds,
  onChange,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  groups: PickGroup[];
  selectedIds: Set<string>;
  onChange: (next: string[]) => void;
  emptyMessage: string;
}) {
  const allItemIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) for (const it of g.items) set.add(it.id);
    return Array.from(set);
  }, [groups]);

  const total = allItemIds.length;
  const selectedCount = allItemIds.filter((id) => selectedIds.has(id)).length;
  const allOn = total > 0 && selectedCount === total;

  const toggleAll = () => {
    if (allOn) onChange([]);
    else onChange(allItemIds);
  };

  const toggleGroup = (g: PickGroup) => {
    const ids = g.items.map((i) => i.id);
    const allInGroupOn = ids.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allInGroupOn) {
      for (const id of ids) next.delete(id);
    } else {
      for (const id of ids) next.add(id);
    }
    onChange(Array.from(next));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-3 text-xs text-stone-600">
          <span>
            {selectedCount} / {total} selected
          </span>
          {total > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="rounded-md border border-stone-300 px-2 py-1 hover:bg-stone-50"
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-stone-500">{subtitle}</p>

      {total === 0 ? (
        <p className="mt-3 text-xs text-stone-500">{emptyMessage}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map((g) => {
            const ids = g.items.map((i) => i.id);
            const allInGroupOn = ids.every((id) => selectedIds.has(id));
            const someInGroupOn = !allInGroupOn && ids.some((id) => selectedIds.has(id));
            return (
              <div
                key={g.key}
                className="rounded-md border border-stone-200 bg-white"
              >
                <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allInGroupOn}
                      ref={(el) => {
                        if (el) el.indeterminate = someInGroupOn;
                      }}
                      onChange={() => toggleGroup(g)}
                    />
                    {g.title}
                    <span className="text-xs text-stone-500">({g.items.length})</span>
                  </label>
                </div>
                <ul className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-2">
                  {g.items.map((it) => (
                    <li key={`${g.key}-${it.id}`}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(it.id)}
                          onChange={() => toggleOne(it.id)}
                        />
                        {it.label}
                        {it.subLabel && (
                          <span className="text-xs text-stone-500">{it.subLabel}</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
