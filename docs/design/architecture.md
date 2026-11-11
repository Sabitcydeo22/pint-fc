# Architecture

## 1. Parts

```
 Browser (phone first)
   │  HTML + JSON over HTTPS, cookies (HttpOnly, Secure, SameSite=Lax)
   ▼
 Vercel (Hobby)  ── Next.js App Router, TypeScript
   │   pages (server components)      → read data through the same API-layer functions
   │   /api/* route handlers (Node)   → THE API. Validates input, one error format
   │   src/lib/{time,errors,permissions}  → shared rules (see rules.md)
   │
   ├── Auth port ──► Supabase Auth (email + password)   [preview/prod]
   │                 LocalAuth (test-only adapter)       [local/CI]
   │
   └── DB port (node-postgres, server only)
         connects as the login role, then per request:
           BEGIN; SET LOCAL ROLE anon|authenticated;
                  SET LOCAL request.jwt.claims = '<verified claims>';
           call public views / rpc_* functions;  COMMIT
         ▼
      Supabase Postgres 17  (schemas: core = tables, public = views + functions)
```

Key idea: **the app has no more power than a player.** The server talks to the database only as role `anon` or `authenticated`, calling the same views and functions an attacker could call through Supabase's public REST API. So the database is the real privacy and cutoff enforcer, and the API repeats the checks for good error messages.

## 2. Where the API runs
Next.js route handlers under `src/app/api/**`, Node runtime (not Edge), on Vercel serverless functions. Server pages call the same functions in `src/server/` directly (no HTTP hop to ourselves). Every request: parse → validate (zod) → get session → call DB → map errors. Hobby function limits are fine: every call is one short transaction.

## 3. How sign-in works
- Player submits email + password to `POST /api/auth/sign-in`. The server calls the Auth port; Supabase Auth issues access + refresh tokens; `@supabase/ssr` stores them in HttpOnly cookies.
- Every request that needs a player calls `auth.getUser()` (verified by the Auth server, never trusting the cookie alone). A revoked session therefore fails at once.
- Sign out = revoke this session (scope local). Sign out of all devices = scope global.
- Database functions also check that the token's session still exists (`auth.sessions`), so a stolen access token cannot be used directly against the database API after sign-out-all (see threats T-07).
- Errors never say whether the email exists. Archived players cannot sign in (their auth user is banned **and** the app checks status).
- The 40 logins are created by the seed script with the Supabase admin API (service-role key, local scripts only, never in Vercel runtime). No email is ever sent, no sign-up page.

## 4. Environments

| | Local dev & CI | Preview (Vercel) | Production (Vercel) |
|---|---|---|---|
| Purpose | all tests, offline | owner review of a branch | students |
| Database | embedded Postgres 17 (`embedded-postgres`, throwaway data dir) with an `auth` stub | Supabase project `pintfc` (D-12) | Supabase project `pintfc` |
| Auth | LocalAuth adapter (password table + signed cookie, test-only; refuses to load when `VERCEL_ENV` is set) | Supabase Auth | Supabase Auth |
| Data | seeded fresh each run | real seed (fake data) | real seed (fake data) |
| Who can open it | me | owner (Hobby protection may require Vercel login) | public site; players sign in |
| Smoke suite | — | runs the DB + sign-in smoke tests, rolled back / own test user | read-only checks after deploy |

Env vars (names only): `DATABASE_URL` (pooler, server), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**scripts only, never set on Vercel**), `AUTH_ADAPTER=supabase|local`. All in `.env.local` (gitignored) / Vercel env settings.

## 5. Test levels and what they run against
- **Unit** (Vitest): `time`, `errors`, `permissions`, formatting. No I/O.
- **Database** (Vitest + embedded Postgres): migrations applied, then connect as `anon` / `authenticated` with crafted claims and run the access-matrix tests and every privacy/cutoff check.
- **API** (Vitest, calls route handlers): LocalAuth + embedded Postgres.
- **End-to-end** (Playwright): `next start` + embedded Postgres + LocalAuth; Chromium at 390 px and 320 px; frozen/controlled clock where needed. axe for contrast.
- **Smoke** (separate, needs the real Supabase project and owner's yes): sign-in with real Auth, `/rest/v1/*` with the anon key must expose only the allowed views, one RSVP round trip with a test player.

Risk: LocalAuth and the `auth` stub could drift from real Supabase → the smoke suite is the guard, and runs before any production deploy.

## 6. Deploy flow
`git push` is never done by me. Deploy is `npx vercel --token $env:VERCEL_TOKEN` (preview) after the owner's yes; production only on the last step of the last session with the owner's explicit "yes". Migrations: `npx supabase db push` run by me only after the owner creates the project and says go.
