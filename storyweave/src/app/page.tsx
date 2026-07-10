import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'draft',
  scripting: 'writing script…',
  casting: 'drawing characters…',
  generating: 'illustrating scenes…',
  rendering: 'rendering video…',
  ready: '✓ ready',
  failed: 'failed',
};

const STATUS_CLASS: Record<string, string> = {
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  draft: 'bg-stone-100 text-stone-600',
};

export default async function HomePage() {
  const ownerId = await getOwnerId();
  const stories = await db.query.stories.findMany({
    where: eq(schema.stories.ownerId, ownerId),
    orderBy: desc(schema.stories.createdAt),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your stories</h1>
        <Link
          href="/stories/new"
          className="rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white hover:bg-stone-700"
        >
          + New story
        </Link>
      </div>

      {stories.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center text-stone-500">
          <p className="text-lg">No stories yet.</p>
          <p className="mt-1 text-sm">
            Create one: a premise, a style, and your characters — StoryWeave writes, illustrates,
            narrates and renders the video.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {stories.map((s) => (
            <li key={s.id}>
              <Link
                href={`/stories/${s.id}`}
                className="block rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="truncate font-semibold">{s.title}</h2>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_CLASS[s.status] ?? 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-stone-500">{s.premise}</p>
                <p className="mt-3 text-xs text-stone-400">
                  ~{s.targetMinutes} min · {s.aspect}
                  {s.videoDurationSeconds
                    ? ` · rendered ${Math.round(s.videoDurationSeconds)}s`
                    : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
