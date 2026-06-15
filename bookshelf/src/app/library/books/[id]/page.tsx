'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { uploadFile, UploadResult } from '@/lib/upload';
import { UnsavedBar } from '@/components/UnsavedBar';
import { UrlsPaste } from '@/components/UrlsPaste';

type Book = {
  id: string;
  title: string;
  kind: 'single' | 'set';
  genreId: string | null;
  accessories: string[];
};

type BookImage = {
  id: string;
  blobUrl: string;
  blobPathname: string;
  kind: string;
};

type GenreOption = { id: string; name: string };

export default function BookEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [server, setServer] = useState<Book | null>(null);
  const [images, setImages] = useState<BookImage[]>([]);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftKind, setDraftKind] = useState<'single' | 'set'>('single');
  const [draftGenreId, setDraftGenreId] = useState('');
  const [draftAccessoriesText, setDraftAccessoriesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [bookRes, genreRes] = await Promise.all([
      fetch(`/api/books/${id}`),
      fetch('/api/genres'),
    ]);
    if (!bookRes.ok) {
      setError('Failed to load');
      return;
    }
    const data = await bookRes.json();
    setServer(data.book);
    setImages(data.images);
    setDraftTitle(data.book.title);
    setDraftKind(data.book.kind ?? 'single');
    setDraftGenreId(data.book.genreId ?? '');
    setDraftAccessoriesText((data.book.accessories ?? []).join('\n'));
    if (genreRes.ok) {
      const g = await genreRes.json();
      setGenres(g.genres ?? []);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const accessoriesDraftList = draftAccessoriesText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const dirty =
    server !== null &&
    (draftTitle !== server.title ||
      draftKind !== (server.kind ?? 'single') ||
      draftGenreId !== (server.genreId ?? '') ||
      accessoriesDraftList.join('|') !== (server.accessories ?? []).join('|'));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          kind: draftKind,
          genreId: draftGenreId || null,
          accessories: accessoriesDraftList,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (!server) return;
    setDraftTitle(server.title);
    setDraftKind(server.kind ?? 'single');
    setDraftGenreId(server.genreId ?? '');
    setDraftAccessoriesText((server.accessories ?? []).join('\n'));
  };

  const attachImages = async (uploaded: UploadResult[]) => {
    if (!uploaded.length) return;
    const res = await fetch(`/api/books/${id}/images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        images: uploaded.map((u) => ({ ...u, kind: 'angle' as const })),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
    await load();
  };

  const addImages = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await Promise.all(
        Array.from(list).map((f) => uploadFile(f, 'library/books')),
      );
      await attachImages(uploaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (imageId: string) => {
    const res = await fetch(`/api/books/${id}/images/${imageId}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const deleteBook = async () => {
    if (!confirm(`Delete book "${server?.title}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/books/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/books');
    else setDeleting(false);
  };

  if (!server) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{server.title}</h1>
        <button
          type="button"
          onClick={deleteBook}
          disabled={deleting}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Title</span>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <fieldset className="block">
          <legend className="text-sm font-medium">Type</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="single"
                checked={draftKind === 'single'}
                onChange={() => setDraftKind('single')}
              />
              Single book
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="set"
                checked={draftKind === 'set'}
                onChange={() => setDraftKind('set')}
              />
              Set (trilogy, duet, etc.)
            </label>
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-medium">Genre</span>
          <select
            value={draftGenreId}
            onChange={(e) => setDraftGenreId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          >
            <option value="">No genre</option>
            {genres.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Accessories</span>
          <p className="text-xs text-stone-500">
            One per line or comma-separated. These appear in every render of this book.
          </p>
          <textarea
            value={draftAccessoriesText}
            onChange={(e) => setDraftAccessoriesText(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Images ({images.length})</span>
          <label className="cursor-pointer rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">
            {uploading ? 'Uploading...' : 'Add files'}
            <input
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => addImages(e.target.files)}
              disabled={uploading}
            />
          </label>
        </div>
        <div className="mt-3">
          <UrlsPaste
            category="library/books"
            onUploaded={async (u) => {
              try {
                await attachImages(u);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </div>
        {images.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {images.map((img) => (
              <li key={img.id} className="group relative">
                <Image
                  src={img.blobUrl}
                  alt=""
                  width={300}
                  height={300}
                  unoptimized
                  className="aspect-square w-full rounded-md object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-stone-700">
                  {img.kind}
                </span>
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute right-1 top-1 hidden rounded bg-white/90 px-2 py-0.5 text-xs text-red-700 group-hover:block"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <UnsavedBar visible={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}
