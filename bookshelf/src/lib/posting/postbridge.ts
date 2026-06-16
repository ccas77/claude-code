/**
 * post-bridge.com client.
 *
 * Endpoint shapes match the toolkit's verified usage:
 *   - GET  /v1/social-accounts?platform={platform}&limit=100
 *   - POST /v1/media/create-upload-url        (2-step: presign + PUT)
 *   - POST /v1/posts                           (caption + media[] + social_accounts[])
 *   - GET  /v1/post-results?limit=100
 *
 * 10 req/sec rate limit. fetchWithRetry handles 429 with exponential backoff.
 */

const PB_BASE = process.env.POSTBRIDGE_BASE_URL ?? 'https://api.post-bridge.com';

export type PostBridgePlatform =
  | 'tiktok'
  | 'instagram'
  | 'youtube'
  | 'x'
  | 'linkedin'
  | 'facebook'
  | 'pinterest'
  | 'threads'
  | 'bluesky';

export type PostBridgeAccount = {
  id: number;
  username: string;
  platform: PostBridgePlatform;
};

export type PostStats = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
};

/**
 * Pick the right Post Bridge API key for a user. Cordelia (the primary owner)
 * uses POSTBRIDGE_API_KEY; anyone else uses POSTBRIDGE_API_KEY_SHARED. The
 * email match is case-insensitive.
 */
export function getPostBridgeKeyForEmail(email: string | null | undefined): string {
  const primary = (process.env.OWNER_EMAIL_PRIMARY ?? '').toLowerCase();
  const owner = (email ?? '').toLowerCase();
  if (primary && owner && owner === primary) {
    const key = process.env.POSTBRIDGE_API_KEY;
    if (!key) {
      throw new Error('POSTBRIDGE_API_KEY not set (primary owner key).');
    }
    return key;
  }
  const shared = process.env.POSTBRIDGE_API_KEY_SHARED;
  if (!shared) {
    throw new Error('POSTBRIDGE_API_KEY_SHARED not set (friends key).');
  }
  return shared;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && retries > 0) {
    const waitMs = Math.pow(2, 3 - retries) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, init, retries - 1);
  }
  return res;
}

async function pb<T>(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetchWithRetry(`${PB_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `post-bridge ${path} ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  return res.json() as Promise<T>;
}

// ---- Accounts ---------------------------------------------------------------

export async function listAccounts(
  apiKey: string,
  platform: PostBridgePlatform,
): Promise<PostBridgeAccount[]> {
  const res = await pb<{ data?: { id: number; username: string }[] }>(
    `/v1/social-accounts?platform=${platform}&limit=100`,
    apiKey,
  );
  return (res.data ?? []).map((a) => ({ ...a, platform }));
}

export async function listAllAccounts(apiKey: string): Promise<PostBridgeAccount[]> {
  const platforms: PostBridgePlatform[] = [
    'tiktok',
    'instagram',
    'facebook',
    'youtube',
    'x',
    'linkedin',
    'pinterest',
    'threads',
    'bluesky',
  ];
  const results = await Promise.all(
    platforms.map((p) => listAccounts(apiKey, p).catch(() => [] as PostBridgeAccount[])),
  );
  return results.flat().sort((a, b) => {
    const byPlatform = a.platform.localeCompare(b.platform);
    if (byPlatform !== 0) return byPlatform;
    return a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
  });
}

// ---- Media upload (2-step) --------------------------------------------------

export async function uploadVideo(
  apiKey: string,
  videoUrl: string,
  fileName = 'render.mp4',
): Promise<string> {
  const sourceRes = await fetch(videoUrl);
  if (!sourceRes.ok) {
    throw new Error(`fetch video for upload failed (${sourceRes.status})`);
  }
  const bytes = Buffer.from(await sourceRes.arrayBuffer());

  const upload = await pb<{ upload_url: string; media_id: string }>(
    '/v1/media/create-upload-url',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify({
        name: fileName,
        mime_type: 'video/mp4',
        size_bytes: bytes.length,
      }),
    },
  );

  const putRes = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: new Uint8Array(bytes),
  });
  if (!putRes.ok) {
    throw new Error(
      `media S3 PUT failed: ${putRes.status} ${(await putRes.text()).slice(0, 200)}`,
    );
  }
  return upload.media_id;
}

// ---- Create post ------------------------------------------------------------

export type CreatePostArgs = {
  caption: string;
  mediaIds: string[];
  accountIds: number[];
  platform: PostBridgePlatform;
  scheduledAt?: string; // ISO string; omit for immediate
};

export type PublishedPost = {
  id: string;
};

export async function createPost(
  apiKey: string,
  args: CreatePostArgs,
): Promise<PublishedPost> {
  const platformConfig: Record<string, Record<string, unknown>> = {};
  if (args.platform === 'tiktok') {
    platformConfig.tiktok = { draft: false, is_aigc: true };
  } else {
    platformConfig[args.platform] = {};
  }

  const body: Record<string, unknown> = {
    caption: args.caption,
    media: args.mediaIds,
    social_accounts: args.accountIds,
    platform_configurations: platformConfig,
  };
  if (args.scheduledAt) body.scheduled_at = args.scheduledAt;

  const res = await pb<{ id?: string; data?: { id?: string } }>(
    '/v1/posts',
    apiKey,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
  const id = res.id ?? res.data?.id;
  if (!id) throw new Error('post-bridge created post but returned no id');
  return { id };
}

// ---- Results / stats --------------------------------------------------------

export type PostResult = {
  post_id: string;
  social_account_id: number;
  success: boolean;
  error: string | null;
  platform_data?: {
    id?: string;
    url?: string;
    username?: string;
  };
};

export async function getPostResults(apiKey: string): Promise<PostResult[]> {
  const res = await pb<{ data?: PostResult[] }>(
    `/v1/post-results?limit=100`,
    apiKey,
  );
  return res.data ?? [];
}

export function extractPostUrl(result: PostResult): string | null {
  if (result.platform_data?.url) return result.platform_data.url;
  const id = result.platform_data?.id;
  const username = result.platform_data?.username;
  if (id && username) {
    const match = id.match(/v2\.(\d+)/);
    if (match) return `https://www.tiktok.com/@${username}/photo/${match[1]}`;
  }
  return null;
}
