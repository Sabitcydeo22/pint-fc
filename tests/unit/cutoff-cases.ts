// ONE table of cutoff cases, shared by the TypeScript test (tests/unit/time.test.ts) and the
// SQL parity test (tests/db/rules.test.ts). Expected cutoffs are written out by hand, never
// computed with the code under test.

export type Status = 'scheduled' | 'cancelled' | 'played';

export interface CutoffCase {
  name: string;
  kickoff: string; // ISO UTC
  status: Status;
  now: string; // ISO UTC
  cutoff: string; // ISO UTC, hand-written: kickoff minus exactly 2 real hours
  open: boolean;
}

/** Kickoffs with their hand-written cutoff (kickoff - 2 h of real time). */
const KICKOFFS = [
  { label: 'evening in EST', kickoff: '2026-11-15T00:00:00.000Z', cutoff: '2026-11-14T22:00:00.000Z' },
  { label: 'summer evening in EDT', kickoff: '2027-07-10T23:00:00.000Z', cutoff: '2027-07-10T21:00:00.000Z' },
  { label: 'spring forward 14 Mar 2027', kickoff: '2027-03-14T07:30:00.000Z', cutoff: '2027-03-14T05:30:00.000Z' },
  { label: 'fall back 7 Nov 2027', kickoff: '2027-11-07T07:00:00.000Z', cutoff: '2027-11-07T05:00:00.000Z' },
  { label: 'fall back 1 Nov 2026', kickoff: '2026-11-01T06:30:00.000Z', cutoff: '2026-11-01T04:30:00.000Z' },
  { label: 'milliseconds kept', kickoff: '2027-01-01T00:00:00.123Z', cutoff: '2026-12-31T22:00:00.123Z' },
] as const;

/** Offsets from the cutoff and whether the RSVP is open then (scheduled match). */
const OFFSETS: { label: string; ms: number; open: boolean }[] = [
  { label: '1 hour before cutoff', ms: -3_600_000, open: true },
  { label: '1 ms before cutoff', ms: -1, open: true },
  { label: 'exactly at cutoff', ms: 0, open: false },
  { label: '1 ms after cutoff', ms: 1, open: false },
  { label: '1 hour after cutoff', ms: 3_600_000, open: false },
];

const shift = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

export const CUTOFF_CASES: CutoffCase[] = [
  ...KICKOFFS.flatMap((k) =>
    OFFSETS.map((o) => ({
      name: `${k.label}: ${o.label}`,
      kickoff: k.kickoff,
      status: 'scheduled' as const,
      now: shift(k.cutoff, o.ms),
      cutoff: k.cutoff,
      open: o.open,
    })),
  ),
  // a cancelled or played match is never open, even long before the cutoff
  ...(['cancelled', 'played'] as const).flatMap((status) =>
    KICKOFFS.slice(0, 3).map((k) => ({
      name: `${k.label}: ${status} match, 1 hour before cutoff`,
      kickoff: k.kickoff,
      status,
      now: shift(k.cutoff, -3_600_000),
      cutoff: k.cutoff,
      open: false,
    })),
  ),
];
