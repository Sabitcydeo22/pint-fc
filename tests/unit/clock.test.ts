import { describe, expect, it } from 'vitest';
import { createServerClock } from '../../src/lib/clock';

describe('server clock', () => {
  it('RULE-8 the browser clock is corrected to server time, whatever the device clock says', () => {
    const server = Date.parse('2026-11-14T21:59:00.000Z');

    // a phone running 1 hour fast
    let device = server + 3_600_000;
    const fast = createServerClock('2026-11-14T21:59:00.000Z', () => device);
    expect(fast.offsetMs).toBe(-3_600_000);
    expect(fast.now()).toBe(server);
    device += 60_000; // one real minute passes
    expect(fast.now()).toBe(server + 60_000);

    // a phone running 1 day slow
    let slowDevice = server - 86_400_000;
    const slow = createServerClock(new Date(server), () => slowDevice);
    expect(slow.now()).toBe(server);
    slowDevice += 5_000;
    expect(slow.now()).toBe(server + 5_000);

    // each API response re-syncs the offset (also accepts a number)
    slow.sync(server + 600_000);
    expect(slow.now()).toBe(server + 600_000);
    expect(slow.offsetMs).toBe(server + 600_000 - slowDevice);

    // a correct device gives offset 0
    const ok = createServerClock(server, () => server);
    expect(ok.offsetMs).toBe(0);

    // garbage from the server is refused, the old offset stays
    expect(() => ok.sync('not a date')).toThrow(RangeError);
    expect(ok.offsetMs).toBe(0);
  });
});
