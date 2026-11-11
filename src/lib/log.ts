// Structured logger (docs/design/rules.md §6): one JSON line per event.
// It NEVER prints request bodies, cookies, tokens, emails, phones, birth dates or passwords:
// sensitive keys are replaced, and email / token look-alikes inside any text are masked.

type Fields = Record<string, unknown>;

const SENSITIVE_KEY =
  /^(body|payload|email|e_?mail|phone|date_of_birth|dob|reason|cookie|cookies|set-cookie|authorization|password|passwd|pwd|secret)$|token|secret|password|api_?key|cookie|authorization/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /Bearer\s+\S+/gi;
const MAX_DEPTH = 5;
const MAX_STRING = 300;

function cleanString(s: string): string {
  const masked = s.replace(JWT, '[jwt]').replace(BEARER, '[auth]').replace(EMAIL, '[email]');
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked;
}

function clean(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return cleanString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name }; // messages can carry connection strings
  if (depth >= MAX_DEPTH) return '[deep]';
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value as Fields)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : clean(v, depth + 1);
  }
  return out;
}

type Level = 'info' | 'warn' | 'error';

function write(level: Level, event: string, fields?: Fields): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...(clean(fields ?? {}, 0) as Fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};
