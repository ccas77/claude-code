import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-sans text-stone-800">
      <h1 className="text-3xl font-semibold tracking-tight">Bookshelf</h1>
      <p className="mt-3 text-stone-600">
        Book-cover videos, scheduled and auto-posted across socials.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link
          href="/board"
          className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400"
        >
          <div className="font-semibold">Live board</div>
          <p className="mt-1 text-xs text-stone-600">
            What&apos;s queued, rendering, ready, or failed.
          </p>
        </Link>
        <Link
          href="/history"
          className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400"
        >
          <div className="font-semibold">History</div>
          <p className="mt-1 text-xs text-stone-600">
            Posts that went out, with engagement stats.
          </p>
        </Link>
        <Link
          href="/library"
          className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400"
        >
          <div className="font-semibold">Library</div>
          <p className="mt-1 text-xs text-stone-600">
            Books, audio, genre references, and the schedule.
          </p>
        </Link>
      </div>

      <p className="mt-10 text-xs text-stone-500">
        <a href="/api/health" className="underline">Health check</a>
      </p>
    </main>
  );
}
