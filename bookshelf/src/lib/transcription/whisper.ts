import type { CaptionWord } from '../db/schema';

/**
 * Audio transcription with timestamps.
 *
 * Provider chain:
 *   - OPENAI_API_KEY: direct OpenAI Whisper API, word-level timestamps
 *     (best for punchy 1-2 word captions).
 *   - REPLICATE_API_TOKEN: Replicate-hosted Whisper, segment-level
 *     timestamps. Same key already required for Demucs and img2vid.
 *   - Otherwise: clear error.
 */

export type TranscriptionResult = {
  fullText: string;
  words: CaptionWord[];
};

export async function transcribeWithWhisper(audioUrl: string): Promise<TranscriptionResult> {
  if (process.env.OPENAI_API_KEY) return transcribeDirectOpenAi(audioUrl);
  if (process.env.REPLICATE_API_TOKEN) return transcribeViaReplicate(audioUrl);
  throw new Error(
    'No transcription provider configured. Set OPENAI_API_KEY (word-level) or REPLICATE_API_TOKEN (segment-level) in your Vercel project env vars.',
  );
}

// ---- Direct OpenAI ----------------------------------------------------------

type WhisperVerboseResponse = {
  text: string;
  words?: { word: string; start: number; end: number }[];
};

async function transcribeDirectOpenAi(audioUrl: string): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY!;

  const audio = await fetch(audioUrl);
  if (!audio.ok) {
    throw new Error(`Failed to fetch audio for transcription (${audio.status})`);
  }
  const blob = await audio.blob();
  const ext = pickExt(audioUrl) ?? 'mp3';

  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
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
  const punctuated = attachPunctuation(data.text ?? '', data.words ?? []);
  const words: CaptionWord[] = punctuated.map((w) => ({
    text: w.text,
    start: w.start,
    end: w.end,
  }));

  return { fullText: data.text ?? '', words };
}

/**
 * Whisper's word-level timestamps come back without punctuation. The full
 * text in `data.text` has it. Walk the text in order and attach any
 * trailing punctuation to each word so cues like "RUN." render properly.
 */
function attachPunctuation(
  text: string,
  words: { word: string; start: number; end: number }[],
): { text: string; start: number; end: number }[] {
  let cursor = 0;
  return words.map((w) => {
    const idx = text.indexOf(w.word, cursor);
    if (idx < 0) {
      return { text: w.word, start: w.start, end: w.end };
    }
    let punctEnd = idx + w.word.length;
    while (
      punctEnd < text.length &&
      /[^\w\s]/.test(text[punctEnd])
    ) {
      punctEnd++;
    }
    cursor = punctEnd;
    return { text: text.slice(idx, punctEnd), start: w.start, end: w.end };
  });
}

// ---- Replicate Whisper ------------------------------------------------------

const REPLICATE_API = 'https://api.replicate.com/v1';
const REPLICATE_MODEL_OWNER = process.env.REPLICATE_WHISPER_OWNER ?? 'openai';
const REPLICATE_MODEL_NAME = process.env.REPLICATE_WHISPER_NAME ?? 'whisper';

type RPrediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  error?: string | null;
  output?: {
    transcription?: string;
    segments?: { text: string; start: number; end: number }[];
  } | null;
};

async function r<T>(path: string, init: RequestInit): Promise<T> {
  const token = process.env.REPLICATE_API_TOKEN!;
  const res = await fetch(`${REPLICATE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Replicate ${path} ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  return res.json() as Promise<T>;
}

async function transcribeViaReplicate(audioUrl: string): Promise<TranscriptionResult> {
  const created = await r<RPrediction>(
    `/models/${REPLICATE_MODEL_OWNER}/${REPLICATE_MODEL_NAME}/predictions`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: { audio: audioUrl, model: 'large-v3', transcription: 'plain text' },
      }),
    },
  );

  let pred = created;
  const startedAt = Date.now();
  const TIMEOUT_MS = 4 * 60 * 1000;
  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error('whisper timed out after 4 minutes');
    }
    await new Promise((r) => setTimeout(r, 2000));
    pred = await r<RPrediction>(`/predictions/${pred.id}`, { method: 'GET' });
  }
  if (pred.status !== 'succeeded') {
    throw new Error(`whisper failed: ${pred.error ?? pred.status}`);
  }

  const fullText = pred.output?.transcription ?? '';
  const segments = pred.output?.segments ?? [];
  const words: CaptionWord[] = segments.map((s) => ({
    text: s.text.trim(),
    start: s.start,
    end: s.end,
  }));
  return { fullText, words };
}

function pickExt(url: string): string | null {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  return m ? m[1].toLowerCase() : null;
}
