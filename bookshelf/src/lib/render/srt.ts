import type { CaptionWord } from '../db/schema';

/**
 * Punchy BookTok-style captions: one or two words per cue, timestamps
 * driven by the word-level Whisper output. Renders as plain SRT for any
 * ffmpeg subtitles filter to consume.
 */

const WORDS_PER_CUE = 2;

export function wordsToSrt(words: CaptionWord[]): string {
  if (!words.length) return '';
  const cues: { text: string; start: number; end: number }[] = [];

  for (let i = 0; i < words.length; i += WORDS_PER_CUE) {
    const group = words.slice(i, i + WORDS_PER_CUE);
    if (!group.length) continue;
    cues.push({
      text: group.map((w) => w.text).join(' ').trim(),
      start: group[0].start,
      end: group[group.length - 1].end,
    });
  }

  return cues
    .map((c, i) => {
      return `${i + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${escapeForSrt(c.text)}\n`;
    })
    .join('\n');
}

function formatTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(milli).padStart(3, '0')}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function escapeForSrt(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}
