'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string;
  platform: string;
  accountHandle: string;
  postTime: string;
  postUrl: string | null;
  bookTitle: string | null;
  stats: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    refreshedAt?: string;
  } | null;
  caption: string | null;
};

const PLATFORM_TONE: Record<string, string> = {
  tiktok: 'bg-stone-900 text-white',
  instagram: 'bg-pink-100 text-pink-900',
  youtube: 'bg-red-100 text-red-900',
  facebook: 'bg-blue-100 text-blue-900',
  threads: 'bg-stone-100 text-stone-900',
  x: 'bg-stone-100 text-stone-900',
  linkedin: 'bg-blue-100 text-blue-900',
  pinterest: 'bg-red-100 text-red-900',
  bluesky: 'bg-sky-100 text-sky-900',
};

function fmtNum(n: number | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function HistoryClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/history/sync', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Sync failed');
      const data = (await res.json()) as {
        updated: number;
        backfilled: number;
        swept: number;
      };
      setLastSync(
        `Synced - swept ${data.swept}, found ${data.backfilled} new URL${data.backfilled === 1 ? '' : 's'}, refreshed ${data.updated} stat${data.updated === 1 ? '' : 's'}.`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const totals = rows.reduce(
    (acc, r) => ({
      posts: acc.posts + 1,
      views: acc.views + (r.stats?.views ?? 0),
      likes: acc.likes + (r.stats?.likes ?? 0),
      comments: acc.comments + (r.stats?.comments ?? 0),
      shares: acc.shares + (r.stats?.shares ?? 0),
    }),
    { posts: 0, views: 0, likes: 0, comments: 0, shares: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-stone-600">
            What you&apos;ve posted. Stats refresh on a sync.
          </p>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync stats'}
        </button>
      </div>

      {(error || lastSync) && (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {error ?? lastSync}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { k: 'posts', label: 'Posts' },
          { k: 'views', label: 'Views' },
          { k: 'likes', label: 'Likes' },
          { k: 'comments', label: 'Comments' },
          { k: 'shares', label: 'Shares' },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-lg border border-stone-200 bg-white p-3"
          >
            <div className="text-xs text-stone-500">{s.label}</div>
            <div className="mt-1 text-lg font-semibold">
              {fmtNum(totals[s.k as keyof typeof totals])}
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">No posts yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {r.bookTitle ?? 'deleted book'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        PLATFORM_TONE[r.platform] ?? 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {r.platform}
                    </span>
                    <span className="text-xs text-stone-500">
                      @{r.accountHandle}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    {new Date(r.postTime).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })}
                  </div>
                  {r.caption && (
                    <div className="mt-2 line-clamp-2 text-xs text-stone-600">
                      {r.caption}
                    </div>
                  )}
                </div>
                {r.postUrl ? (
                  <a
                    href={r.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50"
                  >
                    View on {r.platform}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-stone-400">
                    URL pending
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-700">
                <span>
                  <span className="font-mono">{fmtNum(r.stats?.views)}</span>{' '}
                  <span className="text-stone-500">views</span>
                </span>
                <span>
                  <span className="font-mono">{fmtNum(r.stats?.likes)}</span>{' '}
                  <span className="text-stone-500">likes</span>
                </span>
                <span>
                  <span className="font-mono">{fmtNum(r.stats?.comments)}</span>{' '}
                  <span className="text-stone-500">comments</span>
                </span>
                <span>
                  <span className="font-mono">{fmtNum(r.stats?.shares)}</span>{' '}
                  <span className="text-stone-500">shares</span>
                </span>
                {r.stats?.refreshedAt && (
                  <span className="text-stone-400">
                    synced{' '}
                    {new Date(r.stats.refreshedAt).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
