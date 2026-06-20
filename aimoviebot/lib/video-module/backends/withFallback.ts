import type { Backend } from "../types";

// One helper, used by every image/video stage. Tries the primary (Higgsfield)
// first; on ANY error — error response, timeout, missing creds, wrong model
// slug — runs the fallback (Gateway). Records which backend served the
// artifact so the orchestrator can persist it.

export type FallbackResult<T> = {
  result: T;
  servedBy: Backend;
  primaryError?: string;
};

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<FallbackResult<T>> {
  try {
    const result = await primary();
    return { result, servedBy: "higgsfield" };
  } catch (primaryErr) {
    const primaryMessage =
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    try {
      const result = await fallback();
      return { result, servedBy: "gateway", primaryError: primaryMessage };
    } catch (fallbackErr) {
      const fallbackMessage =
        fallbackErr instanceof Error
          ? fallbackErr.message
          : String(fallbackErr);
      throw new Error(
        `Both backends failed.\nPrimary (higgsfield): ${primaryMessage}\nFallback (gateway): ${fallbackMessage}`,
      );
    }
  }
}
