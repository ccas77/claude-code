'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { UnsavedBar } from '@/components/UnsavedBar';

type MusicClip = {
  id: string;
  name: string;
  blobUrl: string;
  anyGenre: boolean;
  transcriptionStatus: string;
};

type CaptionWord = { text: string; start: number; end: number };
type Caption = {
  words: CaptionWord[];
  fullText: string;
  reviewed: boolean;
} | null;
type GenreOption = { id: string; name: string };
type BookOption = { id: string; title: string };

/**
 * When the user edits the caption text, redistribute the existing per-word
 * timestamps across the new tokens. If the count matches, keep 1:1. If it
 * differs, spread the new tokens evenly across the original duration so
 * captions still line up roughly with the audio.
 */
function retokenizeWithTimestamps(
  newText: string,
  existing: CaptionWord[],
): CaptionWord[] {
  // Normalise forced-break markers ('/' and '|') so they become standalone
  // tokens even when the user typed them without surrounding spaces
  // (e.g. "monster/king" or "monster/ king"). Without this, the marker
  // stays embedded in a token and the ASS renderer treats it as text and
  // prints the slash on screen.
  const normalised = newText.replace(/[/|]/g, ' $& ');
  const tokens = normalised.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const isMarker = (t: string) => t === '/' || t === '|';
  const realTokens = tokens.filter((t) => !isMarker(t));

  // Strip out any prior markers from the existing word array before counting
  // - otherwise a clip whose previous save had wide-duration markers would
  // make realTokens.length and existing.length mismatch and the code below
  // would fall through to even-spread, scrubbing the real Whisper timings.
  const existingReal = existing.filter((w) => !isMarker(w.text.trim()));

  // Compute the timing per REAL word (non-marker). Marker tokens never
  // render and are stripped at the renderer's pre-pass, so they get a
  // placeholder pinned to the following real word's start time. This keeps
  // every real word in sync with the audio regardless of how many markers
  // the user sprinkles in.
  let realTimings: { start: number; end: number }[];
  if (existingReal.length === 0 || realTokens.length === 0) {
    realTimings = realTokens.map((_, i) => ({
      start: i * 0.5,
      end: i * 0.5 + 0.4,
    }));
  } else if (realTokens.length === existingReal.length) {
    realTimings = existingReal.map((w) => ({ start: w.start, end: w.end }));
  } else {
    // Genuine word-count change (edits, not just marker insertions). Spread
    // the new real words evenly across the original span.
    const firstStart = existingReal[0].start;
    const lastEnd = existingReal[existingReal.length - 1].end;
    const span = Math.max(0.1, lastEnd - firstStart);
    const step = span / realTokens.length;
    realTimings = realTokens.map((_, i) => ({
      start: firstStart + step * i,
      end: firstStart + step * (i + 1),
    }));
  }

  const out: CaptionWord[] = [];
  let realIdx = 0;
  for (const t of tokens) {
    if (isMarker(t)) {
      const anchor =
        realIdx < realTimings.length
          ? realTimings[realIdx].start
          : realTimings.length > 0
            ? realTimings[realTimings.length - 1].end
            : 0;
      out.push({ text: t, start: anchor, end: anchor });
      continue;
    }
    out.push({ text: t, ...realTimings[realIdx] });
    realIdx++;
  }
  return out;
}

