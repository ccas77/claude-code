'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { uploadFile, UploadResult } from '@/lib/upload';
import { UnsavedBar } from '@/components/UnsavedBar';
import { UrlsPaste } from '@/components/UrlsPaste';

type Genre = {
  id: string;
  name: string;
  styleRecipe: string | null;
  recipeStatus: string;
  defaultHashtags: string[];
};

type Ref = { id: string; blobUrl: string; blobPathname: string };

export default function GenreEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [server, setServer] = useState<Genre | null>(null);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftRecipe, setDraftRecipe] = useState('');
  const [draftHashtagsText, setDraftHashtagsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [distilling, setDistilling] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/genres/${id}`);
    if (!res.ok) {
      setError('Failed to load');
      return;
    }
    const data = await res.json();
    setServer(data.genre);
    setRefs(data.referenceImages);
    setDraftName(data.genre.name);
    setDraftRecipe(data.genre.styleRecipe ?? '');
    setDraftHashtagsText((data.genre.defaultHashtags ?? []).join('\n'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hashtagsDraftList = draftHashtagsText
    .split(/[\n,\s]+/)
    .map((s) => s.trim().replace(/^#+/, ''))
    .filter(Boolean);

  const dirty =
    server !== null &&
    (draftName !== server.name ||
      draftRecipe !== (server.styleRecipe ?? '') ||
      hashtagsDraftList.join('|') !== (server.defaultHashtags ?? []).join('|'));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/genres/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          styleRecipe: draftRecipe.trim() ? draftRecipe : null,
          defaultHashtags: hashtagsDraftList,
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
    setDraftName(server.name);
    setDraftRecipe(server.styleRecipe ?? '');
    setDraftHashtagsText((server.defaultHashtags ?? []).join('\n'));
  };

  const attachImages = async (images: UploadResult[]) => {
    if (!images.length) return;
    const res = await fetch(`/api/genres/${id}/reference-images`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ images }),
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
        Array.from(list).map((f) => uploadFile(f, 'library/genres')),
      );
      await attachImages(uploaded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (imageId: string) => {
    const res = await fetch(`/api/genres/${id}/reference-images/${imageId}`, {
      method: 'DELETE',
    });
    if (res.ok) await load();
  };

  const redistill = async () => {
    setDistilling(true);
    setError(null);
    try {
      const res = await fetch(`/api/genres/${id}/distill`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDistilling(false);
    }
  };

  const deleteGenre = async () => {
    if (!confirm(`Delete genre "${server?.name}"? This also removes its reference images.`)) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/genres/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/genres');
    else setDeleting(false);
  };

  if (!server) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
          <p className="mt-1 text-xs text-stone-500">Recipe status: {server.recipeStatus}</p>
        </div>
        <button
          type="button"
          onClick={deleteGenre}
          disabled={deleting}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <div className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Style recipe</span>
            <button
              type="button"
              onClick={redistill}
              disabled={distilling}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50 disabled:opacity-50"
            >
              {distilling ? 'Queuing...' : 'Re-distill from images'}
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Auto-distilled from reference images by a vision model. Edit freely; renders
            will follow your changes.
          </p>
          <textarea
            value={draftRecipe}
            onChange={(e) => setDraftRecipe(e.target.value)}
            rows={10}
            placeholder="Auto-distilled when reference images are processed."
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs focus:border-stone-500 focus:outline-none"
          />
        </div>

        <label className="block">
          <span className="text-sm font-medium">Default hashtags</span>
          <p className="text-xs text-stone-500">
            One per line, hash optional. These merge into every caption for books
            in this genre, alongside any book-specific hashtags.
          </p>
          <textarea
            value={draftHashtagsText}
            onChange={(e) => setDraftHashtagsText(e.target.value)}
            rows={4}
            placeholder={'booktok\nbookrecs'}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Reference images ({refs.length})</span>
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
            category="library/genres"
            onUploaded={async (u) => {
              try {
                await attachImages(u);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </div>
        {refs.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {refs.map((r) => (
              <li key={r.id} className="group relative">
                <Image
                  src={r.blobUrl}
                  alt=""
                  width={300}
                  height={300}
                  unoptimized
                  className="aspect-square w-full rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(r.id)}
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
