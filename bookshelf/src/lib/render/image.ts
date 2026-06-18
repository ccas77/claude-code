import { randomUUID } from 'node:crypto';
import { putBlob } from '../storage';
import { generateImageViaHiggsfieldMcp } from './higgsfield-mcp';
import { generateImageViaGateway } from './image-gateway';
import { isConnected as higgsfieldConnected } from '../higgsfield/oauth';

/**
 * Image generation. Provider is chosen by the orchestrator via the `provider`
 * argument; callers pass 'higgsfield' or 'gateway' (or 'openai' for the
 * legacy path).
 *
 *   - 'higgsfield' / undefined: Higgsfield MCP (Nano Banana). Primary path.
 *   - 'gateway':                Vercel AI Gateway -> google/gemini-2.5-flash
 *                               -image-preview. Same model Higgsfield wraps,
 *                               called direct so a Higgsfield outage doesn't
 *                               take the fallback down too.
 *   - 'openai':                 OpenAI gpt-image-1 with reference editing.
 *                               Last-ditch path.
 *
 * All three accept reference images so the book cover stays recognisable.
 */

export type GeneratedImage = {
  url: string;
  pathname: string;
  provider: string;
  fallback: boolean;
};

export async function generateBookImage(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
  provider?: string;
}): Promise<GeneratedImage> {
  const want = args.provider?.toLowerCase();

  if (want === 'gateway' || want === 'gemini') {
    return generateImageViaGateway(args);
  }
  if (want === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not set; cannot use OpenAI image path.');
    }
    return generateViaOpenAi(args);
  }
  if (want === 'higgsfield' || want === undefined) {
    if (await higgsfieldConnected().catch(() => false)) {
      const r = await generateImageViaHiggsfieldMcp(args);
      return { url: r.url, pathname: r.pathname, provider: r.provider, fallback: false };
    }
    if (process.env.HIGGSFIELD_API_KEY) {
      return generateViaHiggsfield(args);
    }
    throw new Error(
      'Higgsfield is not connected. Connect at /api/auth/higgsfield/start or set HIGGSFIELD_API_KEY.',
    );
  }

  throw new Error(`Unknown image provider: ${args.provider}`);
}

// ---- Higgsfield Nano Banana -------------------------------------------------

const HIGGSFIELD_BASE = process.env.HIGGSFIELD_BASE_URL ?? 'https://platform.higgsfield.ai/v1';

type HiggsfieldJob = {
  id?: string;
  status?: string;
  result?: { image_url?: string; url?: string; output_url?: string };
  output?: { url?: string; image_url?: string }[];
  error?: string;
};

async function generateViaHiggsfield(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.HIGGSFIELD_API_KEY!;

  const submit = await fetch(`${HIGGSFIELD_BASE}/image/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'nano-banana',
      prompt: args.prompt,
      reference_images: args.referenceImageUrls,
      aspect_ratio: '9:16',
    }),
  });
  if (!submit.ok) {
    throw new Error(
      `Higgsfield ${submit.status}: ${(await submit.text()).slice(0, 400)}`,
    );
  }

  let job = (await submit.json()) as HiggsfieldJob;

  // Poll if job is async
  if (job.id && job.status && !isTerminal(job.status)) {
    const startedAt = Date.now();
    const TIMEOUT_MS = 3 * 60 * 1000;
    while (!isTerminal(job.status ?? '')) {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        throw new Error('Higgsfield image gen timed out after 3 minutes');
      }
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${HIGGSFIELD_BASE}/image/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) {
        throw new Error(`Higgsfield poll ${poll.status}: ${(await poll.text()).slice(0, 400)}`);
      }
      job = (await poll.json()) as HiggsfieldJob;
    }
    if (job.status === 'failed') {
      throw new Error(`Higgsfield failed: ${job.error ?? 'unknown'}`);
    }
  }

  const imageUrl =
    job.result?.image_url ??
    job.result?.url ??
    job.result?.output_url ??
    job.output?.[0]?.url ??
    job.output?.[0]?.image_url;
  if (!imageUrl) {
    throw new Error(`Higgsfield returned no image url. Body: ${JSON.stringify(job).slice(0, 300)}`);
  }

  const fetched = await fetch(imageUrl);
  if (!fetched.ok) throw new Error(`fetch Higgsfield image failed (${fetched.status})`);
  const bytes = Buffer.from(await fetched.arrayBuffer());
  const ext = imageUrl.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1]?.toLowerCase() ?? 'png';
  const pathname = `library/renders/${args.ownerId}/${randomUUID()}.${ext}`;
  const stored = await putBlob(pathname, bytes);

  return {
    url: stored.url,
    pathname: stored.pathname,
    provider: 'higgsfield/nano-banana',
    fallback: false,
  };
}

function isTerminal(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'succeeded' || s === 'success' || s === 'completed' || s === 'done' || s === 'failed' || s === 'error';
}

// ---- OpenAI gpt-image-1 -----------------------------------------------------

async function generateViaOpenAi(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const useEdits = args.referenceImageUrls.length > 0;
  const url = useEdits
    ? 'https://api.openai.com/v1/images/edits'
    : 'https://api.openai.com/v1/images/generations';

  let body: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };

  if (useEdits) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', args.prompt);
    form.append('size', '1024x1536');
    form.append('quality', 'high');
    form.append('n', '1');
    for (let i = 0; i < args.referenceImageUrls.length; i++) {
      const ref = args.referenceImageUrls[i];
      const r = await fetch(ref);
      if (!r.ok) throw new Error(`failed to fetch reference image (${r.status})`);
      const blob = await r.blob();
      form.append('image[]', blob, `ref-${i}.png`);
    }
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      model: 'gpt-image-1',
      prompt: args.prompt,
      size: '1024x1536',
      quality: 'high',
      n: 1,
    });
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const first = data.data?.[0];
  if (!first) throw new Error('OpenAI returned no image');

  let bytes: Buffer;
  if (first.b64_json) {
    bytes = Buffer.from(first.b64_json, 'base64');
  } else if (first.url) {
    const r = await fetch(first.url);
    if (!r.ok) throw new Error(`failed to fetch generated image (${r.status})`);
    bytes = Buffer.from(await r.arrayBuffer());
  } else {
    throw new Error('OpenAI returned neither b64_json nor url');
  }

  const pathname = `library/renders/${args.ownerId}/${randomUUID()}.png`;
  const stored = await putBlob(pathname, bytes);
  return {
    url: stored.url,
    pathname: stored.pathname,
    provider: useEdits ? 'openai/gpt-image-1 (edits)' : 'openai/gpt-image-1',
    fallback: false,
  };
}
