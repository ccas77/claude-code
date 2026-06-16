import { desc, eq, asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getOwnerId } from '@/lib/owner';
import { MusicListClient } from './MusicListClient';

export const dynamic = 'force-dynamic';

export default async function MusicList() {
  const ownerId = await getOwnerId();
  const [rows, genreRows] = await Promise.all([
    db
      .select({
        id: schema.musicClips.id,
        name: schema.musicClips.name,
        anyGenre: schema.musicClips.anyGenre,
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
  ]);

  return (
    <div>
      <MusicListClient clips={rows} genres={genreRows} />
    </div>
  );
}
