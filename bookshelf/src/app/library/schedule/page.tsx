import Link from 'next/link';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  scheduled: 'Scheduled',
  preparing: 'Rendering',
  ready: 'Ready',
  posted: 'Posted',
  failed: 'Failed',
};

export default async function ScheduleList() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select({
      id: schema.cards.id,
      status: schema.cards.status,
      platform: schema.cards.platform,
      accountHandle: schema.cards.accountHandle,
      postTime: schema.cards.postTime,
      bookTitle: schema.books.title,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .where(and(eq(schema.cards.ownerId, ownerId), ne(schema.cards.platform, 'preview')))
    .orderBy(desc(schema.cards.postTime))
    .limit(200);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <Link
          href="/library/schedule/new"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          Schedule a post
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          Nothing scheduled yet. Pick a book + audio + platform + time and the
          render pipeline will prep it ahead of the post window.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/board#card-${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <div>
                  <div className="font-medium">{r.bookTitle ?? 'deleted book'}</div>
                  <div className="text-xs text-stone-500">
                    {r.platform} · {r.accountHandle} · {new Date(r.postTime).toLocaleString()}
                  </div>
                </div>
                <span className="text-xs">{statusLabel[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
