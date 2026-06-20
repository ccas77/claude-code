import { put, list } from "@vercel/blob";

// Token + dynamic-client storage for the Higgsfield OAuth flow.
// Single-user app, so a fixed prefix per record type. Each write creates a
// new unique URL (addRandomSuffix:true) and reads use list+sort-by-
// uploadedAt to find the latest — the same pattern as job state in
// storage.ts. Avoids Blob's 60s body CDN cache silently returning a
// stale null after token refresh.

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
};

export type RegisteredClient = {
  clientId: string;
  clientSecret?: string;
};

const TOKENS_PREFIX = "higgsfield/tokens-";
const CLIENT_PREFIX = "higgsfield/client-";

async function putLatest(prefix: string, data: unknown): Promise<void> {
  await put(
    `${prefix}${Date.now()}.json`,
    JSON.stringify(data),
    {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/json",
    },
  );
}

async function readLatest<T>(prefix: string): Promise<T | null> {
  try {
    const result = await list({ prefix });
    if (result.blobs.length === 0) return null;
    result.blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    const latest = result.blobs[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const higgsfieldStore = {
  getTokens: () => readLatest<TokenSet>(TOKENS_PREFIX),
  putTokens: (t: TokenSet) => putLatest(TOKENS_PREFIX, t),
  getClient: () => readLatest<RegisteredClient>(CLIENT_PREFIX),
  putClient: (c: RegisteredClient) => putLatest(CLIENT_PREFIX, c),
};
