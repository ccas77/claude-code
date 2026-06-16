import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
export const dynamic = 'force-dynamic';

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  bluesky: 'Bluesky',
};

export default async function AutomationOverview() {
  const ownerId = await getOwnerId();
  const configs = await db
    .select()
    .from(schema.automationConfigs)
    .where(eq(schema.automationConfigs.ownerId, ownerId))
    .orderBy(schema.automationConfigs.platform);

  const counts = await Promise.all(
    configs.map(async (c) => {
      const [bookCount, musicCount] = await Promise.all([
        db
          .select({ id: schema.automationBookSelections.bookId })
          .from(schema.automationBookSelections)
          .where(eq(schema.automationBookSelections.configId, c.id)),
        db
          .select({ id: schema.automationMusicSelections.musicClipId })
          .from(schema.automationMusicSelections)
          .where(eq(schema.automationMusicSelections.configId, c.id)),
      ]);
      return { configId: c.id, books: bookCount.length, music: musicCount.length };
    }),
  );
  const countMap = new Map(counts.map((c) => [c.configId, c]));

  const enabled = configs.filter((c) => c.enabled);
  const disabledWithSelections = configs.filter(
    (c) => !c.enabled && (countMap.get(c.id)?.books ?? 0) > 0,
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
          <p className="mt-1 text-sm text-stone-600">
            One config per account. The cron picks the next book from your selections,
            matches a music clip, renders, and posts in the time windows you set. Set
            once.
          </p>
        </div>
        <Link
          href="/library/automation/connect"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          Connect an account
        </Link>
      </div>

      {configs.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No accounts connected yet. Connect a post-bridge account to start
          configuring automation.
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {enabled.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                On ({enabled.length})
              </h2>
              <ul className="mt-2 space-y-2">
                {enabled.map((c) => (
                  <ConfigCard
                    key={c.id}
                    config={c}
                    counts={countMap.get(c.id)}
                  />
                ))}
              </ul>
            </section>
          )}
          {disabledWithSelections.length > 0 && (
            <section className="opacity-70">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Off, but configured ({disabledWithSelections.length})
              </h2>
              <ul className="mt-2 space-y-2">
                {disabledWithSelections.map((c) => (
                  <ConfigCard
                    key={c.id}
                    config={c}
                    counts={countMap.get(c.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ConfigCard({
  config,
  counts,
}: {
  config: typeof schema.automationConfigs.$inferSelect;
  counts: { books: number; music: number } | undefined;
}) {
  const intervals = config.intervals.length
    ? config.intervals.map((i) => `${i.start}-${i.end}\u00d7${i.posts}`).join(', ')
    : 'no windows';
  return (
    <li>
      <Link
        href={`/library/automation/${config.id}`}
        className="block rounded-lg border border-stone-200 bg-white px-4 py-3 hover:border-stone-400"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">
              @{config.username}{' '}
              <span className="ml-1 text-xs text-stone-500">
                {PLATFORM_LABEL[config.platform] ?? config.platform}
              </span>
            </div>
            <div className="mt-1 text-xs text-stone-600">
              {intervals} &middot; {counts?.books ?? 0} book(s) &middot;{' '}
              {counts?.music ?? 0} clip(s) &middot; pointer {config.bookPointer}
            </div>
          </div>
          <span
            className={
              config.enabled
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                : 'rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600'
            }
          >
            {config.enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </Link>
    </li>
  );
}
