// Privacy scanner (docs/design/rules.md §3, invariant 1): no PUBLIC response may carry an email,
// phone number, date of birth or RSVP data. `assertNoPii` is called by every API test and by the
// public-page crawl. It throws an Error that names WHERE the problem is, never the value itself.

// Keys that must not appear in a public response at any depth. `rsvp_open` (a flag about the
// match, not about a player) is deliberately NOT in this list.
const FORBIDDEN_KEY =
  /^(email|e_?mail|phone|phone_number|mobile|date_of_birth|dob|birth_?date|birthday|rsvp|rsvps|rsvp_answer|answer|answers|reason|attendees|attendance|going|maybe|not_going|no_answer)$/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// 10-digit phone numbers with optional +1, brackets, spaces, dots or dashes. Standalone tokens only,
// so ids, timestamps and UUID segments do not match.
const PHONE = /(?<![\w.+-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/;

function walk(value: unknown, path: string, findings: string[]): void {
  if (typeof value === 'string') {
    if (EMAIL.test(value)) findings.push(`${path}: email-like value`);
    if (PHONE.test(value)) findings.push(`${path}: phone-like value`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, findings));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = `${path}.${k}`;
      if (FORBIDDEN_KEY.test(k)) findings.push(`${p}: forbidden key "${k}"`);
      walk(v, p, findings);
    }
  }
}

/** Throws if a public JSON value (or text) contains PII or RSVP data. */
export function assertNoPii(value: unknown): void {
  const findings: string[] = [];
  walk(value, '$', findings);
  if (findings.length > 0) {
    throw new Error(`Public response contains private data:\n  - ${findings.join('\n  - ')}`);
  }
}
