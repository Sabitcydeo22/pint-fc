-- TEST-ONLY stand-in for the parts of Supabase that our migrations rely on.
-- The real Supabase project already has all of this; this file must never be applied there.
-- It mimics: the three API roles, the `auth` schema helpers, auth.sessions, and Supabase's
-- default privileges (which hand every new public object to anon/authenticated/service_role).
-- Our migration 0001 then has to take those defaults away.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;

-- Same bodies as Supabase's helpers: read the claims PostgREST puts in settings.
create function auth.uid() returns uuid
  language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- Sessions table: closed to anon and authenticated (no grants), like in Supabase.
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  not_after timestamptz
);

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

-- Supabase's defaults: new objects in `public` are open to the API roles.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
