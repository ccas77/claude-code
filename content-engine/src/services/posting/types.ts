import { z } from "zod";

export const platformSchema = z.enum(["tiktok", "instagram", "facebook", "pinterest"]);
export type Platform = z.infer<typeof platformSchema>;

export const postSpecSchema = z.object({
  workspaceId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  socialAccountId: z.string().uuid(),
  mediaUrls: z.array(z.string().url()).min(1),
  caption: z.string().default(""),
  idempotencyKey: z.string().min(8),
  scheduledAt: z.string().datetime().optional(),
});
export type PostSpec = z.infer<typeof postSpecSchema>;

// Raw shape of a Post Bridge post as returned by GET /v1/posts.
// Only the fields we rely on are validated; extras pass through.
export const pbPostSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    caption: z.string().optional().default(""),
    social_accounts: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]).transform(String),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    created_at: z.string().optional(),
    scheduled_at: z.string().optional(),
  })
  .passthrough();
export type PbPost = z.infer<typeof pbPostSchema>;

export const pbListResponseSchema = z
  .object({
    data: z.array(pbPostSchema).default([]),
    rate_limit: z
      .object({ reset_ms: z.number().optional() })
      .passthrough()
      .optional(),
    meta: z.object({ total: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();

export const pbCreateResponseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String).optional(),
    data: z
      .object({
        id: z.union([z.string(), z.number()]).transform(String).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface VerificationResult {
  status: "verified" | "unverified" | "not_found";
  pagesScanned: number;
  matchedPost: PbPost | null;
  reason?: string;
}

export interface SubmitResult {
  postLogId: string;
  dryRun: boolean;
  status: "dry_run" | "submitted" | "verified" | "unverified" | "failed";
  pbPostId: string | null;
  verification: VerificationResult | null;
  error: string | null;
}
