import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const keys = [
    'OPENAI_API_KEY',
    'REPLICATE_API_TOKEN',
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'POSTBRIDGE_API_KEY',
    'POSTBRIDGE_API_KEY_SHARED',
    'RESEND_API_KEY',
    'BLOB_READ_WRITE_TOKEN',
    'DATABASE_URL',
    'OWNER_EMAIL_PRIMARY',
    'ALLOWED_EMAILS',
    'AUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'DRY_RUN',
    'CRON_SECRET',
  ];
  const status: Record<string, { present: boolean; length: number }> = {};
  for (const k of keys) {
    const v = process.env[k];
    status[k] = { present: typeof v === 'string' && v.length > 0, length: v?.length ?? 0 };
  }
  return NextResponse.json({ status });
}
