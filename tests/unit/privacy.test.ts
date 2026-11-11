import { describe, expect, it } from 'vitest';
import { assertNoPii } from '../../src/lib/privacy';

const leak = (v: unknown) => () => assertNoPii(v);

describe('privacy scanner', () => {
  it('RULE-5 assertNoPii flags emails, phones, birth dates and rsvp keys', () => {
    // keys that must never appear in a public response, at any depth
    expect(leak({ email: 'x' })).toThrow(/\$\.email/);
    expect(leak({ player: { phone: '+1-555-0100' } })).toThrow(/\$\.player\.phone/);
    expect(leak({ players: [{ name: 'A', date_of_birth: '2010-05-01' }] })).toThrow(/\$\.players\[0\]\.date_of_birth/);
    expect(leak({ dob: '2010-05-01' })).toThrow(/dob/);
    expect(leak({ rsvp: 'going' })).toThrow(/rsvp/);
    expect(leak({ rsvps: [] })).toThrow(/rsvps/);
    expect(leak({ answer: 'going' })).toThrow(/answer/);
    expect(leak({ reason: 'ankle' })).toThrow(/reason/);
    expect(leak({ counts: { going: 3, maybe: 1, not_going: 0 } })).toThrow(/going/);
    expect(leak({ attendees: [] })).toThrow(/attendees/);

    // values that look like PII under harmless keys
    expect(leak({ contact: 'someone.fake@pintfc.test' })).toThrow(/\$\.contact/);
    expect(leak({ note: 'call +1 555 010 0100 now' })).toThrow(/\$\.note/);
    expect(leak({ note: '(555) 010-0100' })).toThrow(/\$\.note/);
    expect(leak(['ok', ['nested', 'mail me@pintfc.test']])).toThrow(/\$\[1\]\[1\]/);
    expect(leak('plain text body with a@b.co inside')).toThrow();

    // the message names WHERE, never repeats the value
    let message = '';
    try {
      assertNoPii({ contact: 'secret.person@pintfc.test' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/\$\.contact/);
    expect(message).not.toContain('secret.person');

    // a normal public response passes (ids, ISO instants, plain match dates, rsvp_open flag)
    const home = {
      server_now: '2026-11-14T00:00:00.000Z',
      next_match: {
        id: '00000000-0000-4000-8000-000000000904',
        opponent: 'Rovers',
        kickoff_at: '2026-11-15T00:00:00.000Z',
        cutoff_at: '2026-11-14T22:00:00.000Z',
        rsvp_open: true,
      },
      record: { played: 10, won: 6, drawn: 2, lost: 2, goals_for: 20, goals_against: 11 },
      latest_results: [{ match_id: '00000000-0000-4000-8000-000000000001', played_on: '2026-10-10', goals_for: 2 }],
      standings: { taken_on: '2026-11-01', rows: [{ position: 1, team: 'PINT FC', points: 22 }] },
      time_ms: 1731542400000,
    };
    expect(leak(home)).not.toThrow();
    expect(leak({ players: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Fake Player 1', shirt_number: 9 }] })).not.toThrow();
    expect(leak('<html><body><h1>PINT FC</h1><p>RSVP closes Sat 5:00 PM EST</p></body></html>')).not.toThrow();
  });
});
