import Link from 'next/link';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

const STATUS_ORDER = ['failed', 'preparing', 'scheduled', 'ready'] as const;
type Status = (typeof STATUS_ORDER)[number];

const STATUS_COPY: Record<Status, { title: string; blurb: string }> = {
  failed: { title: 'Needs attention', blurb: 'Hit an error. Review and decide.' },
  preparing: { title: 'Rendering', blurb: 'Workers are building the video right now.' },
  scheduled: { title: 'Queued', blurb: 'Will start rendering once inside the lead-time window.' },
  ready: { title: 'Ready', blurb: 'Video done. Waiting for its post time.' },
};

export default async function Board() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select({
      id: schema.cards.id,
      status: schema.cards.status,
      platform: schema.cards.platform,
      accountHandle: schema.cards.accountHandle,
      postTime: schema.cards.postTime,
      videoBlobUrl: schema.cards.videoBlobUrl,
      errorInfo: schema.cards.errorInfo,
      providersUsed: schema.cards.providersUsed,
      bookTitle: schema.books.title,
      musicName: schema.musicClips.name,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .leftJoin(schema.musicClips, eq(schema.musicClips.id, schema.cards.musicClipId))
    .where(
      and(
        eq(schema.cards.ownerId, ownerId),
        ne(schema.cards.platform, 'preview'),
        ne(schema.cards.status, 'posted'),
      ),
    )
    .orderBy(asc(schema.cards.postTime));

  const grouped: Record<Status, typeof rows> = {
    failed: [],
    preparing: [],
    scheduled: [],
    ready: [],
  };
  for (const r of rows) {
    if (r.status in grouped) grouped[r.status as Status].push(r);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Bookshelf
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/library" className="hover:underline">Library</Link>
            <Link href="/board" className="font-medium underline">Board</Link>
            <Link href="/history" className="hover:underline">History</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Live board</h1>
          <span className="text-xs text-stone-500">
            {rows.length} active card{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_ORDER.map((status) => {
            const items = grouped[status];
            return (
              <section key={status} className="rounded-lg border border-stone-200 bg-white">
                <header className="border-b border-stone-100 px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold">{STATUS_COPY[status].title}</h2>
                    <span className="text-xs text-stone-500">{items.length}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{STATUS_COPY[status].blurb}</p>
                </header>
                <ul className="divide-y divide-stone-100">
                  {items.length === 0 ? (
                    <li className="px-4 py-6 text-center text-xs text-stone-400">
                      Empty
                    </li>
                  ) : (
                    items.map((r) => (
                      <li
                        key={r.id}
                        id={`card-${r.id}`}
                        className={
                          status === 'failed'
                            ? 'bg-red-50/60 px-4 py-3 text-sm'
                            : 'px-4 py-3 text-sm'
                        }
                      >
                        <div className="font-medium">{r.bookTitle ?? 'deleted book'}</div>
                        <div className="mt-0.5 text-xs text-stone-500">
                          {r.platform} · {r.accountHandle}
                        </div>
                        <div className="text-xs text-stone-500">
                          {new Date(r.postTime).toLocaleString()}
                        </div>
                        {status === 'failed' && r.errorInfo && (
                          <div className="mt-2 rounded border border-red-200 bg-white p-2 text-xs text-red-700">
                            <div className="font-medium">
                              {r.errorInfo.stage} ({r.errorInfo.kind})
                            </div>
                            <div className="mt-0.5">{r.errorInfo.message}</div>
                          </div>
                        )}
                        {status === 'ready' && r.videoBlobUrl && (
                          <a
                            href={r.videoBlobUrl}
                            className="mt-2 inline-block text-xs underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview video
                          </a>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
