import { requireKey } from '../config';
import { putBlob } from '../storage';
import { randomUUID } from 'node:crypto';
import { wordsToSrt } from './srt';
import type { CaptionWord } from '../db/schema';

/**
 * Final composite: silent video + audio + burned-in captions.
 *
 * Replicate-hosted ffmpeg: we upload the SRT to our Blob (public URL),
 * then run an ffmpeg invocation that overlays subtitles and muxes the
 * audio. Output is downloaded and re-hosted on our Blob.
 *
 * Model: lucataco/ffmpeg-api (or any equivalent that accepts a custom
 * ffmpeg command and input URLs). Swap via env if needed.
 */

const REPLICATE_API = 'https://api.replicate.com/v1';
const FFMPEG_OWNER = process.env.REPLICATE_FFMPEG_OWNER ?? 'lucataco';
const FFMPEG_NAME = process.env.REPLICATE_FFMPEG_NAME ?? 'ffmpeg-api';

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  error?: string | null;
  output?: string | string[] | null;
};

async function r<T>(path: string, init: RequestInit): Promise<T> {
  const token = requireKey('REPLICATE_API_TOKEN', 'Replicate ffmpeg');
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

export type FinalVideo = {
  url: string;
  pathname: string;
  provider: string;
  fallback: boolean;
};

export async function compositeFinalVideo(args: {
  silentVideoUrl: string;
  audioUrl: string;
  captionWords: CaptionWord[];
  ownerId: string;
}): Promise<FinalVideo> {
  // Upload SRT so the ffmpeg model can pull it by URL
  const srt = wordsToSrt(args.captionWords);
  const srtPath = `library/renders/${args.ownerId}/${randomUUID()}.srt`;
  const srtBlob = await putBlob(srtPath, Buffer.from(srt, 'utf-8'));

  // ffmpeg command: burn subtitles + replace audio + standard mp4 encode.
  // -shortest stops at the shorter stream so the clip matches the audio length.
  const ffmpegCmd = [
    '-i',
    args.silentVideoUrl,
    '-i',
    args.audioUrl,
    '-i',
    srtBlob.url,
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-vf',
    `subtitles='${srtBlob.url}'`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    'output.mp4',
  ].join(' ');

  const created = await r<Prediction>(
    `/models/${FFMPEG_OWNER}/${FFMPEG_NAME}/predictions`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: {
          input_files: [args.silentVideoUrl, args.audioUrl, srtBlob.url],
          command: ffmpegCmd,
          output_filename: 'output.mp4',
        },
      }),
    },
  );

  let pred = created;
  const startedAt = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;

  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error('composite timed out after 5 minutes');
    }
    await new Promise((r) => setTimeout(r, 3000));
    pred = await r<Prediction>(`/predictions/${pred.id}`, { method: 'GET' });
  }

  if (pred.status !== 'succeeded') {
    throw new Error(`composite failed: ${pred.error ?? pred.status}`);
  }

  const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outputUrl) throw new Error('composite produced no video');

  const res = await fetch(outputUrl);
  if (!res.ok) throw new Error(`fetch composited video failed (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const pathname = `library/renders/${args.ownerId}/${randomUUID()}-final.mp4`;
  const stored = await putBlob(pathname, bytes);

  return {
    url: stored.url,
    pathname: stored.pathname,
    provider: `${FFMPEG_OWNER}/${FFMPEG_NAME}`,
    fallback: false,
  };
}
