import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { BooksListClient } from './BooksListClient';

export const dynamic = 'force-dynamic';

export default async function BooksList() {
  const ownerId = await getOwnerId();
  const [rows, genreRows] = await Promise.all([
    db
      .select({
        id: schema.books.id,
        title: schema.books.title,
        genreName: schema.genres.name,
      })
      .from(schema.books)
      .leftJoin(schema.genres, eq(schema.genres.id, schema.books.genreId))
      .where(eq(schema.books.ownerId, ownerId))
      .orderBy(desc(schema.books.updatedAt)),
    db
      .select({ id: schema.genres.id, name: schema.genres.name })
      .from(schema.genres)
      .where(eq(schema.genres.ownerId, ownerId))
      .orderBy(asc(schema.genres.name)),
  ]);

  return (
    <div>
      <BooksListClient books={rows} genres={genreRows} />
    </div>
  );
}
