import { NextResponse } from 'next/server';
import {
  listAllAccounts,
  getPostBridgeKeyForEmail,
} from '@/lib/posting/postbridge';
import { auth } from '@/auth';
import { mapError } from '@/lib/ownership';
import { UnauthorizedError } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) throw new UnauthorizedError();
    const apiKey = getPostBridgeKeyForEmail(email);
    const accounts = await listAllAccounts(apiKey);
    return NextResponse.json({ accounts });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
