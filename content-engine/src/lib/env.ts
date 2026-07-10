import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
  POSTBRIDGE_API_KEY: z.string().min(1).optional(),
  POSTBRIDGE_BASE_URL: z.string().url().default("https://api.post-bridge.com"),
  POSTBRIDGE_DRY_RUN: z.enum(["1", "0", "true", "false"]).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid env: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

// DRY_RUN default rule: if POSTBRIDGE_DRY_RUN is set, honour it; else dry-run
// unless a POSTBRIDGE_API_KEY is present. Spec §7 M1: "DRY_RUN mode from day one."
export function postbridgeDryRun(): boolean {
  const flag = process.env.POSTBRIDGE_DRY_RUN;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return !process.env.POSTBRIDGE_API_KEY;
}
