// Time and cutoff rules (docs/design/rules.md §1). The ONLY place the club time zone and the
// cutoff length are written down. SQL mirror: core.rsvp_cutoff / core.rsvp_is_open
// (supabase/migrations/0002_time_rules.sql); a parity test keeps the two identical.

export const CLUB_TZ = 'America/New_York';
/** RSVP closes this long before kickoff, in exact real time (never calendar arithmetic). */
export const RSVP_CUTOFF_MS = 2 * 60 * 60 * 1000;

export type MatchStatus = 'scheduled' | 'cancelled' | 'played';
export type Instant = Date | string | number;
export type Countdown =
  | { kickedOff: true }
  | { kickedOff: false; days: number; hours: number; minutes: number; seconds: number };

// A string must say which zone it is in (Z or an offset). A bare "2026-11-14T19:00" would be
// read in the device's zone, which is exactly the bug this module exists to prevent.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;

/** Milliseconds since the epoch for a Date, a number, or an ISO string with a zone. Throws RangeError. */
export function toMs(instant: Instant): number {
  let ms: number;
  if (instant instanceof Date) ms = instant.getTime();
  else if (typeof instant === 'number') ms = instant;
  else ms = ISO_WITH_ZONE.test(instant) ? Date.parse(instant) : Number.NaN;
  if (!Number.isFinite(ms)) throw new RangeError('Invalid instant');
  return ms;
}

/** The moment RSVP closes: kickoff minus exactly 2 hours. */
export function rsvpCutoff(kickoff: Instant): Date {
  return new Date(toMs(kickoff) - RSVP_CUTOFF_MS);
}

/** Open only for a scheduled match and strictly before the cutoff (at the cutoff it is closed). */
export function isRsvpOpen(args: { now: Instant; kickoff: Instant; status: MatchStatus }): boolean {
  const now = toMs(args.now);
  const cutoff = toMs(args.kickoff) - RSVP_CUTOFF_MS;
  return args.status === 'scheduled' && now < cutoff;
}

const kickoffFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

/** "Sat 14 Nov, 7:00 PM EST": club time zone with its label (EST or EDT), whatever the viewer's device says. */
export function formatKickoff(instant: Instant): string {
  const p: Record<string, string> = {};
  for (const part of kickoffFormat.formatToParts(new Date(toMs(instant)))) p[part.type] = part.value;
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}

/** Time left until kickoff, from the two absolute instants. Never negative: at or after kickoff it is `kickedOff`. */
export function countdown(now: Instant, kickoff: Instant): Countdown {
  const diff = toMs(kickoff) - toMs(now);
  if (diff <= 0) return { kickedOff: true };
  const total = Math.floor(diff / 1000);
  return {
    kickedOff: false,
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}
