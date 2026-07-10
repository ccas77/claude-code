'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type CharacterInput = { slug: string; description: string };

const DEFAULT_STYLE =
  'storybook watercolor illustration, muted teal and warm amber palette, soft painterly edges, cinematic lighting, textured paper';

export default function NewStoryClient() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [premise, setPremise] = useState('');
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [minutes, setMinutes] = useState(3);
  const [characters, setCharacters] = useState<CharacterInput[]>([
    { slug: 'protagonist', description: '' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setChar = (i: number, patch: Partial<CharacterInput>) =>
    setCharacters((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          premise,
          style,
          targetMinutes: minutes,
          characters: characters.filter((c) => c.slug && c.description),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/stories/${data.story.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">New story</h1>
      <p className="mt-1 text-sm text-stone-500">
        StoryWeave writes the script, illustrates every scene with your characters held
        consistent, narrates it, and renders the video.
      </p>

      <div className="mt-6 space-y-5">
        <label className="block">
          <span className="font-semibold">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The Lighthouse Keeper's Daughter"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="font-semibold">Premise</span>
          <textarea
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            rows={3}
            placeholder="A young woman inherits her father's lighthouse and discovers his logbook records storms days before they arrive…"
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="font-semibold">Style lock</span>{' '}
          <span className="text-xs text-stone-500">applied to every image</span>
          <input
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
        </label>

        <label className="block w-40">
          <span className="font-semibold">Length (minutes)</span>
          <input
            type="number"
            min={1}
            max={20}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
          />
        </label>

        <div>
          <span className="font-semibold">Characters</span>{' '}
          <span className="text-xs text-stone-500">
            the description is the locked identity injected into every scene
          </span>
          <div className="mt-2 space-y-3">
            {characters.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={c.slug}
                  onChange={(e) => setChar(i, { slug: e.target.value })}
                  placeholder="slug"
                  className="w-36 shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2"
                />
                <textarea
                  value={c.description}
                  onChange={(e) => setChar(i, { description: e.target.value })}
                  rows={2}
                  placeholder="Elara, a 19-year-old woman with a long copper-red braid, green eyes and freckles, wearing a dark oilskin coat over a cream fisherman's sweater"
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
                />
                <button
                  onClick={() => setCharacters((cs) => cs.filter((_, j) => j !== i))}
                  className="shrink-0 self-start rounded-lg border border-stone-300 px-3 py-2 text-stone-500 hover:border-red-400 hover:text-red-600"
                  aria-label="remove character"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setCharacters((cs) => [...cs, { slug: '', description: '' }])}
            className="mt-2 rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:border-stone-500"
          >
            + add character
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={saving || !title || premise.length < 10}
          className="rounded-lg bg-stone-900 px-5 py-2.5 font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create story'}
        </button>
      </div>
    </div>
  );
}
