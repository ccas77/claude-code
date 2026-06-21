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
    if (result.blobs.length === 0) {
      console.log(`[higgsfield-store] list(${prefix}) returned 0 blobs`);
      return null;
    }
    result.blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    const latest = result.blobs[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) {
      console.log(
        `[higgsfield-store] fetch(${latest.pathname}) !ok ${res.status}`,
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.log(
      `[higgsfield-store] readLatest(${prefix}) threw: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

// In-process caches survive across requests on the SAME warm function
// instance (Fluid Compute reuses instances). They DON'T persist across
// cold starts, so they're a perf optimization, not the source of truth —
// every cache miss still reads Blob via readLatest above.
//
// Why we cache: Blob's list() metadata API is occasionally returning 0
// hits even when the blob exists, which manifests as a spurious
// "Higgsfield not connected" mid-session. Caching the token + client for
// the lifetime of the warm instance keeps a valid session live across
// any transient list() flake, with no risk of stale data: tokens are
// invalidated on putTokens (refresh / new auth), and the cached token's
// own expiresAt is checked downstream by getValidAccessToken so we
// never use a token past its lifetime.
let _tokensCache: TokenSet | null = null;
let _clientCache: RegisteredClient | null = null;

export const higgsfieldStore = {
  getTokens: async (): Promise<TokenSet | null> => {
    if (_tokensCache && Date.now() < _tokensCache.expiresAt - 60_000) {
      return _tokensCache;
    }
    const fresh = await readLatest<TokenSet>(TOKENS_PREFIX);
    if (fresh) _tokensCache = fresh;
    return fresh ?? _tokensCache; // fall back to last-known on transient null
  },
  putTokens: async (t: TokenSet) => {
    _tokensCache = t;
    await putLatest(TOKENS_PREFIX, t);
  },
  getClient: async (): Promise<RegisteredClient | null> => {
    if (_clientCache) return _clientCache;
    const fresh = await readLatest<RegisteredClient>(CLIENT_PREFIX);
    if (fresh) _clientCache = fresh;
    return fresh ?? _clientCache;
  },
  putClient: async (c: RegisteredClient) => {
    _clientCache = c;
    await putLatest(CLIENT_PREFIX, c);
  },
};
