import { NextRequest, NextResponse } from 'next/server';
import { runAutoSchedule } from '@/lib/automation/scheduler';
import { cronUnauthorized } from '@/lib/clocks/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (cronUnauthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runAutoSchedule();
  return NextResponse.json({ ok: true, ...result });
}
