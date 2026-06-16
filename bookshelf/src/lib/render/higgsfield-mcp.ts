import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { putBlob } from '../storage';
import { getAccessToken, HIGGSFIELD_BASE } from '../higgsfield/oauth';

/**
 * Higgsfield MCP client - calls generate_image then polls job_status with
 * sync=true until terminal. Auth comes from our OAuth helper, which holds
 * the access/refresh tokens in mcp_tokens and rotates them transparently.
 */

const ENDPOINT = `${HIGGSFIELD_BASE}/mcp`;

type ContentPart = {
  type?: string;
  text?: string;
};

type CallToolResult = {
  content?: ContentPart[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error(
      'Higgsfield is not connected. Visit /api/auth/higgsfield/start to authorize.',
    );
  }
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client(
    { name: 'bookshelf', version: '0.1.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export type HiggsfieldImage = {
  url: string;
  pathname: string;
  provider: string;
};

export async function generateImageViaHiggsfieldMcp(args: {
  prompt: string;
  referenceImageUrls: string[];
  ownerId: string;
}): Promise<HiggsfieldImage> {
  return withClient(async (client) => {
    // Higgsfield refuses raw URLs in params.medias - each one must first be
    // imported via media_import_url to get an internal media_id.
    const mediaIds: string[] = [];
    for (const url of args.referenceImageUrls) {
      const imported = (await client.callTool({
        name: 'media_import_url',
        arguments: { url, type: 'image' },
      })) as CallToolResult;
      if (imported.isError) {
        const text = imported.content?.find((c) => c.text)?.text;
        throw new Error(
          `Higgsfield media_import_url: ${text?.slice(0, 400) ?? 'unknown'}`,
        );
      }
      const id = pickMediaId(imported);
      if (!id) {
        throw new Error(
          `Higgsfield media_import_url returned no media_id: ${JSON.stringify(imported).slice(0, 300)}`,
        );
      }
      mediaIds.push(id);
    }

    // generate_image starts the job; we get a job UUID back.
    const created = (await client.callTool({
      name: 'generate_image',
      arguments: {
        params: {
          prompt: args.prompt,
          model: 'nano_banana_pro',
          aspect_ratio: '9:16',
          ...(mediaIds.length
            ? { medias: mediaIds.map((id) => ({ value: id, role: 'image' })) }
            : {}),
        },
      },
    })) as CallToolResult;

    if (created.isError) {
      const text = created.content?.find((c) => c.text)?.text;
      throw new Error(`Higgsfield generate_image: ${text?.slice(0, 400) ?? 'unknown'}`);
    }

    const jobId = pickJobId(created);
    if (!jobId) {
      throw new Error(
        `Higgsfield returned no job id: ${JSON.stringify(created).slice(0, 300)}`,
      );
    }

    // Poll job_status with sync=true (server holds for ~25s per call).
    const deadline = Date.now() + 4 * 60 * 1000;
    let imageUrl: string | undefined;
    while (Date.now() < deadline) {
      const status = (await client.callTool({
        name: 'job_status',
        arguments: { jobId, sync: true },
      })) as CallToolResult;

      const { status: s, url } = parseJobStatus(status);
      if (url) {
        imageUrl = url;
        break;
      }
      if (s === 'failed' || s === 'cancelled' || s === 'error') {
        throw new Error(`Higgsfield job ${s}`);
      }
      // Otherwise: pending/processing - loop and let server hold the call.
    }
    if (!imageUrl) {
      throw new Error('Higgsfield generate_image timed out after 4 minutes');
    }

    const fetched = await fetch(imageUrl);
    if (!fetched.ok) throw new Error(`fetch image (${fetched.status})`);
    const bytes = Buffer.from(await fetched.arrayBuffer());
    const ext = imageUrl.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1]?.toLowerCase() ?? 'png';
    const pathname = `library/renders/${args.ownerId}/${randomUUID()}.${ext}`;
    const stored = await putBlob(pathname, bytes);

    return {
      url: stored.url,
      pathname: stored.pathname,
      provider: 'higgsfield/nano-banana',
    };
  });
}

function pickMediaId(res: CallToolResult): string | null {
  const sc = res.structuredContent ?? {};
  const fromText = parseTextContent(res.content);
  const merged = { ...fromText, ...sc };
  return (
    pickString(merged, ['media_id', 'mediaId', 'id']) ??
    null
  );
}

function pickJobId(res: CallToolResult): string | null {
  const sc = res.structuredContent ?? {};
  const fromText = parseTextContent(res.content);
  const merged = { ...fromText, ...sc };
  const direct = pickString(merged, ['job_id', 'jobId']);
  if (direct) return direct;
  for (const key of ['results', 'result', 'images', 'data']) {
    const v = (merged as Record<string, unknown>)[key];
    const items = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
    for (const item of items) {
      if (item && typeof item === 'object') {
        const id = pickString(item as Record<string, unknown>, ['id', 'job_id', 'jobId']);
        if (id) return id;
      }
    }
  }
  return null;
}

function parseJobStatus(res: CallToolResult): { status: string; url?: string } {
  const sc = res.structuredContent ?? {};
  const fromText = parseTextContent(res.content);
  const merged = { ...fromText, ...sc };
  const gen =
    (merged.generation && typeof merged.generation === 'object'
      ? (merged.generation as Record<string, unknown>)
      : undefined) ?? null;
  const status =
    pickString(merged, ['status', 'state']) ??
    (gen ? pickString(gen, ['status', 'state']) : undefined) ??
    'unknown';
  let url: string | undefined =
    pickString(merged, ['image_url', 'imageUrl', 'url']) ?? undefined;
  if (!url && gen?.results && typeof gen.results === 'object') {
    url = pickString(gen.results as Record<string, unknown>, [
      'rawUrl',
      'url',
      'minUrl',
      'image_url',
      'imageUrl',
    ]);
  }
  return { status, url };
}

function parseTextContent(content?: ContentPart[]): Record<string, unknown> {
  if (!content) return {};
  for (const c of content) {
    if (c.type !== 'text' || !c.text) continue;
    try {
      const parsed = JSON.parse(c.text);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // not json
    }
  }
  return {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}
