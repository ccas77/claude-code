import Link from 'next/link';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export default async function History() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select({
      id: schema.cards.id,
      platform: schema.cards.platform,
      accountHandle: schema.cards.accountHandle,
      postTime: schema.cards.postTime,
      postUrl: schema.cards.postUrl,
      stats: schema.cards.stats,
      videoBlobUrl: schema.cards.videoBlobUrl,
      bookTitle: schema.books.title,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .where(
      and(
        eq(schema.cards.ownerId, ownerId),
        eq(schema.cards.status, 'posted'),
        ne(schema.cards.platform, 'preview'),
      ),
    )
    .orderBy(desc(schema.cards.postTime))
    .limit(200);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Bookshelf
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/library" className="hover:underline">Library</Link>
            <Link href="/board" className="hover:underline">Board</Link>
            <Link href="/history" className="font-medium underline">History</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <span className="text-xs text-stone-500">
            {rows.length} post{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-stone-600">No posts yet.</p>
        ) : (
          <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
            {rows.map((r) => {
              const s = r.stats ?? {};
              return (
                <li key={r.id} className="px-4 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <div className="font-medium">{r.bookTitle ?? 'deleted book'}</div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {r.platform} · {r.accountHandle} ·{' '}
                        {new Date(r.postTime).toLocaleString()}
                      </div>
                    </div>
                    {r.postUrl && (
                      <a
                        href={r.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        Live post
                      </a>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-600">
                    <Stat label="views" n={s.views} />
                    <Stat label="likes" n={s.likes} />
                    <Stat label="comments" n={s.comments} />
                    <Stat label="shares" n={s.shares} />
                    {s.refreshedAt && (
                      <span className="text-stone-400">
                        refreshed {new Date(s.refreshedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function Stat({ label, n }: { label: string; n: number | undefined }) {
  return (
    <span>
      <span className="font-mono">{n ?? '-'}</span>{' '}
      <span className="text-stone-500">{label}</span>
    </span>
  );
}
