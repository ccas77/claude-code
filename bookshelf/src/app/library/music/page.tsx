import { desc, eq, asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { HowThisWorks } from '@/components/HowThisWorks';
import { MusicListClient } from './MusicListClient';

export const dynamic = 'force-dynamic';

export default async function MusicList() {
  const ownerId = await getOwnerId();
  const [rows, genreRows, bookRows] = await Promise.all([
    db
      .select({
        id: schema.musicClips.id,
        name: schema.musicClips.name,
        anyGenre: schema.musicClips.anyGenre,
        shared: schema.musicClips.shared,
        transcriptionStatus: schema.musicClips.transcriptionStatus,
      })
      .from(schema.musicClips)
      .where(eq(schema.musicClips.ownerId, ownerId))
      .orderBy(desc(schema.musicClips.updatedAt)),
    db
      .select({ id: schema.genres.id, name: schema.genres.name })
      .from(schema.genres)
      .where(eq(schema.genres.ownerId, ownerId))
      .orderBy(asc(schema.genres.name)),
    db
      .select({ id: schema.books.id, title: schema.books.title })
      .from(schema.books)
      .where(eq(schema.books.ownerId, ownerId))
      .orderBy(asc(schema.books.title)),
  ]);

  return (
    <div>
      <HowThisWorks>
        <p>
          Upload the audio clips you want to play over your book videos. Trending sounds, voiceovers, anything you&apos;d post on TikTok or Reels.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Click <strong>Upload audio</strong>. You can pick one file or many at once.</li>
          <li>By default, clips are tagged by genre - tick the genres they fit, or tick <strong>Any genre</strong> for trending sounds that work across everything.</li>
          <li>If a clip is specifically for one book (a signature track), open <strong>Advanced</strong> and tick that book instead.</li>
          <li>The app listens to each clip once and writes the spoken words automatically. Those become the captions you see on the finished video.</li>
          <li>If the captions get a word wrong, open the clip and edit them in the text box - the timing stays in sync.</li>
        </ol>
        <p>Tip: tick multiple clips in the list to bulk-assign genres using the floating bar.</p>
      </HowThisWorks>
      <MusicListClient clips={rows} genres={genreRows} books={bookRows} />
    </div>
  );
}
