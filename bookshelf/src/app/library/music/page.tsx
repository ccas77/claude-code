import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export default async function MusicList() {
  const ownerId = await getOwnerId();
  const rows = await db
    .select()
    .from(schema.musicClips)
    .where(eq(schema.musicClips.ownerId, ownerId))
    .orderBy(desc(schema.musicClips.updatedAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Music</h1>
        <Link
          href="/library/music/new"
          className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
        >
          New clip
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-stone-600">
          No clips yet. Upload an audio file; the spoken part will be transcribed once
          and the captions reused forever.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {rows.map((m) => (
            <li key={m.id}>
              <Link
                href={`/library/music/${m.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
              >
                <div>
                  <span className="font-medium">{m.name}</span>
                  {m.anyGenre && (
                    <span className="ml-2 text-xs text-stone-500">any genre</span>
                  )}
                </div>
                <span className="text-xs text-stone-500">
                  captions: {m.transcriptionStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
