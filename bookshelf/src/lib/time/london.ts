/**
 * London-local time helpers for the scheduler. Posting windows are entered in
 * Europe/London time so summer/winter clock changes are handled automatically;
 * everything in storage and in cron logic flows through these helpers instead
 * of raw UTC.
 */

export type LondonNow = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  minutesOfDay: number;
  offsetMinutes: number; // London - UTC, in minutes (60 in BST, 0 in GMT)
};

export function londonNow(at: Date = new Date()): LondonNow {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const minute = get('minute');

  const londonAsIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = Math.round((londonAsIfUtc - at.getTime()) / 60000);

  return {
    year,
    month,
    day,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    offsetMinutes,
  };
}

/**
 * Convert "HH:MM" interpreted as today (in London) to a real Date in UTC.
 */
export function londonHHMMToUtc(hhmm: string, ref: LondonNow): Date {
  const [hh, mm] = hhmm.split(':');
  const hour = Number(hh) || 0;
  const minute = Number(mm) || 0;
  const ms =
    Date.UTC(ref.year, ref.month - 1, ref.day, hour, minute) -
    ref.offsetMinutes * 60_000;
  return new Date(ms);
}

export function parseHourMinute(hhmm: string): { hour: number; minute: number } {
  const [hh, mm] = hhmm.split(':');
  return { hour: Number(hh) || 0, minute: Number(mm) || 0 };
}
