import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export default async function BooksList() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select({
      id: schema.books.id,
      title: schema.books.title,
      genreName: schema.genres.name,
      updatedAt: schema.books.updatedAt,
    })
    .from(schema.books)
    .leftJoin(schema.genres, eq(schema.genres.id, schema.books.genreId))
    .where(eq(schema.books.ownerId, ownerId))
    .orderBy(desc(schema.books.updatedAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Books</h1>
        <Link
          href="/library/books/new"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          New book
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No books yet. Add one with its cover and any accessories specific to the story.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((b) => (
            <li key={b.id}>
              <Link
                href={`/library/books/${b.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <div>
                  <span className="font-medium">{b.title}</span>
                  {b.genreName && (
                    <span className="ml-2 text-xs text-stone-500">{b.genreName}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
