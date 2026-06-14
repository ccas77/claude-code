import { env } from '../config';

/**
 * Failure notifications via Resend.
 *
 * The app runs unattended, so it must surface its own breakage. This is
 * called whenever a card lands in Failed (after fallbacks were exhausted)
 * and once-per-day on the upkeep clock if anything is still broken.
 *
 * DRY_RUN and missing keys both short-circuit to a no-op + event log line,
 * never throws. We don't want a notification failure to mask the underlying
 * card error.
 */

export type Notification = {
  subject: string;
  text: string;
};

export async function sendFailureEmail(n: Notification): Promise<{ sent: boolean; reason?: string }> {
  const cfg = env();
  if (cfg.DRY_RUN) return { sent: false, reason: 'dry-run' };
  if (cfg.NOTIFY_CHANNEL !== 'email') return { sent: false, reason: 'channel not email' };
  if (!cfg.RESEND_API_KEY || !cfg.NOTIFY_EMAIL_TO) {
    return { sent: false, reason: 'resend key or email missing' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Bookshelf <bookshelf@resend.dev>',
      to: [cfg.NOTIFY_EMAIL_TO],
      subject: n.subject,
      text: n.text,
    }),
  });

  if (!res.ok) {
    return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  return { sent: true };
}
