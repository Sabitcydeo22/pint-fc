-- 0001_core_schema.sql
-- Schema `core` holds every base table. Visitors (anon) and players (authenticated) get NO access
-- to it: not the schema, not the tables, not the helper functions. RLS is switched on for every
-- table as a second lock (no policies = no rows, even after a mistaken grant).
-- Schema `public` is the only thing the REST API exposes; views and rpc_* functions arrive in
-- later migrations. See docs/design/data.md.

create schema core;

-- ---------------------------------------------------------------------------------------------
-- Locked-down defaults (applies to objects created from here on by the migration role)
-- ---------------------------------------------------------------------------------------------
revoke all on schema core from public;
revoke all on schema core from anon, authenticated;
grant usage on schema core to service_role;

-- New functions are executable by PUBLIC by default in Postgres; take that away everywhere.
alter default privileges revoke execute on functions from public;
-- Supabase gives anon/authenticated every new object in `public`; take that away too.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Anything already in `public` (a fresh Supabase project may have some): close it.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- The owner roles keep full access inside core.
alter default privileges in schema core grant all on tables to service_role;
alter default privileges in schema core grant all on sequences to service_role;
alter default privileges in schema core grant execute on functions to service_role;

-- ---------------------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------------------
create type core.player_position as enum ('GK', 'DEF', 'MID', 'FWD');
create type core.player_status as enum ('active', 'archived');
create type core.competition_kind as enum ('league', 'friendly');
create type core.home_away as enum ('home', 'away');
create type core.match_status as enum ('scheduled', 'cancelled', 'played');
create type core.rsvp_answer as enum ('going', 'maybe', 'not_going');

-- ---------------------------------------------------------------------------------------------
-- Helper: minor = under 18 today, by the calendar in the club's zone
-- ---------------------------------------------------------------------------------------------
create function core.is_minor(dob date) returns boolean
  language sql stable
  set search_path = ''
as $$
  select age((now() at time zone 'America/New_York')::date, dob) < interval '18 years'
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
create table core.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  check (ends_on > starts_on)
);
create unique index seasons_one_current on core.seasons ((true)) where is_current;

create table core.competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references core.seasons (id),
  name text not null,
  kind core.competition_kind not null
);

create table core.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null
);

create table core.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  crest_url text not null,
  is_us boolean not null default false
);
create unique index teams_one_us on core.teams ((true)) where is_us;

-- players.id is the auth user's id (no foreign key: the seed creates players first, logins after)
create table core.players (
  id uuid primary key,
  full_name text not null,
  position core.player_position not null,
  shirt_number int not null check (shirt_number between 0 and 99),
  status core.player_status not null default 'active',
  email text not null,
  phone text,
  date_of_birth date not null,
  guardian_consent boolean not null default false,
  public_opt_in boolean not null default true,
  show_photo boolean not null default false,
  show_nationality boolean not null default false,
  show_stats boolean not null default false,
  photo_url text,
  nationality text,
  created_at timestamptz not null default now()
);
create unique index players_active_shirt on core.players (shirt_number) where status = 'active';
create unique index players_email_lower on core.players (lower(email));

-- A minor cannot be public without guardian consent (AC-4.3.3). Adults default to public;
-- a column default cannot depend on the birth date, so the seed sets minors' value explicitly.
create function core.players_guard() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.public_opt_in and not new.guardian_consent and core.is_minor(new.date_of_birth) then
    raise exception 'MINOR_NEEDS_GUARDIAN' using errcode = 'PF422';
  end if;
  return new;
end;
$$;
create trigger players_guard
  before insert or update on core.players
  for each row execute function core.players_guard();

create table core.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references core.seasons (id),
  competition_id uuid not null references core.competitions (id),
  opponent_id uuid not null references core.teams (id),
  venue_id uuid not null references core.venues (id),
  home_away core.home_away not null,
  kickoff_at timestamptz not null,
  status core.match_status not null default 'scheduled'
);
create index matches_kickoff on core.matches (kickoff_at);

create table core.results (
  match_id uuid primary key references core.matches (id),
  goals_for int not null check (goals_for >= 0),
  goals_against int not null check (goals_against >= 0),
  published boolean not null default false,
  published_at timestamptz,
  check (not published or published_at is not null)
);

create table core.player_match_stats (
  match_id uuid not null references core.matches (id),
  player_id uuid not null references core.players (id),
  minutes int not null check (minutes >= 0),
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  primary key (match_id, player_id)
);

create table core.standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references core.seasons (id),
  taken_on date not null
);

create table core.standings_rows (
  snapshot_id uuid not null references core.standings_snapshots (id),
  team_id uuid not null references core.teams (id),
  position int not null check (position > 0),
  played int not null check (played >= 0),
  won int not null check (won >= 0),
  drawn int not null check (drawn >= 0),
  lost int not null check (lost >= 0),
  goals_for int not null check (goals_for >= 0),
  goals_against int not null check (goals_against >= 0),
  points int not null check (points >= 0),
  primary key (snapshot_id, team_id)
);

create table core.trainings (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  venue_id uuid not null references core.venues (id),
  note text
);

create table core.rsvps (
  match_id uuid not null references core.matches (id),
  player_id uuid not null references core.players (id),
  answer core.rsvp_answer not null,
  reason text check (reason is null or char_length(reason) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------------------------------------
-- Second lock: row level security on every core table, with NO policies.
-- ---------------------------------------------------------------------------------------------
alter table core.seasons enable row level security;
alter table core.competitions enable row level security;
alter table core.venues enable row level security;
alter table core.teams enable row level security;
alter table core.players enable row level security;
alter table core.matches enable row level security;
alter table core.results enable row level security;
alter table core.player_match_stats enable row level security;
alter table core.standings_snapshots enable row level security;
alter table core.standings_rows enable row level security;
alter table core.trainings enable row level security;
alter table core.rsvps enable row level security;

-- Belt and braces: make service_role's access to everything above explicit, so it does not
-- depend on default privileges (a real Supabase project may have different defaults).
grant all on all tables in schema core to service_role;
grant execute on all functions in schema core to service_role;
