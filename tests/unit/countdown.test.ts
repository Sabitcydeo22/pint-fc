import { describe, expect, it } from 'vitest';
import { createServerClock } from '../../src/lib/clock';
import { countdownView } from '../../src/components/NextMatch';

const SERVER_NOW = '2026-11-14T12:00:00.000Z';
// 1 day, 2 hours, 3 minutes, 4 seconds after SERVER_NOW
const KICKOFF = new Date(Date.parse(SERVER_NOW) + ((24 + 2) * 3600 + 3 * 60 + 4) * 1000).toISOString();

describe('next-match countdown view', () => {
  it('AC-2.1.3 [unit] countdown ticks down every second', () => {
    let device = Date.parse('2026-11-14T08:00:00.000Z'); // the phone clock is 4 h wrong: only the server clock counts
    const clock = createServerClock(SERVER_NOW, () => device);

    const first = countdownView(clock.now(), KICKOFF);
    expect(first).toMatchObject({ kickedOff: false, days: '1', hours: '02', minutes: '03', seconds: '04' });
    expect(first.text).toBe('1d 02h 03m 04s');

    const seen: string[] = [first.text];
    for (let i = 0; i < 5; i++) {
      device += 1000;
      seen.push(countdownView(clock.now(), KICKOFF).text);
    }
    expect(seen).toEqual(['1d 02h 03m 04s', '1d 02h 03m 03s', '1d 02h 03m 02s', '1d 02h 03m 01s', '1d 02h 03m 00s', '1d 02h 02m 59s']);
  });

  it('AC-2.1.4 [unit] countdown at kickoff shows Kicked off and never goes negative', () => {
    const kickoff = Date.parse(KICKOFF);
    const justBefore = countdownView(kickoff - 1000, KICKOFF);
    expect(justBefore).toMatchObject({ kickedOff: false, days: '0', hours: '00', minutes: '00', seconds: '01' });

    for (const now of [kickoff, kickoff + 1, kickoff + 5000, kickoff + 90 * 86_400_000]) {
      const v = countdownView(now, KICKOFF);
      expect(v.kickedOff, `now = kickoff + ${now - kickoff} ms`).toBe(true);
      expect(v.text).toBe('Kicked off');
      expect(v.text).not.toContain('-');
      expect([v.days, v.hours, v.minutes, v.seconds]).toEqual(['0', '00', '00', '00']);
    }
  });
});
