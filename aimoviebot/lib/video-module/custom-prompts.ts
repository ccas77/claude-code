import { put, list } from "@vercel/blob";
import { DEFAULT_PROMPTS, type PromptKey } from "./prompts";

// User-editable prompt overrides. Stored in Blob with the same unique-URL-
// per-write pattern as job state, so reads always see the latest. One JSON
// document holds every override; reading is a single list+fetch.

type Overrides = Partial<Record<PromptKey, string>>;

const PREFIX = "prompts/overrides-";
const cache: { value: Overrides | null; loadedAt: number } = {
  value: null,
  loadedAt: 0,
};
// Per-function-invocation cache. Many stages render multiple prompts in
// one request; we don't need to re-fetch within ~5s.
const CACHE_MS = 5000;

async function readLatest(): Promise<Overrides> {
  try {
    const result = await list({ prefix: PREFIX });
    if (result.blobs.length === 0) return {};
    result.blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    );
    const latest = result.blobs[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) return {};
    return (await res.json()) as Overrides;
  } catch {
    return {};
  }
}

async function writeOverrides(overrides: Overrides): Promise<void> {
  await put(
    `${PREFIX}${Date.now()}.json`,
    JSON.stringify(overrides, null, 2),
    {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/json",
    },
  );
  cache.value = overrides;
  cache.loadedAt = Date.now();
}

export async function getOverrides(): Promise<Overrides> {
  if (cache.value && Date.now() - cache.loadedAt < CACHE_MS) {
    return cache.value;
  }
  const overrides = await readLatest();
  cache.value = overrides;
  cache.loadedAt = Date.now();
  return overrides;
}

// What a stage call site uses: returns the override if present, otherwise
// the default template. Awaited inside the render* helpers in prompts.ts.
export async function effectivePrompt(key: PromptKey): Promise<string> {
  const overrides = await getOverrides();
  return overrides[key] ?? DEFAULT_PROMPTS[key];
}

export async function setPromptOverride(
  key: PromptKey,
  value: string,
): Promise<Overrides> {
  const current = await readLatest();
  const next: Overrides = { ...current, [key]: value };
  await writeOverrides(next);
  return next;
}

export async function clearPromptOverride(key: PromptKey): Promise<Overrides> {
  const current = await readLatest();
  const next: Overrides = { ...current };
  delete next[key];
  await writeOverrides(next);
  return next;
}

// Forces the next effectivePrompt() call to bypass the in-process cache.
// Used after a save so renders pick up edits immediately.
export function invalidateCache(): void {
  cache.value = null;
  cache.loadedAt = 0;
}
