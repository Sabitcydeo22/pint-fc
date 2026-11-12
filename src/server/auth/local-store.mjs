// Password storage for the TEST-ONLY LocalAuth adapter. Plain JavaScript so BOTH the server code
// (src/server/auth/local.ts) and the seed script (scripts/seed.mjs) can use exactly the same code.
// Real Supabase Auth keeps users and password hashes itself; none of this exists there.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export const LOCAL_AUTH_DDL = `
create schema if not exists local_auth;
create table if not exists local_auth.users (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists local_auth_users_email on local_auth.users (lower(email));
`;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** "scrypt$N$r$p$salt$hash" (salt and hash in base64url). */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

/** Constant-time check. A malformed stored value is simply "no". */
export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (salt.length === 0 || expected.length !== SCRYPT.keylen) return false;
  const actual = await scrypt(password, salt);
  return crypto.timingSafeEqual(actual, expected);
}

/** A hash nobody knows the password of. Checked against when the email is unknown, so the work done is the same. */
let dummy;
export function dummyHash() {
  dummy ??= hashPassword(crypto.randomBytes(24).toString('base64url'));
  return dummy;
}

/** 16 random URL-safe characters. */
export function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

/** Creates schema local_auth and its users table if they are not there yet. `client` needs a `query(sql)` method. */
export async function ensureLocalAuthSchema(client) {
  await client.query(LOCAL_AUTH_DDL);
}
