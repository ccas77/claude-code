import { NextResponse } from 'next/server';
import { disconnect } from '@/lib/higgsfield/oauth';
import { isPrimaryOwner } from '@/lib/owner-role';
import { mapError, ForbiddenError } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (!(await isPrimaryOwner())) {
      throw new ForbiddenError('Only the primary owner can manage Higgsfield.');
    }
    await disconnect();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
