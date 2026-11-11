import { describe, expect, it } from 'vitest';
import { CLUB_TZ, countdown, formatKickoff, isRsvpOpen, rsvpCutoff } from '../../src/lib/time';
import { CUTOFF_CASES } from './cutoff-cases';

describe('time rules', () => {
  it('AC-2.1.6 kickoff is shown in America/New_York with zone label across DST changes', () => {
    expect(CLUB_TZ).toBe('America/New_York');
    expect(formatKickoff('2026-11-15T00:00:00.000Z')).toBe('Sat 14 Nov, 7:00 PM EST');
    expect(formatKickoff('2026-10-31T23:00:00.000Z')).toBe('Sat 31 Oct, 7:00 PM EDT');
    expect(formatKickoff('2027-03-14T06:59:00.000Z')).toBe('Sun 14 Mar, 1:59 AM EST');
    expect(formatKickoff('2027-03-14T07:30:00.000Z')).toBe('Sun 14 Mar, 3:30 AM EDT');
    expect(formatKickoff('2027-11-07T07:00:00.000Z')).toBe('Sun 7 Nov, 2:00 AM EST');

    // the viewer's own device time zone never changes the text
    const saved = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        expect(formatKickoff('2026-11-15T00:00:00.000Z'), `device zone ${tz}`).toBe('Sat 14 Nov, 7:00 PM EST');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }

    // the countdown uses the absolute instant: 3 real hours across the spring-forward gap
    expect(countdown('2027-03-14T05:00:00.000Z', '2027-03-14T08:00:00.000Z')).toEqual({
      kickedOff: false,
      days: 0,
      hours: 3,
      minutes: 0,
      seconds: 0,
    });
  });

  it('RULE-1 TypeScript and SQL cutoff agree on every case (parity)', () => {
    // unit half: the TypeScript rules against the shared table (the SQL half is in tests/db/rules.test.ts)
    expect(CUTOFF_CASES.length).toBeGreaterThanOrEqual(30);
    const wrong: string[] = [];
    for (const c of CUTOFF_CASES) {
      const cutoff = rsvpCutoff(c.kickoff).toISOString();
      const open = isRsvpOpen({ now: c.now, kickoff: c.kickoff, status: c.status });
      if (cutoff !== c.cutoff) wrong.push(`${c.name}: cutoff ${cutoff}, expected ${c.cutoff}`);
      if (open !== c.open) wrong.push(`${c.name}: open ${open}, expected ${c.open}`);
    }
    expect(wrong).toEqual([]);
  });

  it('RULE-2 DST: cutoff and display around 14 Mar 2027, 7 Nov 2027 and 1 Nov 2026', () => {
    const rows = [
      // the cutoff is 2 REAL hours earlier, so the clock on the wall can differ by 1 or 3 hours
      { kickoff: '2027-03-14T07:30:00.000Z', cutoff: '2027-03-14T05:30:00.000Z', k: 'Sun 14 Mar, 3:30 AM EDT', c: 'Sun 14 Mar, 12:30 AM EST' },
      { kickoff: '2027-11-07T07:00:00.000Z', cutoff: '2027-11-07T05:00:00.000Z', k: 'Sun 7 Nov, 2:00 AM EST', c: 'Sun 7 Nov, 1:00 AM EDT' },
      { kickoff: '2026-11-01T06:30:00.000Z', cutoff: '2026-11-01T04:30:00.000Z', k: 'Sun 1 Nov, 1:30 AM EST', c: 'Sun 1 Nov, 12:30 AM EDT' },
      { kickoff: '2026-11-15T00:00:00.000Z', cutoff: '2026-11-14T22:00:00.000Z', k: 'Sat 14 Nov, 7:00 PM EST', c: 'Sat 14 Nov, 5:00 PM EST' },
      { kickoff: '2027-07-10T23:00:00.000Z', cutoff: '2027-07-10T21:00:00.000Z', k: 'Sat 10 Jul, 7:00 PM EDT', c: 'Sat 10 Jul, 5:00 PM EDT' },
    ];
    for (const r of rows) {
      const cutoff = rsvpCutoff(r.kickoff);
      expect(cutoff.toISOString()).toBe(r.cutoff);
      expect(formatKickoff(r.kickoff)).toBe(r.k);
      expect(formatKickoff(cutoff)).toBe(r.c);
      expect(isRsvpOpen({ now: new Date(cutoff.getTime() - 1), kickoff: r.kickoff, status: 'scheduled' })).toBe(true);
      expect(isRsvpOpen({ now: cutoff, kickoff: r.kickoff, status: 'scheduled' })).toBe(false);
    }
  });

  it('RULE-3 cutoff boundary: closed at exactly kickoff minus 2 h, open 1 ms before', () => {
    const kickoff = '2026-11-15T00:00:00.000Z';
    const open = (now: string, status: 'scheduled' | 'cancelled' | 'played' = 'scheduled') =>
      isRsvpOpen({ now, kickoff, status });
    expect(open('2026-11-14T21:59:59.999Z')).toBe(true);
    expect(open('2026-11-14T22:00:00.000Z')).toBe(false);
    expect(open('2026-11-14T22:00:00.001Z')).toBe(false);
    expect(open('2026-11-14T12:00:00.000Z', 'cancelled')).toBe(false);
    expect(open('2026-11-14T12:00:00.000Z', 'played')).toBe(false);

    // Date, number (ms) and ISO string inputs all mean the same instant
    const ms = Date.parse(kickoff);
    expect(rsvpCutoff(new Date(ms)).getTime()).toBe(ms - 7_200_000);
    expect(rsvpCutoff(ms).getTime()).toBe(ms - 7_200_000);
    expect(rsvpCutoff(kickoff).getTime()).toBe(ms - 7_200_000);

    // garbage is an error, never a silent "open"
    expect(() => rsvpCutoff('not a date')).toThrow(RangeError);
    expect(() => isRsvpOpen({ now: 'nope', kickoff, status: 'scheduled' })).toThrow(RangeError);
  });

  it('RULE-7 countdown counts down from the absolute instant, clamps at kickoff and is never negative', () => {
    const kickoff = '2026-11-15T00:00:00.000Z';
    const minus = (ms: number) => new Date(Date.parse(kickoff) - ms);
    const d = 86_400_000;
    expect(countdown(minus(2 * d + 3 * 3_600_000 + 4 * 60_000 + 5_000), kickoff)).toEqual({
      kickedOff: false,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
    expect(countdown(minus(999), kickoff)).toEqual({ kickedOff: false, days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(countdown(minus(0), kickoff)).toEqual({ kickedOff: true });
    expect(countdown(minus(-1), kickoff)).toEqual({ kickedOff: true });
    expect(countdown(minus(-10 * d), kickoff)).toEqual({ kickedOff: true });
    for (const ms of [-5, 0, 1, 1_000, 59_999, 86_400_000, 123_456_789]) {
      const c = countdown(minus(ms), kickoff);
      if (!c.kickedOff) {
        expect([c.days, c.hours, c.minutes, c.seconds].every((n) => n >= 0 && Number.isInteger(n))).toBe(true);
      }
    }
  });
});
