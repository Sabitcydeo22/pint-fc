import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller } from '../../src/lib/poll';

function fakeVisibility(initial: 'visible' | 'hidden') {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    state: () => state,
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    set(next: 'visible' | 'hidden') {
      state = next;
      subs.forEach((cb) => cb());
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('poller', () => {
  it('RULE-6 poller runs every 10 s while visible and pauses when hidden', async () => {
    // visible: first run after 10 s, then every 10 s
    const vis = fakeVisibility('visible');
    const run = vi.fn(async () => undefined);
    const poller = createPoller({ run, visibility: vis });
    poller.start();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2);

    // hidden: nothing runs, however long it lasts
    vis.set('hidden');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);

    // becoming visible refetches at once, then goes back to every 10 s
    vis.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(4);

    // stop: no more runs, and visibility changes are ignored
    poller.stop();
    vis.set('hidden');
    vis.set('visible');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('RULE-6 poller started while hidden waits for visibility', async () => {
    const vis = fakeVisibility('hidden');
    const run = vi.fn(async () => undefined);
    createPoller({ run, visibility: vis }).start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(0);
    vis.set('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('RULE-6 after an error the poller waits 20 s, then returns to 10 s after a success', async () => {
    const vis = fakeVisibility('visible');
    let fail = true;
    const run = vi.fn(async () => {
      if (fail) throw new Error('network down');
    });
    createPoller({ run, visibility: vis }).start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1); // failed
    await vi.advanceTimersByTimeAsync(19_999);
    expect(run).toHaveBeenCalledTimes(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2); // succeeded after 20 s
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(3); // back to 10 s
  });

  it('RULE-6 a slow run is never overlapped by the next one', async () => {
    const vis = fakeVisibility('visible');
    const run = vi.fn(() => new Promise<void>(() => undefined)); // never finishes
    createPoller({ run, visibility: vis }).start();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
