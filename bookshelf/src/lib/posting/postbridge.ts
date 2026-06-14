import { requireKey } from '../config';

/**
 * post-bridge.com client.
 *
 * The app talks ONLY to post-bridge for posting; it never touches the
 * individual platform APIs. The user signs up at post-bridge, connects their
 * social accounts, and generates an API key. One post per platform per
 * account, per the post-bridge constraint.
 *
 * Endpoints below are the canonical post-bridge REST surface as of build
 * time. If post-bridge has shifted, swap them via the POSTBRIDGE_BASE_URL
 * env var without touching call sites.
 */

const BASE = process.env.POSTBRIDGE_BASE_URL ?? 'https://api.post-bridge.com/v1';

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

export type PublishedPost = {
  id: string;
  url: string | null;
};

export type PostStats = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
};

async function pb<T>(path: string, init: RequestInit): Promise<T> {
  const token = requireKey('POSTBRIDGE_API_KEY', 'post-bridge');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(
      `post-bridge ${path} ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  return res.json() as Promise<T>;
}

export async function publishToPlatform(args: {
  platform: PostBridgePlatform;
  accountHandle: string;
  videoUrl: string;
  caption: string;
}): Promise<PublishedPost> {
  const body = {
    platform: args.platform,
    account: args.accountHandle,
    media: { type: 'video', url: args.videoUrl },
    caption: args.caption,
    publish_at: 'now',
  };
  const res = await pb<{ id: string; url?: string | null }>(`/posts`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return { id: res.id, url: res.url ?? null };
}

export async function fetchPostStats(postId: string): Promise<PostStats> {
  const res = await pb<{ stats?: PostStats }>(`/posts/${postId}/stats`, {
    method: 'GET',
  });
  return res.stats ?? {};
}