export default function MusicEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [server, setServer] = useState<MusicClip | null>(null);
  const [serverGenres, setServerGenres] = useState<string[]>([]);
  const [serverBooks, setServerBooks] = useState<string[]>([]);
  const [caption, setCaption] = useState<Caption>(null);
  const [genres, setGenres] = useState<GenreOption[]>([]);
  const [books, setBooks] = useState<BookOption[]>([]);

  const [draftName, setDraftName] = useState('');
  const [draftMode, setDraftMode] = useState<'free' | 'genres' | 'books'>('free');
  const [draftGenres, setDraftGenres] = useState<string[]>([]);
  const [draftBooks, setDraftBooks] = useState<string[]>([]);
  const [draftFullText, setDraftFullText] = useState('');
  const [draftReviewed, setDraftReviewed] = useState(false);

  const deriveMode = (
    anyGenre: boolean,
    bookIds: string[],
  ): 'free' | 'genres' | 'books' => {
    if (bookIds.length > 0) return 'books';
    if (anyGenre) return 'free';
    return 'genres';
  };

  const [saving, setSaving] = useState(false);
  const [retranscribing, setRetranscribing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [clipRes, genreRes, bookRes] = await Promise.all([
      fetch(`/api/music/${id}`),
      fetch('/api/genres'),
      fetch('/api/books'),
    ]);
    if (!clipRes.ok) {
      setError('Failed to load');
      return;
    }
    const data = await clipRes.json();
    setServer(data.musicClip);
    setServerGenres(data.genreIds ?? []);
    setServerBooks(data.bookIds ?? []);
    setCaption(data.caption);
    setDraftName(data.musicClip.name);
    setDraftMode(deriveMode(data.musicClip.anyGenre, data.bookIds ?? []));
    setDraftGenres(data.genreIds ?? []);
    setDraftBooks(data.bookIds ?? []);
    setDraftFullText(data.caption?.fullText ?? '');
    setDraftReviewed(data.caption?.reviewed ?? false);
    if (genreRes.ok) {
      const g = await genreRes.json();
      setGenres(g.genres ?? []);
    }
    if (bookRes.ok) {
      const b = await bookRes.json();
      setBooks(
        (b.books ?? []).map((row: { id: string; title: string }) => ({
          id: row.id,
          title: row.title,
        })),
      );
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const serverMode = server
    ? deriveMode(server.anyGenre, serverBooks)
    : 'free';
  const clipDirty =
    server !== null &&
    (draftName !== server.name ||
      draftMode !== serverMode ||
      [...draftGenres].sort().join('|') !== [...serverGenres].sort().join('|') ||
      [...draftBooks].sort().join('|') !== [...serverBooks].sort().join('|'));

  const captionDirty =
    server !== null &&
    (draftFullText !== (caption?.fullText ?? '') ||
      draftReviewed !== (caption?.reviewed ?? false));

  const dirty = clipDirty || captionDirty;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (clipDirty) {
        const res = await fetch(`/api/music/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: draftName,
            anyGenre: draftMode === 'free',
            genreIds: draftMode === 'genres' ? draftGenres : [],
            bookIds: draftMode === 'books' ? draftBooks : [],
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      }
      if (captionDirty) {
        const newWords = retokenizeWithTimestamps(
          draftFullText,
          caption?.words ?? [],
        );
        const res = await fetch(`/api/music/${id}/caption`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fullText: draftFullText,
            words: newWords,
            reviewed: draftReviewed,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      }
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
    setDraftMode(deriveMode(server.anyGenre, serverBooks));
    setDraftGenres(serverGenres);
    setDraftBooks(serverBooks);
    setDraftFullText(caption?.fullText ?? '');
    setDraftReviewed(caption?.reviewed ?? false);
  };

  const toggleGenre = (gid: string, checked: boolean) => {
    setDraftGenres((prev) => (checked ? [...prev, gid] : prev.filter((g) => g !== gid)));
  };

  const toggleBook = (bid: string, checked: boolean) => {
    setDraftBooks((prev) => (checked ? [...prev, bid] : prev.filter((b) => b !== bid)));
  };

  const retranscribe = async () => {
    setRetranscribing(true);
    try {
      const res = await fetch(`/api/music/${id}/transcribe`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetranscribing(false);
    }
  };

  const deleteClip = async () => {
    if (!confirm(`Delete clip "${server?.name}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/music/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/music');
    else setDeleting(false);
  };

  if (!server) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{server.name}</h1>
          <p className="mt-1 text-xs text-stone-500">
            Transcription: {server.transcriptionStatus}
            {caption?.reviewed ? ' (reviewed)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/library/music/new"
            className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            <span aria-hidden className="text-base leading-none">+</span>
            Upload another
          </a>
          <button
            type="button"
            onClick={deleteClip}
            disabled={deleting}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      <audio controls src={server.blobUrl} className="w-full" />

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

        <fieldset>
          <legend className="text-sm font-medium">Restrict to</legend>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4 text-sm">
            <label className="inline-flex items-start gap-2">
              <input
                type="radio"
                name="restrict-mode"
                checked={draftMode === 'free'}
                onChange={() => setDraftMode('free')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Free for all</span>
                <span className="block text-xs text-stone-500">
                  Used over any book in any genre.
                </span>
              </span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="radio"
                name="restrict-mode"
                checked={draftMode === 'genres'}
                onChange={() => setDraftMode('genres')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Specific genres</span>
                <span className="block text-xs text-stone-500">
                  Only used for books in the genres you pick.
                </span>
              </span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="radio"
                name="restrict-mode"
                checked={draftMode === 'books'}
                onChange={() => setDraftMode('books')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Specific books</span>
                <span className="block text-xs text-stone-500">
                  Only used for the exact books you pick.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {draftMode === 'genres' && (
          <div>
            <span className="text-sm font-medium">Pick genres</span>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {genres.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftGenres.includes(g.id)}
                    onChange={(e) => toggleGenre(g.id, e.target.checked)}
                  />
                  {g.name}
                </label>
              ))}
              {genres.length === 0 && (
                <p className="text-xs text-stone-500">
                  No genres yet. Add some under Genres first.
                </p>
              )}
            </div>
          </div>
        )}

        {draftMode === 'books' && (
          <div>
            <span className="text-sm font-medium">Pick books</span>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {books.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftBooks.includes(b.id)}
                    onChange={(e) => toggleBook(b.id, e.target.checked)}
                  />
                  <span className="truncate">{b.title}</span>
                </label>
              ))}
              {books.length === 0 && (
                <p className="text-xs text-stone-500">No books yet.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Captions</h2>
          <button
            type="button"
            onClick={retranscribe}
            disabled={retranscribing}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50 disabled:opacity-50"
          >
            {retranscribing ? 'Queuing...' : 'Re-transcribe'}
          </button>
        </div>
        <p className="text-xs text-stone-500">
          Demucs isolates vocals, Whisper transcribes them with word timestamps. Edit
          the text below if needed; the timestamps stay aligned to the source audio
          (only the words change).
        </p>

        <textarea
          value={draftFullText}
          onChange={(e) => setDraftFullText(e.target.value)}
          rows={8}
          placeholder="Captions will appear here after the first transcription run."
          className="block w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs focus:border-stone-500 focus:outline-none"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draftReviewed}
            onChange={(e) => setDraftReviewed(e.target.checked)}
          />
          Mark as reviewed
        </label>

        {caption?.words?.length ? (
          <details className="rounded-md border border-stone-200 bg-white p-3">
            <summary className="cursor-pointer text-xs font-medium text-stone-700">
              {caption.words.length} word timestamps
            </summary>
            <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-stone-600 sm:grid-cols-3 md:grid-cols-4">
              {caption.words.map((w, i) => (
                <li key={i} className="font-mono">
                  {w.start.toFixed(2)} {w.text}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <UnsavedBar visible={dirty} saving={saving} onSave={save} onDiscard={discard} />
    </div>
  );
}
