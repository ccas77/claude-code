import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { EditAllClient } from './EditAllClient';

export const dynamic = 'force-dynamic';

export default async function EditAllBooks() {
  const ownerId = await getOwnerId();
  const [books, genres] = await Promise.all([
    db
      .select()
      .from(schema.books)
      .where(eq(schema.books.ownerId, ownerId))
      .orderBy(desc(schema.books.updatedAt)),
    db
      .select({ id: schema.genres.id, name: schema.genres.name })
      .from(schema.genres)
      .where(eq(schema.genres.ownerId, ownerId))
      .orderBy(asc(schema.genres.name)),
  ]);

  return (
    <EditAllClient
      books={books.map((b) => ({
        id: b.id,
        title: b.title,
        kind: b.kind ?? 'single',
        genreId: b.genreId,
        accessories: b.accessories ?? [],
        description: b.description ?? '',
        reviewDump: b.reviewDump ?? '',
        tropes: b.tropes ?? [],
        vibeNotes: b.vibeNotes ?? '',
        hashtags: b.hashtags ?? [],
      }))}
      genres={genres}
    />
  );
}
