'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Settings {
  public_opt_in: boolean;
  show_photo: boolean;
  show_nationality: boolean;
  show_stats: boolean;
  is_minor: boolean;
  guardian_consent: boolean;
  email: string;
}
type Flag = 'public_opt_in' | 'show_photo' | 'show_nationality' | 'show_stats';

const TOGGLES: { flag: Flag; testId: string; label: string }[] = [
  { flag: 'public_opt_in', testId: 'toggle-public', label: 'Show me on the public squad' },
  { flag: 'show_photo', testId: 'toggle-photo', label: 'Show my photo' },
  { flag: 'show_nationality', testId: 'toggle-nationality', label: 'Show my nationality' },
  { flag: 'show_stats', testId: 'toggle-stats', label: 'Show my stats' },
];

export default function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // a minor without guardian consent cannot be public: the toggle is disabled (the database refuses it anyway)
  const publicLocked = settings.is_minor && !settings.guardian_consent;

  async function change(flag: Flag, value: boolean) {
    if (saving) return;
    const previous = settings;
    setSettings({ ...settings, [flag]: value }); // show the change at once; it is put back if the server refuses
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/me/settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [flag]: value }),
      });
      if (res.ok) {
        const body = (await res.json()) as { settings: Settings };
        setSettings(body.settings);
        setSaved(true);
      } else if (res.status === 401) {
        router.push('/sign-in');
        return;
      } else {
        setSettings(previous);
        setError(
          res.status === 422
            ? 'A guardian must give consent before your profile can be public.'
            : 'Your change was not saved. Try again.',
        );
      }
    } catch {
      setSettings(previous);
      setError('Your change was not saved. Try again.');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} aria-busy={saving} className="stack-sm">
      {error ? (
        <p className="form-error" role="alert" data-testid="settings-error">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" data-testid="settings-saved">
          Saved.
        </p>
      ) : (
        <p role="status" className="muted live-region" aria-live="polite" />
      )}
      {TOGGLES.map(({ flag, testId, label }) => {
        const locked = flag === 'public_opt_in' && publicLocked;
        const id = `setting-${flag}`;
        return (
          <div key={flag} className="check-row">
            <input
              id={id}
              type="checkbox"
              className="check-box"
              checked={settings[flag]}
              disabled={locked || saving}
              onChange={(e) => void change(flag, e.target.checked)}
              data-testid={testId}
            />
            <label htmlFor={id}>{label}</label>
          </div>
        );
      })}
      {publicLocked ? (
        <p className="muted" data-testid="minor-note">
          You are under 18, so a guardian has to give consent before you can appear on the public squad. Ask the club to arrange it.
        </p>
      ) : null}
    </form>
  );
}
