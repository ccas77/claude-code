import { NextResponse } from 'next/server';
import { disconnect } from '@/lib/higgsfield/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await disconnect();
  return NextResponse.json({ ok: true });
}
