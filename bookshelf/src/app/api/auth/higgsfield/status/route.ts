import { NextResponse } from 'next/server';
import { isConnected } from '@/lib/higgsfield/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const connected = await isConnected();
    return NextResponse.json({ connected });
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: e instanceof Error ? e.message : 'failed' },
      { status: 200 },
    );
  }
}
