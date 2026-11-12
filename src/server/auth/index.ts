// Chooses the auth adapter and gives routes two helpers. Routes never import an adapter directly.
import crypto from 'node:crypto';
import { AppError } from '../../lib/errors';
import { LocalAuth } from './local';
import { type AuthPort, type AuthSession } from './types';

export { SESSION_COOKIE } from './types';
export type { AuthPort, AuthSession, SignInResult } from './types';

let processSecret: string | undefined;
let cached: { secret: string; auth: LocalAuth } | undefined;

/**
 * The adapter for this environment, checked on EVERY call (the rules below cannot be skipped by a cached instance):
 *  - on Vercel (VERCEL_ENV is set) LocalAuth is forbidden, whatever AUTH_ADAPTER says or does not say
 *  - AUTH_ADAPTER=local (the default off Vercel) needs LOCAL_AUTH_SECRET of 32+ characters, or makes a random one per process
 *  - AUTH_ADAPTER=supabase arrives with session 18
 */
export function getAuth(): AuthPort {
  const onVercel = Boolean(process.env.VERCEL_ENV);
  const adapter = process.env.AUTH_ADAPTER ?? (onVercel ? '' : 'local');

  if (onVercel && adapter === 'local') throw new Error('LocalAuth must never run on Vercel (VERCEL_ENV is set).');
  if (adapter === '') throw new Error('AUTH_ADAPTER is not set. On Vercel it must be "supabase"; LocalAuth is not allowed there.');
  if (adapter === 'supabase') throw new Error('The Supabase auth adapter is not available yet (session 18).');
  if (adapter !== 'local') throw new Error(`Unknown AUTH_ADAPTER "${adapter}".`);

  const secret = process.env.LOCAL_AUTH_SECRET ?? (processSecret ??= crypto.randomBytes(32).toString('hex'));
  if (!cached || cached.secret !== secret) cached = { secret, auth: new LocalAuth(secret) };
  return cached.auth;
}

/** The signed-in player for this request, or an UNAUTHENTICATED (401) error. */
export async function requirePlayer(request: Request): Promise<AuthSession> {
  const session = await getAuth().getUser(request);
  if (!session) throw new AppError('UNAUTHENTICATED');
  return session;
}

/** Waits until at least `minMs` have passed since `startedAt` (performance.now()). Used so every sign-in outcome takes the same time. */
export async function padTo(startedAt: number, minMs: number): Promise<void> {
  const wait = minMs - (performance.now() - startedAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
