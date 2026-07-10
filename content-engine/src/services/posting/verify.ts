import { PostBridgeClient } from "./client";
import type { VerificationResult } from "./types";

// Verify by walking the post list and matching client-side. PB's
// ?social_account_id= query filter is silently ignored (2026-06-26 incident),
// so we walk pages and check social_accounts[] on each row ourselves.
export async function verifyCreation(
  client: PostBridgeClient,
  pbAccountId: string,
  pbPostId: string,
  maxPagesToScan = 3,
): Promise<VerificationResult> {
  let pagesScanned = 0;
  let sawAccountRow = false;
  const iter = client.iteratePosts();
  const perPage = 100;
  let seen = 0;

  for await (const post of iter) {
    seen += 1;
    if (seen % perPage === 1) pagesScanned += 1;
    if (pagesScanned > maxPagesToScan) break;

    const belongsToAccount = post.social_accounts.some((sa) => sa.id === pbAccountId);
    if (belongsToAccount) sawAccountRow = true;
    if (post.id === pbPostId && belongsToAccount) {
      return {
        status: "verified",
        pagesScanned,
        matchedPost: post,
      };
    }
  }

  return {
    status: sawAccountRow ? "unverified" : "not_found",
    pagesScanned,
    matchedPost: null,
    reason: sawAccountRow
      ? "post id not found in the first pages of the account's feed"
      : "no posts for this social account were returned in the scanned pages",
  };
}
