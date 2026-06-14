'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

type Card = {
  id: string;
  status: 'scheduled' | 'preparing' | 'ready' | 'posted' | 'failed';
  videoBlobUrl: string | null;
  providersUsed: { step: string; provider: string; fallback: boolean }[];
  errorInfo: { stage: string; message: string; kind: string } | null;
  createdAt: string;
  updatedAt: string;
};

const TERMINAL: Card['status'][] = ['ready', 'failed', 'posted'];

export default function RenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      const res = await fetch(`/api/renders/${id}`);
      if (!res.ok) {
        if (!cancelled) setError('Failed to load');
        return;
      }
      const data = await res.json();
      if (!cancelled) setCard(data.card);
      return data.card as Card;
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const c = await fetchOnce();
      if (!cancelled && c && !TERMINAL.includes(c.status)) {
        timer = setTimeout(poll, 3000);
      }
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const remove = async () => {
    if (!confirm('Delete this test render?')) return;
    const res = await fetch(`/api/renders/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/renders');
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!card) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Render</h1>
        <button
          type="button"
          onClick={remove}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Delete
        </button>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Status</span>
          <span>{card.status}</span>
        </div>
        <div className="mt-2 text-xs text-stone-500">
          Updated {new Date(card.updatedAt).toLocaleString()}
        </div>
        {!TERMINAL.includes(card.status) && (
          <p className="mt-2 text-xs text-stone-500">
            Polling every 3 seconds. The cron worker fires once a minute on its own,
            so the first state change may take up to a minute.
          </p>
        )}
      </div>

      {card.status === 'ready' && card.videoBlobUrl && (
        <video controls src={card.videoBlobUrl} className="w-full rounded-lg border border-stone-200 bg-black" />
      )}

      {card.errorInfo && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-medium">Failed at {card.errorInfo.stage} ({card.errorInfo.kind})</div>
          <p className="mt-1">{card.errorInfo.message}</p>
        </div>
      )}

      {card.providersUsed?.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Providers used</h2>
          <ul className="mt-2 space-y-1 text-xs text-stone-600">
            {card.providersUsed.map((p, i) => (
              <li key={i}>
                <span className="font-mono">{p.step}</span>: {p.provider}
                {p.fallback ? ' (fallback)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
