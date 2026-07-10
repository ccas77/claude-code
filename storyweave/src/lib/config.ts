import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required - see .env.example'),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),

  SCRIPT_MODEL: z.string().default('google/gemini-2.5-flash'),
  IMAGE_MODEL: z.string().default('google/gemini-2.5-flash-image-preview'),

  OPENAI_API_KEY: z.string().optional(),
  TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  TTS_VOICE: z.string().default('alloy'),
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
