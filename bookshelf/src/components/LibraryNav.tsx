import Link from 'next/link';
import { HiggsfieldConnect } from './HiggsfieldConnect';
import { isPrimaryOwner } from '@/lib/owner-role';

/**
 * Shared header + nav for the library and history surfaces. Both views feel
 * like they belong to the same app instead of history being an orphan.
 */
export async function LibraryNav() {
  const primary = await isPrimaryOwner();
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/library" className="font-semibold tracking-tight">
          Bookshelf
        </Link>
        <nav className="flex flex-1 items-center gap-4 text-sm">
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
          <Link href="/library/automation" className="hover:underline">
            Automation
          </Link>
          <Link href="/history" className="hover:underline">
            History
          </Link>
          {primary && (
            <Link href="/library/admin/assignments" className="hover:underline">
              Admin
            </Link>
          )}
          <HiggsfieldConnect />
        </nav>
      </div>
    </header>
  );
}
