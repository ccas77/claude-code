import Link from 'next/link';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { londonHHMMToUtc, londonNow } from '@/lib/time/london';
import { HowThisWorks } from '@/components/HowThisWorks';

export const dynamic = 'force-dynamic';

type BoardCard = {
  id: string;
  status: string;
  platform: string;
  accountHandle: string;
  postTime: Date;
  bookTitle: string | null;
  errorInfo: { stage: string; message: string; kind: string } | null;
};

const STATUS_ORDER = ['failed', 'preparing', 'ready', 'scheduled', 'posted'] as const;

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  preparing: 'Preparing',
  ready: 'Ready and waiting',
  posted: 'Posted today',
  failed: 'Needs attention',
};

const STATUS_BLURB: Record<string, string> = {
  scheduled: "Lined up for today, not started yet. The app will prepare them ahead of time.",
  preparing: 'Being built right now: AI image, captions, video assembly.',
  ready: 'Video is finished, sitting on the shelf until its post time.',
  posted: 'Already went out today.',
  failed: 'Something broke. Open the render to see what happened.',
};

const STATUS_TONE: Record<string, string> = {
  scheduled: 'border-stone-200 bg-white',
  preparing: 'border-blue-200 bg-blue-50',
  ready: 'border-emerald-200 bg-emerald-50',
  posted: 'border-stone-200 bg-stone-100',
  failed: 'border-red-300 bg-red-50',
};

export default async function BoardPage() {
  const ownerId = await getOwnerId();
  const now = new Date();
  const london = londonNow(now);
  const dayStart = londonHHMMToUtc('00:00', london);
  const dayEnd = londonHHMMToUtc('23:59', london);

  const rows = await db
    .select({
      id: schema.cards.id,
      status: schema.cards.status,
      platform: schema.cards.platform,
      accountHandle: schema.cards.accountHandle,
      postTime: schema.cards.postTime,
      errorInfo: schema.cards.errorInfo,
      bookTitle: schema.books.title,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .where(
      and(
        eq(schema.cards.ownerId, ownerId),
        ne(schema.cards.platform, 'preview'),
        gte(schema.cards.postTime, dayStart),
        lte(schema.cards.postTime, dayEnd),
      ),
    )
    .orderBy(schema.cards.postTime);

  const byStatus = new Map<string, BoardCard[]>();
  for (const s of STATUS_ORDER) byStatus.set(s, []);
  for (const r of rows as BoardCard[]) {
    const arr = byStatus.get(r.status) ?? [];
    arr.push(r);
    byStatus.set(r.status, arr);
  }

  const totalLive = rows.length;
  const failedCount = byStatus.get('failed')?.length ?? 0;
  const todayLabel = new Date(dayStart).toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s board</h1>
        <p className="mt-1 text-sm text-stone-600">
          {todayLabel} - London time. {totalLive === 0
            ? 'Nothing on the board today.'
            : `${totalLive} card${totalLive === 1 ? '' : 's'} live${
                failedCount > 0
                  ? `, ${failedCount} need${failedCount === 1 ? 's' : ''} attention`
                  : ''
              }.`}
        </p>
      </div>

      <HowThisWorks title="How this board works">
        <p>
          Every video the app is working on today shows up here, grouped by what
          stage it&apos;s at.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Needs attention</strong> means something broke. Click into
            the render to see what happened.
          </li>
          <li>
            <strong>Preparing</strong> means the app is building the video right
            now (image, music, captions). Takes about a minute.
          </li>
          <li>
            <strong>Ready and waiting</strong> means the video is built and
            waiting for its post time.
          </li>
          <li>
            <strong>Scheduled</strong> means it&apos;s lined up but the app
            hasn&apos;t started it yet.
          </li>
          <li>
            <strong>Posted today</strong> are the ones that have already gone
            live. The full history of everything you&apos;ve ever posted lives
            on the History page.
          </li>
        </ul>
      </HowThisWorks>

      <div className="grid gap-4">
        {STATUS_ORDER.map((status) => {
          const cards = byStatus.get(status) ?? [];
          if (cards.length === 0) return null;
          return (
            <section
              key={status}
              className={`rounded-lg border ${STATUS_TONE[status]} p-4`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">
                  {STATUS_LABEL[status]}{' '}
                  <span className="text-stone-500">({cards.length})</span>
                </h2>
              </div>
              <p className="mt-1 text-xs text-stone-600">
                {STATUS_BLURB[status]}
              </p>
              <ul className="mt-3 space-y-2">
                {cards.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/library/renders/${c.id}`}
                      className="block rounded-md bg-white px-3 py-2 text-sm border border-stone-200 hover:border-stone-400"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">
                          {c.bookTitle ?? 'deleted book'}
                        </span>
                        <span className="text-xs text-stone-500 shrink-0">
                          {new Date(c.postTime).toLocaleTimeString('en-GB', {
                            timeZone: 'Europe/London',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-stone-600">
                        {c.platform} · {c.accountHandle}
                      </div>
                      {c.errorInfo && (
                        <div className="mt-1 text-xs text-red-700">
                          {c.errorInfo.stage}: {c.errorInfo.message.slice(0, 140)}
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {totalLive === 0 && (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600">
            Nothing scheduled today. Open <Link href="/library/automation" className="underline">Automation</Link> to set up a posting schedule, or render a video by hand from <Link href="/library/renders" className="underline">Renders</Link>.
          </div>
        )}
      </div>

      <div className="text-xs text-stone-500">
        Looking for posts that have already gone out? <Link href="/history" className="underline">History</Link> shows everything ever posted, not just today.
      </div>
    </div>
  );
}
