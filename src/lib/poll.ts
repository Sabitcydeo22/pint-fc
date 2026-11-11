// Poller (docs/design/rules.md §8): refresh every 10 s while the page is visible, pause while it
// is hidden, refresh at once when it becomes visible, wait 20 s after an error, never overlap runs.
// The visibility source and intervals are injectable so tests need no browser.

export interface Visibility {
  state(): 'visible' | 'hidden';
  /** Calls back on every change; returns an unsubscribe function. */
  subscribe(callback: () => void): () => void;
}

export interface PollOptions {
  run: () => Promise<void>;
  visibility?: Visibility;
  intervalMs?: number;
  errorIntervalMs?: number;
}

export interface Poller {
  start(): void;
  stop(): void;
}

function browserVisibility(): Visibility {
  if (typeof document === 'undefined') return { state: () => 'visible', subscribe: () => () => undefined };
  return {
    state: () => (document.visibilityState === 'visible' ? 'visible' : 'hidden'),
    subscribe: (callback) => {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
  };
}

export function createPoller(options: PollOptions): Poller {
  const interval = options.intervalMs ?? 10_000;
  const errorInterval = options.errorIntervalMs ?? 20_000;
  const visibility = options.visibility ?? browserVisibility();

  let running = false;
  let inFlight = false;
  let lastFailed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clear();
    if (!running || visibility.state() !== 'visible') return;
    timer = setTimeout(() => void tick(), lastFailed ? errorInterval : interval);
  };

  async function tick(): Promise<void> {
    timer = undefined;
    if (!running || inFlight || visibility.state() !== 'visible') return;
    inFlight = true;
    try {
      await options.run();
      lastFailed = false;
    } catch {
      lastFailed = true;
    } finally {
      inFlight = false;
    }
    schedule();
  }

  const onVisibilityChange = () => {
    if (!running) return;
    clear();
    if (visibility.state() === 'visible') void tick();
  };

  return {
    start() {
      if (running) return;
      running = true;
      unsubscribe = visibility.subscribe(onVisibilityChange);
      schedule();
    },
    stop() {
      running = false;
      clear();
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}
