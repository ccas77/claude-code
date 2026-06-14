import Link from 'next/link';
import { eq, count } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

async function counts() {
  const ownerId = await getOwnerId();
  const [genres, books, music] = await Promise.all([
    db.select({ n: count() }).from(schema.genres).where(eq(schema.genres.ownerId, ownerId)),
    db.select({ n: count() }).from(schema.books).where(eq(schema.books.ownerId, ownerId)),
    db
      .select({ n: count() })
      .from(schema.musicClips)
      .where(eq(schema.musicClips.ownerId, ownerId)),
  ]);
  return { genres: genres[0].n, books: books[0].n, music: music[0].n };
}

const tiles = [
  {
    href: '/library/genres',
    title: 'Genres',
    blurb:
      'Reference image sets that ground the AI image generator in real-world aesthetics. Each genre also holds a style recipe (editable).',
    key: 'genres' as const,
  },
  {
    href: '/library/books',
    title: 'Books',
    blurb:
      'Each book has its cover and optional angle photos, plus a genre and accessories that must always appear in renders.',
    key: 'books' as const,
  },
  {
    href: '/library/music',
    title: 'Music',
    blurb:
      'Audio clips with someone speaking over music. Captions are transcribed once on upload and reused forever.',
    key: 'music' as const,
  },
];

export default async function LibraryHome() {
  const c = await counts();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
      <p className="mt-2 text-sm text-stone-600">
        The three libraries the render pipeline draws from. Build them once, reuse forever.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-lg border border-stone-200 bg-white p-5 hover:border-stone-400"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">{t.title}</h2>
              <span className="text-sm text-stone-500">{c[t.key]}</span>
            </div>
            <p className="mt-2 text-sm text-stone-600">{t.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
