'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type BookRow = {
  id: string;
  title: string;
  kind: 'single' | 'set';
  genreId: string | null;
  accessories: string[];
  description: string;
  reviewDump: string;
  tropes: string[];
  vibeNotes: string;
  hashtags: string[];
};

type Genre = { id: string; name: string };

type Draft = {
  title: string;
  kind: 'single' | 'set';
  genreId: string;
  accessoriesText: string;
  description: string;
  reviewDump: string;
  tropesText: string;
  vibeNotes: string;
  hashtagsText: string;
};

function listToText(arr: string[]): string {
  return arr.join('\n');
}

function textToList(s: string): string[] {
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function hashtagText(s: string): string[] {
  return s.split(/[\n,\s]+/).map((x) => x.trim().replace(/^#+/, '')).filter(Boolean);
}

function bookToDraft(b: BookRow): Draft {
  return {
    title: b.title,
    kind: b.kind,
    genreId: b.genreId ?? '',
    accessoriesText: listToText(b.accessories),
    description: b.description,
    reviewDump: b.reviewDump,
    tropesText: listToText(b.tropes),
    vibeNotes: b.vibeNotes,
    hashtagsText: listToText(b.hashtags),
  };
}

function isDirty(b: BookRow, d: Draft): boolean {
  if (d.title !== b.title) return true;
  if (d.kind !== b.kind) return true;
  if ((d.genreId || null) !== b.genreId) return true;
  if (textToList(d.accessoriesText).join('|') !== b.accessories.join('|')) return true;
  if (d.description !== b.description) return true;
  if (d.reviewDump !== b.reviewDump) return true;
  if (textToList(d.tropesText).join('|') !== b.tropes.join('|')) return true;
  if (d.vibeNotes !== b.vibeNotes) return true;
  if (hashtagText(d.hashtagsText).join('|') !== b.hashtags.join('|')) return true;
  return false;
}

function isComplete(b: BookRow): boolean {
  return Boolean(b.description && b.description.trim());
}

export function EditAllClient({
  books,
  genres,
}: {
  books: BookRow[];
  genres: Genre[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(books.map((b) => [b.id, bookToDraft(b)])),
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const dirtyIds = useMemo(
    () => books.filter((b) => isDirty(b, drafts[b.id])).map((b) => b.id),
    [books, drafts],
  );

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const toggleOpen = (id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAll = () => setOpen(new Set(books.map((b) => b.id)));
  const closeAll = () => setOpen(new Set());
  const openDirty = () => setOpen(new Set(dirtyIds));

  const saveAll = async () => {
    setSaving(true);
    setErrors({});
    const localErrors: Record<string, string> = {};

    await Promise.all(
      dirtyIds.map(async (id) => {
        const d = drafts[id];
        try {
          const res = await fetch(`/api/books/${id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: d.title,
              kind: d.kind,
              genreId: d.genreId || null,
              accessories: textToList(d.accessoriesText),
              description: d.description.trim() ? d.description : null,
              reviewDump: d.reviewDump.trim() ? d.reviewDump : null,
              tropes: textToList(d.tropesText),
              vibeNotes: d.vibeNotes.trim() ? d.vibeNotes : null,
              hashtags: hashtagText(d.hashtagsText),
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
        } catch (e) {
          localErrors[id] = (e as Error).message;
        }
      }),
    );

    setErrors(localErrors);
    setSaving(false);
    if (Object.keys(localErrors).length === 0) {
      router.refresh();
    }
  };

  const discard = () => {
    setDrafts(Object.fromEntries(books.map((b) => [b.id, bookToDraft(b)])));
    setErrors({});
  };

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit all books</h1>
          <p className="mt-1 text-sm text-stone-600">
            One page, every book. Tap a row to open its caption sources, scroll, fill,
            save the lot.
          </p>
        </div>
        <Link
          href="/library/books"
          className="text-sm text-stone-600 hover:underline"
        >
          Back to list
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={openAll}
          className="rounded-md border border-stone-300 px-2 py-1 hover:bg-stone-50"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={closeAll}
          className="rounded-md border border-stone-300 px-2 py-1 hover:bg-stone-50"
        >
          Collapse all
        </button>
        <button
          type="button"
          onClick={openDirty}
          disabled={dirtyIds.length === 0}
          className="rounded-md border border-stone-300 px-2 py-1 hover:bg-stone-50 disabled:opacity-40"
        >
          Show only unsaved ({dirtyIds.length})
        </button>
        <span className="ml-auto text-stone-500">
          {books.length} book{books.length === 1 ? '' : 's'} ·{' '}
          {books.filter((b) => isComplete(b)).length} with caption sources filled
        </span>
      </div>

      {books.length === 0 ? (
        <p className="text-sm text-stone-600">No books yet.</p>
      ) : (
        <ul className="space-y-3">
          {books.map((b) => {
            const d = drafts[b.id];
            const dirty = isDirty(b, d);
            const expanded = open.has(b.id);
            const complete = d.description && d.description.trim();
            return (
              <li
                key={b.id}
                className={`rounded-lg border bg-white ${
                  dirty
                    ? 'border-stone-400 shadow-sm'
                    : 'border-stone-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleOpen(b.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50"
                >
                  <div className="flex flex-1 items-baseline gap-2 truncate">
                    <span
                      className={`inline-block size-2 rounded-full shrink-0 ${
                        complete ? 'bg-emerald-500' : 'bg-stone-300'
                      }`}
                      aria-hidden
                      title={complete ? 'Has caption sources' : 'Empty caption sources'}
                    />
                    <span className="font-medium truncate">{d.title}</span>
                    <span className="text-xs text-stone-500 shrink-0">
                      {genres.find((g) => g.id === d.genreId)?.name ?? 'no genre'} ·{' '}
                      {d.kind === 'set' ? 'set' : 'single'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    {dirty && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                        unsaved
                      </span>
                    )}
                    <span aria-hidden>{expanded ? '−' : '+'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="space-y-4 border-t border-stone-200 px-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium">Title</span>
                        <input
                          type="text"
                          value={d.title}
                          onChange={(e) => updateDraft(b.id, { title: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium">Genre</span>
                        <select
                          value={d.genreId}
                          onChange={(e) => updateDraft(b.id, { genreId: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                        >
                          <option value="">No genre</option>
                          {genres.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="sm:col-span-2">
                        <legend className="text-xs font-medium">Type</legend>
                        <div className="mt-1 flex gap-4 text-sm">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              checked={d.kind === 'single'}
                              onChange={() => updateDraft(b.id, { kind: 'single' })}
                            />
                            Single book
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              checked={d.kind === 'set'}
                              onChange={() => updateDraft(b.id, { kind: 'set' })}
                            />
                            Set (trilogy, duet, etc.)
                          </label>
                        </div>
                      </fieldset>
                    </div>

                    <label className="block">
                      <span className="text-xs font-medium">Description / blurb</span>
                      <textarea
                        value={d.description}
                        onChange={(e) => updateDraft(b.id, { description: e.target.value })}
                        rows={4}
                        placeholder="Paste the back-of-book blurb."
                        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium">Review dump</span>
                      <textarea
                        value={d.reviewDump}
                        onChange={(e) => updateDraft(b.id, { reviewDump: e.target.value })}
                        rows={5}
                        placeholder="Paste reader reactions and review quotes."
                        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                      />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-medium">Tropes</span>
                        <textarea
                          value={d.tropesText}
                          onChange={(e) => updateDraft(b.id, { tropesText: e.target.value })}
                          rows={3}
                          placeholder={'enemies to lovers\nslow burn'}
                          className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium">Must-include hashtags</span>
                        <textarea
                          value={d.hashtagsText}
                          onChange={(e) => updateDraft(b.id, { hashtagsText: e.target.value })}
                          rows={3}
                          placeholder={'booktok\nbookrecs'}
                          className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-xs font-medium">Vibe notes</span>
                      <textarea
                        value={d.vibeNotes}
                        onChange={(e) => updateDraft(b.id, { vibeNotes: e.target.value })}
                        rows={3}
                        placeholder="Hook angles you want the AI to lean into."
                        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium">Accessories</span>
                      <textarea
                        value={d.accessoriesText}
                        onChange={(e) => updateDraft(b.id, { accessoriesText: e.target.value })}
                        rows={3}
                        placeholder={'tarantula\nantique key'}
                        className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
                      />
                    </label>

                    {errors[b.id] && (
                      <p className="text-xs text-red-700">{errors[b.id]}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dirtyIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white shadow-lg">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-sm font-medium">
              {dirtyIds.length} unsaved book{dirtyIds.length === 1 ? '' : 's'}
            </span>
            {Object.keys(errors).length > 0 && (
              <span className="text-xs text-red-700">
                {Object.keys(errors).length} failed to save
              </span>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={saving}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-40"
              >
                Discard all
              </button>
              <button
                type="button"
                onClick={saveAll}
                disabled={saving}
                className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
              >
                {saving ? 'Saving...' : `Save ${dirtyIds.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
