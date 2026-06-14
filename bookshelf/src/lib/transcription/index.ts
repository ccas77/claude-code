import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config';
import { separateVocals } from './demucs';
import { transcribeWithWhisper } from './whisper';

/**
 * End-to-end transcription job.
 *
 * Demucs isolates vocals, Whisper transcribes them with word timestamps,
 * captions are persisted against the music clip and the status flag flips
 * to 'done'. Done once per clip; the result is reused forever.
 *
 * DRY_RUN skips all external calls and leaves an empty caption row + an
 * event-log breadcrumb, so the rest of the pipeline can be exercised
 * without spending on APIs.
 */

type RunArgs = { musicClipId: string; jobId: string };

export async function runTranscription({ musicClipId, jobId }: RunArgs): Promise<void> {
  const clip = await db.query.musicClips.findFirst({
    where: eq(schema.musicClips.id, musicClipId),
  });
  if (!clip) {
    await db.insert(schema.eventLog).values({
      ownerId: null,
      stage: 'transcribe',
      level: 'warn',
      message: `music clip ${musicClipId} not found, skipping`,
      payload: { jobId },
    });
    return;
  }

  if (env().DRY_RUN) {
    await db
      .update(schema.musicClips)
      .set({ transcriptionStatus: 'done', updatedAt: new Date() })
      .where(eq(schema.musicClips.id, musicClipId));

    await db
      .insert(schema.captions)
      .values({ musicClipId, fullText: '', words: [], reviewed: false })
      .onConflictDoNothing();

    await db.insert(schema.eventLog).values({
      ownerId: clip.ownerId,
      stage: 'transcribe.dry_run',
      level: 'info',
      message: `[dry-run] transcription skipped for ${clip.name}`,
      payload: { jobId, musicClipId },
    });
    return;
  }

  await db
    .update(schema.musicClips)
    .set({ transcriptionStatus: 'processing', updatedAt: new Date() })
    .where(eq(schema.musicClips.id, musicClipId));

  try {
    const vocalsUrl = await separateVocals(clip.blobUrl);
    const { fullText, words } = await transcribeWithWhisper(vocalsUrl);

    await db
      .insert(schema.captions)
      .values({ musicClipId, fullText, words, reviewed: false })
      .onConflictDoUpdate({
        target: schema.captions.musicClipId,
        set: { fullText, words, updatedAt: new Date() },
      });

    await db
      .update(schema.musicClips)
      .set({ transcriptionStatus: 'done', updatedAt: new Date() })
      .where(eq(schema.musicClips.id, musicClipId));

    await db.insert(schema.eventLog).values({
      ownerId: clip.ownerId,
      stage: 'transcribe.success',
      level: 'info',
      message: `transcribed ${clip.name} (${words.length} words)`,
      payload: { jobId, musicClipId, wordCount: words.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await db
      .update(schema.musicClips)
      .set({ transcriptionStatus: 'failed', updatedAt: new Date() })
      .where(eq(schema.musicClips.id, musicClipId));

    await db.insert(schema.eventLog).values({
      ownerId: clip.ownerId,
      stage: 'transcribe.error',
      level: 'error',
      message,
      payload: { jobId, musicClipId },
    });

    throw err;
  }
}
