import { asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { HowThisWorks } from '@/components/HowThisWorks';
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
      <HowThisWorks>
        <p>
          Add each book you want to make videos about. Click <strong>New book</strong> to get started.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Type the title and pick its genre.</li>
          <li>Upload a clear photo of the cover. You can also add angle shots if you have them.</li>
          <li>Mark it as a single book or a set (a trilogy or duet) if the photo shows several books that belong together.</li>
          <li>Fill in "caption sources" - paste the blurb, your favourite reviews, the tropes, any vibe notes. The app uses all of this to write fresh captions when it makes a video.</li>
          <li>Add any must-include hashtags for this book.</li>
          <li>Hit Save. You can come back and edit anything later.</li>
        </ol>
        <p>
          Tip: if you have a lot of books to bulk-assign to a genre, tick them in the list and use the floating bar at the bottom.
        </p>
      </HowThisWorks>
      <BooksListClient books={rows} genres={genreRows} />
    </div>
  );
}
