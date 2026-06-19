'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';

type Card = {
  id: string;
  status: 'scheduled' | 'preparing' | 'ready' | 'posted' | 'failed';
  platform: string;
  accountHandle: string;
  caption: string | null;
  videoBlobUrl: string | null;
  providersUsed: { step: string; provider: string; fallback: boolean }[];
  errorInfo: { stage: string; message: string; kind: string } | null;
  createdAt: string;
  updatedAt: string;
};

type Account = {
  id: number;
  username: string;
  platform: string;
};

const TERMINAL: Card['status'][] = ['ready', 'failed', 'posted'];

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(url);
}

/**
 * Render the current Date as a string suitable for <input type="datetime-local">
 * in Europe/London. Browsers expect "YYYY-MM-DDTHH:mm" without timezone, but
 * interpret the value in the user's locale - which is London for us.
 */
function nowAsLondonInput(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(Date.now() + 5 * 60_000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Convert a "YYYY-MM-DDTHH:mm" string entered as London local time into a
 * real UTC ISO string. We assume the user picks a future time in Europe/London;
 * we compute London's offset at that moment by formatting the chosen wall-clock
 * value through Intl.
 */
function londonLocalToIso(local: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMin = computeLondonOffsetMinutes(new Date(asIfUtc));
  return new Date(asIfUtc - offsetMin * 60_000).toISOString();
}

function computeLondonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const londonAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
  );
  return Math.round((londonAsUtc - at.getTime()) / 60_000);
}

export default function RenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [card, setCard] = useState<Card | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState<string>(nowAsLondonInput());
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      const res = await fetch(`/api/renders/${id}`);
      if (!res.ok) {
        if (!cancelled) setError('Failed to load');
        return;
      }
      const data = await res.json();
      if (!cancelled) {
        setCard(data.card);
        setDryRun(Boolean(data.dryRun));
        if (data.card?.caption && !caption) setCaption(data.card.caption);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load Post Bridge accounts only when render is ready, since the call hits
  // the upstream API.
  useEffect(() => {
    if (card?.status !== 'ready') return;
    if (accounts.length > 0) return;
    fetch('/api/automation/accounts')
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [card?.status, accounts.length]);

  // First time a ready card lands with no caption, auto-generate one.
  useEffect(() => {
    if (card?.status !== 'ready') return;
    if (caption || card.caption) return;
    regenerateCaption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.status]);

  const regenerateCaption = async () => {
    setGeneratingCaption(true);
    setError(null);
    try {
      const res = await fetch(`/api/renders/${id}/caption`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const data = await res.json();
      setCaption(data.caption ?? '');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGeneratingCaption(false);
    }
  };

  const publish = async () => {
    if (!accountId) {
      setError('Pick an account to post to.');
      return;
    }
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      setError('Selected account not found.');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        accountId,
        platform: account.platform,
        accountHandle: account.username,
        caption,
      };
      if (mode === 'later') {
        body.postAt = londonLocalToIso(scheduledAt);
      }
      const res = await fetch(`/api/renders/${id}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      router.push('/history');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this render?')) return;
    const res = await fetch(`/api/renders/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/library/renders');
  };

  const [rerendering, setRerendering] = useState(false);
  const rerender = async () => {
    if (
      !confirm(
        'Re-render this card? The current video will be replaced with a fresh image, caption riff, and ffmpeg pass.',
      )
    ) {
      return;
    }
    setRerendering(true);
    setError(null);
    try {
      const res = await fetch(`/api/renders/${id}/rerender`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      // Reset local caption draft so the new render's auto-caption gets
      // picked up when polling sees status flip back to ready.
      setCaption('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRerendering(false);
    }
  };

  if (error && !card) return <p className="text-sm text-red-600">{error}</p>;
  if (!card) return <p className="text-sm text-stone-600">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Render</h1>
        <div className="flex items-center gap-2">
          {card.status !== 'posted' && (
            <button
              type="button"
              onClick={rerender}
              disabled={rerendering}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
            >
              {rerendering ? 'Queuing...' : 'Re-render'}
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Status</span>
          <span>{card.status}</span>
        </div>
        <div className="mt-2 text-xs text-stone-500">
          Updated{' '}
          {new Date(card.updatedAt).toLocaleString('en-GB', {
            timeZone: 'Europe/London',
          })}
        </div>
        {!TERMINAL.includes(card.status) && (
          <p className="mt-2 text-xs text-stone-500">
            Polling every 3 seconds. The cron worker fires once a minute on its own,
            so the first state change may take up to a minute.
          </p>
        )}
      </div>

      {card.status === 'ready' && card.videoBlobUrl && (
        <div>
          <div className="mx-auto max-w-xs">
            {isVideoUrl(card.videoBlobUrl) ? (
              <video
                controls
                playsInline
                preload="metadata"
                src={card.videoBlobUrl}
                className="w-full rounded-lg border border-stone-200 bg-black"
              />
            ) : (
              <img
                src={card.videoBlobUrl}
                alt="rendered still"
                className="w-full rounded-lg border border-stone-200"
              />
            )}
          </div>
          <div className="mt-2 text-center text-xs text-stone-500">
            <a
              href={card.videoBlobUrl}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open in new tab
            </a>
          </div>
        </div>
      )}

      {card.status === 'ready' && card.videoBlobUrl && (
        <div className="rounded-lg border border-stone-200 bg-white p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Publish</h2>
            <span className="text-xs text-stone-500">London time</span>
          </div>

          {dryRun && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-medium">Dry-run mode is ON.</span> Publishing
              here will mark the card as posted but won't actually send it to
              Post Bridge. Set DRY_RUN to false in Vercel env to go live.
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Caption</span>
              <button
                type="button"
                onClick={regenerateCaption}
                disabled={generatingCaption}
                className="rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-50"
              >
                {generatingCaption ? 'Riffing...' : 'Regenerate'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder={
                generatingCaption
                  ? 'Riffing on the book context...'
                  : 'Caption will appear here. Click Regenerate for a fresh riff.'
              }
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            />
          </div>

          <div>
            <span className="text-sm font-medium">Account</span>
            <select
              value={accountId ?? ''}
              onChange={(e) => setAccountId(Number(e.target.value) || null)}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
            >
              <option value="">Pick an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform} · @{a.username}
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="mt-1 text-xs text-stone-500">
                No Post Bridge accounts found. Connect them in Post Bridge first.
              </p>
            )}
          </div>

          <div>
            <span className="text-sm font-medium">When</span>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="when"
                  checked={mode === 'now'}
                  onChange={() => setMode('now')}
                />
                Post now
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="when"
                  checked={mode === 'later'}
                  onChange={() => setMode('later')}
                />
                Schedule for
              </label>
              {mode === 'later' && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="rounded border border-stone-300 px-2 py-1 text-sm"
                />
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div>
            <button
              type="button"
              onClick={publish}
              disabled={publishing || generatingCaption}
              className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {publishing ? 'Publishing...' : mode === 'now' ? 'Post now' : 'Schedule'}
            </button>
          </div>
        </div>
      )}

      {card.errorInfo && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-medium">
            Failed at {card.errorInfo.stage} ({card.errorInfo.kind})
          </div>
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
