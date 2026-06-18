import { NextRequest, NextResponse } from 'next/server';
import { runAutoSchedule } from '@/lib/automation/scheduler';
import { mapError, ForbiddenError } from '@/lib/ownership';
import { UnauthorizedError } from '@/lib/owner';
import { auth } from '@/auth';
import { isPrimaryEmail } from '@/lib/owner-role';
import { londonNow } from '@/lib/time/london';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Dry-run the auto-scheduler against the current time and report per-config
 * decisions. Inserts nothing, posts nothing, just shows what runAutoSchedule
 * would do if it ran right now. Primary owner only.
 *
 * Optional query: ?simulate=HH:MM to probe a different time-of-day (London
 * local). Lets you ask "would the 17:00 window fire?" at 14:00.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const email = session?.user?.email?.toLowerCase();
    if (!email) throw new UnauthorizedError();
    if (!isPrimaryEmail(email)) {
      throw new ForbiddenError('Primary owner only.');
    }

    const sim = req.nextUrl.searchParams.get('simulate');
    let simulateMinutesOfDay: number | undefined;
    if (sim) {
      const m = sim.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) {
        return NextResponse.json(
          { error: 'simulate must be HH:MM' },
          { status: 400 },
        );
      }
      simulateMinutesOfDay = Number(m[1]) * 60 + Number(m[2]);
    }

    const now = new Date();
    const london = londonNow(now);
    const result = await runAutoSchedule({
      dryRun: true,
      simulateMinutesOfDay,
    });

    return NextResponse.json({
      nowUtc: now.toISOString(),
      londonNow: `${String(london.hour).padStart(2, '0')}:${String(london.minute).padStart(2, '0')}`,
      londonMinutesOfDay: london.minutesOfDay,
      simulating: sim ?? null,
      ...result,
    });
  } catch (e) {
    const { status, body } = mapError(e);
    return NextResponse.json(body, { status });
  }
}
