import crypto from "node:crypto";
import { higgsfieldStore, type TokenSet, type RegisteredClient } from "./higgsfield-store";

// Connect-Higgsfield OAuth (Authorization Code + PKCE + RFC 7591 Dynamic
// Client Registration).
//
// All discovery is runtime: GET /.well-known/oauth-authorization-server off
// the MCP origin. The MCP server supports DCR, so we don't need a pre-issued
// client_id — we register on first use and cache in Blob.

export const MCP_URL =
  process.env.HIGGSFIELD_MCP_URL ?? "https://mcp.higgsfield.ai/mcp";

const SCOPES = "openid email offline_access";

// Stable redirect URI. Higgsfield must see the SAME URL on every flow, so we
// derive it from VERCEL_PROJECT_PRODUCTION_URL (stable across deploys) and
// fall back to VERCEL_URL (per-deploy) for preview testing.
function appBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const preview = process.env.VERCEL_URL;
  if (preview) return `https://${preview}`;
  return "http://localhost:3000";
}

const redirectUri = () => `${appBaseUrl()}/api/oauth/higgsfield/callback`;

type DiscoveryDoc = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

let _discovery: DiscoveryDoc | null = null;
let _client: RegisteredClient | null = null;

async function discover(): Promise<DiscoveryDoc> {
  if (_discovery) return _discovery;
  const origin = new URL(MCP_URL).origin;
  const res = await fetch(`${origin}/.well-known/oauth-authorization-server`);
  if (!res.ok) {
    throw new Error(
      `OAuth discovery failed (${res.status}). The MCP origin does not expose ` +
        `a discovery doc. Set HIGGSFIELD_AUTHORIZE_URL/HIGGSFIELD_TOKEN_URL explicitly.`,
    );
  }
  _discovery = (await res.json()) as DiscoveryDoc;
  return _discovery;
}

async function getOrRegisterClient(): Promise<RegisteredClient> {
  if (process.env.HIGGSFIELD_OAUTH_CLIENT_ID) {
    return {
      clientId: process.env.HIGGSFIELD_OAUTH_CLIENT_ID,
      clientSecret: process.env.HIGGSFIELD_OAUTH_CLIENT_SECRET ?? undefined,
    };
  }
  if (_client) return _client;
  const cached = await higgsfieldStore.getClient();
  if (cached) {
    _client = cached;
    return cached;
  }
  const { registration_endpoint } = await discover();
  if (!registration_endpoint) {
    throw new Error(
      "MCP discovery doc has no registration_endpoint and HIGGSFIELD_OAUTH_CLIENT_ID is not set.",
    );
  }
  const res = await fetch(registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "AI Movie Bot",
      redirect_uris: [redirectUri()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: SCOPES,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Dynamic client registration failed: ${res.status} ${await res.text()}`,
    );
  }
  const reg = (await res.json()) as {
    client_id: string;
    client_secret?: string;
  };
  const registered: RegisteredClient = {
    clientId: reg.client_id,
    clientSecret: reg.client_secret,
  };
  await higgsfieldStore.putClient(registered);
  _client = registered;
  return registered;
}

export function makePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

export async function buildAuthorizeUrl(state: string, challenge: string): Promise<string> {
  const { authorization_endpoint } = await discover();
  const { clientId } = await getOrRegisterClient();
  const u = new URL(authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  const { token_endpoint } = await discover();
  const { clientId, clientSecret } = await getOrRegisterClient();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const t = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const tokens: TokenSet = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
  await higgsfieldStore.putTokens(tokens);
  return tokens;
}

async function refresh(tokens: TokenSet): Promise<TokenSet> {
  if (!tokens.refreshToken) {
    throw new Error("No refresh token; reconnect Higgsfield.");
  }
  const { token_endpoint } = await discover();
  const { clientId, clientSecret } = await getOrRegisterClient();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  });
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const t = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const next: TokenSet = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
  await higgsfieldStore.putTokens(next);
  return next;
}

// Public: returns a valid access token, refreshing if within 60s of expiry.
// Throws if no tokens are stored (user must run the Connect flow).
export async function getValidAccessToken(): Promise<string> {
  const tokens = await higgsfieldStore.getTokens();
  if (!tokens) {
    throw new HiggsfieldNotConnected();
  }
  if (Date.now() < tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }
  const next = await refresh(tokens);
  return next.accessToken;
}

export class HiggsfieldNotConnected extends Error {
  constructor() {
    super("Higgsfield not connected. Visit /api/oauth/higgsfield to connect.");
    this.name = "HiggsfieldNotConnected";
  }
}
