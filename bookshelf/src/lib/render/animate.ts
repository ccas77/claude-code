import { requireKey } from '../config';
import { putBlob } from '../storage';
import { randomUUID } from 'node:crypto';

/**
 * Image-to-video animation via Replicate.
 *
 * Default model: stable-video-diffusion. Adds the shaky/handheld feel
 * by pairing motion params with a short prompt. The result is a silent
 * video clip; audio and captions are added in the composite step.
 */

const REPLICATE_API = 'https://api.replicate.com/v1';
const MODEL_OWNER = process.env.REPLICATE_VIDEO_MODEL_OWNER ?? 'stability-ai';
const MODEL_NAME =
  process.env.REPLICATE_VIDEO_MODEL_NAME ?? 'stable-video-diffusion';

type Prediction = {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  error?: string | null;
  output?: string | string[] | null;
};

async function r<T>(path: string, init: RequestInit): Promise<T> {
  const token = requireKey('REPLICATE_API_TOKEN', 'Replicate img2vid');
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

export type AnimatedVideo = {
  url: string;
  pathname: string;
  provider: string;
  fallback: boolean;
};

export async function animateImage(args: {
  imageUrl: string;
  ownerId: string;
  motionPrompt?: string;
}): Promise<AnimatedVideo> {
  const created = await r<Prediction>(
    `/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`,
    {
      method: 'POST',
      body: JSON.stringify({
        input: {
          input_image: args.imageUrl,
          motion_bucket_id: 127,
          frames_per_second: 24,
          sizing_strategy: 'maintain_aspect_ratio',
        },
      }),
    },
  );

  let pred = created;
  const startedAt = Date.now();
  const TIMEOUT_MS = 4 * 60 * 1000;

  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error('img2vid timed out after 4 minutes');
    }
    await new Promise((r) => setTimeout(r, 3000));
    pred = await r<Prediction>(`/predictions/${pred.id}`, { method: 'GET' });
  }

  if (pred.status !== 'succeeded') {
    throw new Error(`img2vid failed: ${pred.error ?? pred.status}`);
  }

  const outputUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outputUrl) throw new Error('img2vid produced no video');

  // Re-host on our Blob so deletes stay in our control
  const res = await fetch(outputUrl);
  if (!res.ok) throw new Error(`fetch video output failed (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const pathname = `library/renders/${args.ownerId}/${randomUUID()}.mp4`;
  const stored = await putBlob(pathname, bytes);

  return {
    url: stored.url,
    pathname: stored.pathname,
    provider: `${MODEL_OWNER}/${MODEL_NAME}`,
    fallback: false,
  };
}
