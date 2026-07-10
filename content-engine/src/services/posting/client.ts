import { pbListResponseSchema, pbCreateResponseSchema, type PbPost } from "./types";

const PB_MIN_GAP_MS = 125; // ~8 req/s, under the 10 req/s cap
const MAX_PAGES = 200;
const MAX_429_RETRIES = 6;

interface ClientOptions {
  apiKey: string | undefined;
  baseUrl: string;
}

type FetchOpts = RequestInit & { allowRetry?: boolean };

export class PostBridgeClient {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  constructor(private opts: ClientOptions) {}

  private async doFetch(path: string, init: FetchOpts): Promise<Response> {
    if (!this.opts.apiKey) {
      throw new Error("POSTBRIDGE_API_KEY is not set; refusing to make a live call");
    }
    const url = `${this.opts.baseUrl}${path}`;
    const headers = {
      Authorization: `Bearer ${this.opts.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    const allowRetry = init.allowRetry !== false;

    for (let attempt = 0; attempt < MAX_429_RETRIES; attempt++) {
      const gap = this.lastStart + PB_MIN_GAP_MS - Date.now();
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      this.lastStart = Date.now();

      const res = await fetch(url, { ...init, headers });

      if (res.status !== 429) return res;
      // Rate limited. If retries are not allowed for this path, surface the 429.
      if (!allowRetry) return res;

      let resetMs = 1000;
      try {
        const body = await res.clone().json();
        const r = Number((body as { rate_limit?: { reset_ms?: number } })?.rate_limit?.reset_ms);
        if (Number.isFinite(r) && r > 0) resetMs = r;
      } catch {
        // ignore JSON parse
      }
      const wait = Math.min(Math.max(resetMs, 100), 5000);
      await new Promise((r) => setTimeout(r, wait));
      this.lastStart = Date.now();
    }
    throw new Error(`post-bridge ${path} 429: exceeded retry attempts`);
  }

  private request<T>(
    path: string,
    init: FetchOpts,
    parse: (raw: unknown) => T,
  ): Promise<T> {
    const run = async () => {
      const res = await this.doFetch(path, init);
      const text = await res.text();
      if (!res.ok) {
        throw new Error(
          `post-bridge ${init.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 300)}`,
        );
      }
      const raw = text ? JSON.parse(text) : {};
      return parse(raw);
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => {});
    return result;
  }

  // Iterate posts across pages. Client-side filter by social_account_id because
  // the ?social_account_id= query param is silently ignored by PB.
  async *iteratePosts(): AsyncGenerator<PbPost, void, void> {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      let parsed: { data: PbPost[] };
      try {
        parsed = await this.request(
          `/v1/posts?limit=100&offset=${offset}`,
          { method: "GET" },
          (raw) => pbListResponseSchema.parse(raw),
        );
      } catch (err) {
        // Deep pagination sometimes 500s; degrade gracefully rather than fail hard.
        const msg = err instanceof Error ? err.message : String(err);
        if (/\b5\d\d\b/.test(msg)) return;
        throw err;
      }
      const rows = parsed.data;
      for (const post of rows) yield post;
      if (rows.length < 100) return;
      offset += 100;
    }
  }

  // POST /v1/posts is NEVER retried on failure (duplicate-post incident 2026-05-08).
  // We still let the throttler self-pace, but a 429 here surfaces as an error
  // rather than kicking off automatic retries.
  async createPost(body: {
    caption: string;
    media: string[];
    social_accounts: string[];
    platform_configurations?: Record<string, unknown>;
    scheduled_at?: string;
    idempotency_key: string;
  }): Promise<{ id: string | null; raw: unknown }> {
    return this.request(
      "/v1/posts",
      {
        method: "POST",
        body: JSON.stringify(body),
        allowRetry: false,
        headers: { "Idempotency-Key": body.idempotency_key },
      },
      (raw) => {
        const parsed = pbCreateResponseSchema.parse(raw);
        return { id: parsed.id ?? parsed.data?.id ?? null, raw };
      },
    );
  }
}
