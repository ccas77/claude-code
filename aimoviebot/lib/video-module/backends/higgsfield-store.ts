import { put, head } from "@vercel/blob";

// Token + dynamic-client storage for the Higgsfield OAuth flow.
// Single-user app, so a fixed Blob key per record is fine; no fan-out.

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
};

export type RegisteredClient = {
  clientId: string;
  clientSecret?: string;
};

const TOKENS_KEY = "higgsfield/tokens.json";
const CLIENT_KEY = "higgsfield/client.json";

async function putJSON(key: string, data: unknown) {
  await put(key, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const meta = await head(key);
    const res = await fetch(meta.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const higgsfieldStore = {
  getTokens: () => getJSON<TokenSet>(TOKENS_KEY),
  putTokens: (t: TokenSet) => putJSON(TOKENS_KEY, t),
  getClient: () => getJSON<RegisteredClient>(CLIENT_KEY),
  putClient: (c: RegisteredClient) => putJSON(CLIENT_KEY, c),
};
