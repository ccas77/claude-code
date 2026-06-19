import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { LibraryNav } from '@/components/LibraryNav';
import { HistoryClient } from './HistoryClient';

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
      caption: schema.cards.caption,
      bookTitle: schema.books.title,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .where(
      and(
        eq(schema.cards.ownerId, ownerId),
        eq(schema.cards.status, 'posted'),
        ne(schema.cards.platform, 'preview'),
        sql`NOT (${schema.cards.providersUsed} @> '[{"step":"post","provider":"dry-run"}]'::jsonb)`,
      ),
    )
    .orderBy(desc(schema.cards.postTime))
    .limit(200);

  const serialised = rows.map((r) => ({
    ...r,
    postTime: r.postTime.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <LibraryNav />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-24">
        <HistoryClient rows={serialised} />
      </main>
    </div>
  );
}
