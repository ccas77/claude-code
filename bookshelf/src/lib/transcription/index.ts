import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { separateVocals } from './demucs';
import { transcribeWithWhisper } from './whisper';

/**
 * End-to-end transcription job.
 *
 * If REPLICATE_API_TOKEN is set, Demucs isolates the vocal stem first.
 * Otherwise Whisper transcribes the original audio (still works, just less
 * tolerant of loud music). Whisper then produces word-level timestamps.
 *
 * Failures land on caption.fullText with a [Transcription failed] prefix
 * so they are visible on the music edit page instead of silent.
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

  await db
    .update(schema.musicClips)
    .set({ transcriptionStatus: 'processing', updatedAt: new Date() })
    .where(eq(schema.musicClips.id, musicClipId));

  try {
    const audioForWhisper = process.env.REPLICATE_API_TOKEN
      ? await separateVocals(clip.blobUrl)
      : clip.blobUrl;

    const { fullText, words } = await transcribeWithWhisper(audioForWhisper);

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

    // Write the error message into the caption so it's visible on the
    // music edit page instead of leaving captions empty + status=failed.
    await db
      .insert(schema.captions)
      .values({
        musicClipId,
        fullText: `[Transcription failed]\n\n${message}\n\nFix the underlying issue then click "Re-transcribe".`,
        words: [],
        reviewed: false,
      })
      .onConflictDoUpdate({
        target: schema.captions.musicClipId,
        set: {
          fullText: `[Transcription failed]\n\n${message}\n\nFix the underlying issue then click "Re-transcribe".`,
          words: [],
          updatedAt: new Date(),
        },
      });

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
