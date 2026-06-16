import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { HowThisWorks } from '@/components/HowThisWorks';

export const dynamic = 'force-dynamic';

export default async function GenresList() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select()
    .from(schema.genres)
    .where(eq(schema.genres.ownerId, ownerId))
    .orderBy(desc(schema.genres.updatedAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Genres</h1>
        <Link
          href="/library/genres/new"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          New genre
        </Link>
      </div>

      <div className="mt-4">
        <HowThisWorks>
          <p>
            A genre is the look and feel you want your videos to have. Think of
            it like a Pinterest mood board the AI looks at every time it makes a
            picture for you.
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Click <strong>New genre</strong> and name it (e.g. "dark romance", "cosy fantasy").</li>
            <li>Upload reference images that capture the vibe. The more the merrier.</li>
            <li>The app studies your images and writes a "style recipe" automatically. You can edit the recipe to tweak the look.</li>
            <li>Later, when you add a book, you pick which genre it belongs to and the AI uses that genre&apos;s recipe for the renders.</li>
          </ol>
          <p>You can also add hashtags that should appear in every caption for books in this genre.</p>
        </HowThisWorks>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No genres yet. Create one and upload its reference images.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((g) => (
            <li key={g.id}>
              <Link
                href={`/library/genres/${g.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-stone-500">
                  recipe: {g.recipeStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
