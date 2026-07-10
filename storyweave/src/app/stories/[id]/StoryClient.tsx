'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';

type Story = {
  id: string;
  title: string;
  premise: string;
  style: string;
  status: string;
  targetMinutes: number;
  videoBlobUrl: string | null;
  videoDurationSeconds: number | null;
  errorInfo: { stage: string; message: string; at: string } | null;
};
type Character = {
  id: string;
  slug: string;
  description: string;
  referenceImages: { url: string; pathname: string }[];
};
type Scene = {
  id: string;
  idx: number;
  narration: string;
  mood: string;
  shot: string;
  imageUrl: string | null;
  audioUrl: string | null;
  clipUrl: string | null;
};
type EventRow = { id: string; stage: string; level: string; message: string; createdAt: string };
type State = { story: Story; characters: Character[]; scenes: Scene[]; events: EventRow[] };

const ACTIVE = new Set(['scripting', 'casting', 'generating', 'rendering']);

const PHASES = [
  ['scripting', 'script'],
  ['casting', 'cast'],
  ['generating', 'scenes'],
  ['rendering', 'render'],
  ['ready', 'video'],
] as const;

export default function StoryClient({ storyId }: { storyId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/stories/${storyId}`);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as State;
    setState(data);
    return data;
  }, [storyId]);

  useEffect(() => {
    // Async fetch → setState resolves after the effect returns; the sync-set
    // -state rule can't trace through the await, so quiet it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Poll while the pipeline is running.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (state && ACTIVE.has(state.story.status)) {
      timer.current = setInterval(load, 2500);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [state, load]);

  async function post(url: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return <p className="text-stone-500">{error ?? 'Loading…'}</p>;
  }
  const { story, characters, scenes, events } = state;
  const running = ACTIVE.has(story.status);
  const phaseIndex = PHASES.findIndex(([status]) => status === story.status);
  const doneCount = {
    images: scenes.filter((s) => s.imageUrl).length,
    audio: scenes.filter((s) => s.audioUrl).length,
    clips: scenes.filter((s) => s.clipUrl).length,
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{story.title}</h1>
        <span className="text-sm text-stone-500">
          ~{story.targetMinutes} min · {scenes.length || '?'} scenes
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-stone-500">{story.premise}</p>

      {/* pipeline phases */}
      <div className="mt-5 flex flex-wrap gap-2">
        {PHASES.map(([status, label], i) => {
          const isDone = story.status === 'ready' || (phaseIndex >= 0 && i < phaseIndex);
          const isActive = status === story.status && running;
          return (
            <span
              key={status}
              className={`rounded-full border px-3 py-1 text-sm ${
                isActive
                  ? 'animate-pulse border-amber-400 bg-amber-50 text-amber-800'
                  : isDone || (status === 'ready' && story.status === 'ready')
                    ? 'border-green-300 bg-green-50 text-green-800'
                    : 'border-stone-200 text-stone-400'
              }`}
            >
              {label}
              {status === 'generating' && scenes.length > 0
                ? ` ${Math.min(doneCount.images, doneCount.audio)}/${scenes.length}`
                : ''}
              {status === 'rendering' && scenes.length > 0 ? ` ${doneCount.clips}/${scenes.length}` : ''}
            </span>
          );
        })}
      </div>

      {/* controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => post(`/api/stories/${story.id}/generate`)}
          disabled={busy || running}
          className="rounded-lg bg-stone-900 px-5 py-2.5 font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {running ? 'Generating…' : story.status === 'ready' ? 'Resume / fill gaps' : '▶ Generate video'}
        </button>
        <button
          onClick={() => {
            if (confirm('Throw away all scenes and images and start over?')) {
              post(`/api/stories/${story.id}/generate`, { force: true });
            }
          }}
          disabled={busy || running}
          className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm hover:border-stone-500 disabled:opacity-50"
        >
          Regenerate everything
        </button>
        {story.status === 'failed' && story.errorInfo && (
          <span className="text-sm text-red-600">
            failed at {story.errorInfo.stage}: {story.errorInfo.message} — press Generate to retry
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* video */}
      {story.videoBlobUrl && (
        <section className="mt-8">
          <h2 className="font-semibold">Final video</h2>
          <video
            controls
            src={story.videoBlobUrl}
            className="mt-2 w-full max-w-3xl rounded-xl bg-black"
          />
          <a
            href={story.videoBlobUrl}
            download={`${story.title}.mp4`}
            className="mt-2 inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm hover:border-stone-500"
          >
            Download MP4
            {story.videoDurationSeconds ? ` (${Math.round(story.videoDurationSeconds)}s)` : ''}
          </a>
        </section>
      )}

      {/* cast */}
      {characters.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Cast</h2>
          <div className="mt-2 flex flex-wrap gap-4">
            {characters.map((c) => (
              <div key={c.id} className="w-44 rounded-xl border border-stone-200 bg-white p-3">
                {c.referenceImages[0] ? (
                  <img
                    src={c.referenceImages[0].url}
                    alt={c.slug}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center rounded-lg bg-stone-100 text-xs text-stone-400">
                    not cast yet
                  </div>
                )}
                <p className="mt-2 text-sm font-semibold">{c.slug}</p>
                <p className="line-clamp-3 text-xs text-stone-500">{c.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* storyboard */}
      {scenes.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Storyboard</h2>
          <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                {s.imageUrl ? (
                  <img src={s.imageUrl} alt={`scene ${s.idx + 1}`} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="grid aspect-video w-full place-items-center bg-stone-100 text-sm text-stone-400">
                    {running ? 'generating…' : 'no image'}
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Scene {s.idx + 1}</span>
                    <span className="text-xs text-stone-400">
                      {s.mood} · {s.shot}
                      {s.audioUrl ? ' · 🔊' : ''}
                      {s.clipUrl ? ' · 🎞' : ''}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs text-stone-500">{s.narration}</p>
                  <button
                    onClick={() => post(`/api/stories/${story.id}/scenes/${s.id}/regenerate`)}
                    disabled={busy || running}
                    className="mt-2 rounded-lg border border-stone-300 px-3 py-1.5 text-xs hover:border-stone-500 disabled:opacity-50"
                  >
                    ↻ regenerate this scene
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* activity log */}
      {events.length > 0 && (
        <section className="mt-8">
          <h2 className="font-semibold">Activity</h2>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-xl border border-stone-200 bg-white p-3 font-mono text-xs">
            {events.map((e) => (
              <li key={e.id} className={e.level === 'error' ? 'text-red-600' : 'text-stone-600'}>
                <span className="text-stone-400">{new Date(e.createdAt).toLocaleTimeString()}</span>{' '}
                [{e.stage}] {e.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
