import { env, requireKey } from '../config';
import { putBlob, type StoredBlob } from '../storage';
import { probeBufferDurationSeconds, silentAudio } from '../render/ffmpeg';
import type { CaptionWord } from '../db/schema';

/**
 * Narration. Per-scene synthesis (not one long file) so scene boundaries land
 * exactly on audio boundaries — the clip renderer just reads the duration.
 *
 * v1 derives word timings by spreading words evenly across the measured
 * duration; good enough for phrase-grouped captions. Upgrade path: run the
 * audio through Whisper (word granularity) exactly as bookshelf does for
 * music, and store the real timestamps in the same `words` column.
 */

const DRY_RUN_WORDS_PER_SECOND = 2.4;

export async function synthesizeNarration(args: {
  text: string;
  pathnameBase: string; // e.g. stories/{owner}/{story}/audio/003
}): Promise<{ stored: StoredBlob; durationSeconds: number; words: CaptionWord[] }> {
  const wordList = args.text.split(/\s+/).filter(Boolean);

  if (env().DRY_RUN) {
    const duration = Math.max(1.5, wordList.length / DRY_RUN_WORDS_PER_SECOND);
    const bytes = await silentAudio(duration);
    const stored = await putBlob(`${args.pathnameBase}.m4a`, bytes);
    return { stored, durationSeconds: duration, words: evenWordTimings(wordList, duration) };
  }

  const apiKey = requireKey('OPENAI_API_KEY', 'narration (TTS)');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env().TTS_MODEL,
      voice: env().TTS_VOICE,
      input: args.text,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) {
    throw new Error(`TTS failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const duration = await probeBufferDurationSeconds(bytes, 'mp3');
  const stored = await putBlob(`${args.pathnameBase}.mp3`, bytes);
  return { stored, durationSeconds: duration, words: evenWordTimings(wordList, duration) };
}

function evenWordTimings(words: string[], duration: number): CaptionWord[] {
  if (words.length === 0) return [];
  const per = duration / words.length;
  return words.map((text, i) => ({
    text,
    start: Number((i * per).toFixed(3)),
    end: Number(((i + 1) * per).toFixed(3)),
  }));
}
