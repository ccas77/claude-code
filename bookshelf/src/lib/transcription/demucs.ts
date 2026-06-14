import { requireKey } from '../config';

/**
 * Vocal-stem isolation via Replicate's hosted Demucs.
 *
 * Input: a public audio URL (Vercel Blob).
 * Output: a public URL pointing at the isolated vocals stem.
 *
 * Replicate stores the output on their CDN. We hand that URL straight to
 * Whisper without re-uploading - Whisper fetches it itself.
 */

const REPLICATE_API = 'https://api.replicate.com/v1';
const MODEL_OWNER = 'ryan5453';
const MODEL_NAME = 'demucs';

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  error?: string | null;
  output?: { vocals?: string; other?: string; drums?: string; bass?: string } | null;
};

async function r<T>(path: string, init: RequestInit): Promise<T> {
  const token = requireKey('REPLICATE_API_TOKEN', 'Replicate Demucs');
  const res = await fetch(`${REPLICATE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${path} ${res.status}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export async function separateVocals(audioUrl: string): Promise<string> {
  const created = await r<Prediction>(
    `/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: {
          audio: audioUrl,
          stem: 'vocals',
          model: 'htdemucs',
          output_format: 'mp3',
        },
      }),
    },
  );

  let pred = created;
  const startedAt = Date.now();
  const TIMEOUT_MS = 4 * 60 * 1000;

  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error('Demucs timed out after 4 minutes');
    }
    await new Promise((r) => setTimeout(r, 2000));
    pred = await r<Prediction>(`/predictions/${pred.id}`, { method: 'GET' });
  }

  if (pred.status !== 'succeeded') {
    throw new Error(`Demucs failed: ${pred.error ?? pred.status}`);
  }

  const vocals = pred.output?.vocals;
  if (!vocals || typeof vocals !== 'string') {
    throw new Error('Demucs produced no vocals stem');
  }
  return vocals;
}
