import Link from 'next/link';

/**
 * Small horizontal sub-nav for the admin section. Renders inside the page
 * body of each /library/admin/* page so the primary owner can switch
 * between admin views without leaving the section.
 */
export function AdminSubNav({
  current,
}: {
  current: 'board' | 'assignments';
}) {
  const linkClass = (key: typeof current) =>
    key === current
      ? 'rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white'
      : 'rounded-md border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50';
  return (
    <nav className="flex items-center gap-2">
      <Link href="/library/admin/board" className={linkClass('board')}>
        Today&apos;s board
      </Link>
      <Link
        href="/library/admin/assignments"
        className={linkClass('assignments')}
      >
        Account assignments
      </Link>
    </nav>
  );
}
