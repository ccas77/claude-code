import Link from 'next/link';
import { ReactNode } from 'react';

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Bookshelf
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/library/genres" className="hover:underline">
              Genres
            </Link>
            <Link href="/library/books" className="hover:underline">
              Books
            </Link>
            <Link href="/library/music" className="hover:underline">
              Music
            </Link>
            <Link href="/library/renders" className="hover:underline">
              Renders
            </Link>
            <Link href="/library/schedule" className="hover:underline">
              Schedule
            </Link>
            <Link href="/board" className="hover:underline">
              Board
            </Link>
            <Link href="/history" className="hover:underline">
              History
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 pb-24">{children}</main>
    </div>
  );
}
