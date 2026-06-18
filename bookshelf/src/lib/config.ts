import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required - see .env.example'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  WHISPER_PROVIDER: z.enum(['openai', 'replicate', 'local']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),

  VISION_PROVIDER: z.enum(['gemini', 'claude']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  IMAGE_PROVIDER_PRIMARY: z.enum(['gemini', 'higgsfield', 'gateway']).default('higgsfield'),
  IMAGE_PROVIDER_FALLBACK: z.enum(['gemini', 'higgsfield', 'gateway', '']).default('gateway'),
  HIGGSFIELD_API_KEY: z.string().optional(),

  VIDEO_PROVIDER_PRIMARY: z.string().default('higgsfield'),
  VIDEO_PROVIDER_FALLBACK: z.string().default(''),

  POSTBRIDGE_API_KEY: z.string().optional(),

  NOTIFY_CHANNEL: z.enum(['email', 'none']).default('none'),
  RESEND_API_KEY: z.string().optional(),
  NOTIFY_EMAIL_TO: z.string().email().optional(),

  LEAD_TIME_HOURS: z.coerce.number().int().positive().default(3),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}\n\nSee .env.example`);
  }
  cached = parsed.data;
  return cached;
}

export function requireKey<K extends keyof Env>(key: K, providerName: string): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Missing ${String(key)} - required for ${providerName}. Add it to .env.local or your Vercel project settings.`,
    );
  }
  return value as NonNullable<Env[K]>;
}
