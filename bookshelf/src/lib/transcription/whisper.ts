import { requireKey } from '../config';
import type { CaptionWord } from '../db/schema';

/**
 * OpenAI Whisper transcription with word-level timestamps.
 *
 * Whisper accepts the file as multipart upload; we fetch the vocals stem
 * straight off Replicate's CDN and re-stream it into the OpenAI request.
 */

type WhisperVerboseResponse = {
  text: string;
  words?: { word: string; start: number; end: number }[];
};

export type TranscriptionResult = {
  fullText: string;
  words: CaptionWord[];
};

export async function transcribeWithWhisper(audioUrl: string): Promise<TranscriptionResult> {
  const apiKey = requireKey('OPENAI_API_KEY', 'OpenAI Whisper');

  const audio = await fetch(audioUrl);
  if (!audio.ok) {
    throw new Error(`Failed to fetch audio for transcription (${audio.status})`);
  }
  const blob = await audio.blob();
  const ext = pickExt(audioUrl) ?? 'mp3';

  const form = new FormData();
  form.append('file', blob, `vocals.${ext}`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }

  const data = (await res.json()) as WhisperVerboseResponse;
  const words: CaptionWord[] = (data.words ?? []).map((w) => ({
    text: w.word,
    start: w.start,
    end: w.end,
  }));

  return { fullText: data.text ?? '', words };
}

function pickExt(url: string): string | null {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : null;
}
