import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { HowThisWorks } from '@/components/HowThisWorks';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  scheduled: 'Queued',
  preparing: 'Rendering',
  ready: 'Ready',
  failed: 'Failed',
  posted: 'Posted',
};

export default async function RendersList() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select({
      id: schema.cards.id,
      status: schema.cards.status,
      videoBlobUrl: schema.cards.videoBlobUrl,
      createdAt: schema.cards.createdAt,
      bookTitle: schema.books.title,
      musicName: schema.musicClips.name,
    })
    .from(schema.cards)
    .leftJoin(schema.books, eq(schema.books.id, schema.cards.bookId))
    .leftJoin(schema.musicClips, eq(schema.musicClips.id, schema.cards.musicClipId))
    .where(
      and(eq(schema.cards.ownerId, ownerId), eq(schema.cards.platform, 'preview')),
    )
    .orderBy(desc(schema.cards.createdAt))
    .limit(50);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renders</h1>
          <p className="mt-1 text-sm text-stone-600">
            Render a video first, then choose Post now or Schedule for later from
            its detail page.
          </p>
        </div>
        <Link
          href="/library/renders/new"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          Test render
        </Link>
      </div>

      <div className="mt-4">
        <HowThisWorks>
          <p>
            Renders is where you build videos by hand (as opposed to automation, which does it on a schedule).
          </p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Click <strong>Test render</strong>. Pick a book and a music clip.</li>
            <li>The app builds the video: AI image of the book in your genre&apos;s style, your audio, captions synced word-by-word. Takes about a minute.</li>
            <li>When it&apos;s ready, you&apos;ll see the video on the render&apos;s detail page along with a caption written by the app.</li>
            <li>To post it: pick a Post Bridge account, edit the caption if you want (or hit Regenerate for a different riff), choose <strong>Post now</strong> or <strong>Schedule for later</strong>, and hit Publish.</li>
            <li>Friends - you&apos;ll only see the accounts Cordelia has assigned to you in the publish dropdown.</li>
          </ol>
        </HowThisWorks>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No renders yet. Make sure you have at least one book with images and one
          music clip uploaded, then start a test render.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/library/renders/${r.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <div>
                  <div className="font-medium">
                    {r.bookTitle ?? 'deleted book'}
                  </div>
                  <div className="text-xs text-stone-500">
                    audio: {r.musicName ?? 'deleted clip'}
                  </div>
                </div>
                <span className="text-xs text-stone-700">{statusLabel[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
