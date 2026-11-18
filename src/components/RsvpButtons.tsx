'use client';
// "My answer" on the event page: Going / Maybe / Not going, an optional reason (140 characters, with a counter) and a
// saved status. Clicking an answer saves it at once through PUT /api/fixtures/[id]/rsvp. The body is only the answer
// and the reason: whose answer it is comes from the session, never from this component. The reason box shows MY OWN
// reason only (the attendance response never carries anybody else's).
import { useState } from 'react';
import type { RsvpAnswer } from '../server/rsvp';

export const REASON_MAX = 140;

const CHOICES: { answer: RsvpAnswer; testId: string; label: string; icon: string; color: string }[] = [
  { answer: 'going', testId: 'rsvp-going', label: 'Going', icon: '✓', color: 'var(--ok)' },
  { answer: 'maybe', testId: 'rsvp-maybe', label: 'Maybe', icon: '?', color: 'var(--warn)' },
  { answer: 'not_going', testId: 'rsvp-not-going', label: 'Not going', icon: '✗', color: 'var(--bad)' },
];

const MESSAGES: Record<string, string> = {
  RSVP_CLOSED: 'RSVP is closed for this match.',
  MATCH_NOT_OPEN: 'This match is not open for RSVP.',
};

export interface RsvpButtonsProps {
  matchId: string;
  /** false = the buttons are shown but disabled (RSVP closed). */
  open: boolean;
  me: { answer: RsvpAnswer | null; reason: string | null };
  /** Called after the server accepted the answer, and after a rejection, so the page can refresh what it shows. */
  onChanged: () => void;
}

export default function RsvpButtons({ matchId, open, me, onChanged }: RsvpButtonsProps) {
  const [answer, setAnswer] = useState<RsvpAnswer | null>(me.answer);
  const [reason, setReason] = useState(me.reason ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: RsvpAnswer) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const body: { answer: RsvpAnswer; reason?: string } = { answer: next };
      if (reason !== '') body.reason = reason;
      const res = await fetch(`/api/fixtures/${matchId}/rsvp`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.assign(new URL('/sign-in', window.location.origin).href); // a full page load (D-65)
        return;
      }
      if (!res.ok) {
        let code = '';
        try {
          code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? '';
        } catch {
          /* keep the generic message: never show the server's text */
        }
        setError(MESSAGES[code] ?? 'Could not save your answer. Try again.');
        onChanged();
        return;
      }
      const result = (await res.json()) as { me: { answer: RsvpAnswer | null; reason: string | null } };
      setAnswer(result.me.answer);
      setReason(result.me.reason ?? '');
      setSaved(true);
      onChanged();
    } catch {
      setError('Could not save your answer. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="my-answer-title" className="card stack-sm" data-testid="my-answer">
      <h2 id="my-answer-title">My answer</h2>
      <div role="group" aria-labelledby="my-answer-title" className="fx-choices">
        {CHOICES.map((c) => (
          <button
            key={c.answer}
            type="button"
            data-testid={c.testId}
            aria-pressed={answer === c.answer}
            disabled={!open || saving}
            className="fx-choice"
            style={{ ['--choice' as string]: c.color }}
            onClick={() => void save(c.answer)}
          >
            <span aria-hidden="true">{c.icon}</span> {c.label}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="rsvp-reason">Reason (optional)</label>
        <input
          id="rsvp-reason"
          data-testid="rsvp-reason"
          type="text"
          maxLength={REASON_MAX}
          value={reason}
          disabled={!open || saving}
          onChange={(e) => {
            setReason(e.target.value);
            setSaved(false);
          }}
          aria-describedby="rsvp-reason-counter"
        />
        <span id="rsvp-reason-counter" data-testid="rsvp-reason-counter" className="muted">
          {reason.length}/{REASON_MAX}
        </span>
      </div>
      <p className="muted">Your reason is saved with your next tap on an answer. Only you can see it.</p>
      {saved ? (
        <p role="status" data-testid="rsvp-saved" className="status-ok bold">
          Saved
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="rsvp-error" className="status-bad bold">
          {error}
        </p>
      ) : null}
    </section>
  );
}
