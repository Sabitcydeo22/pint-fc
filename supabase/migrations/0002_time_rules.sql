-- 0002_time_rules.sql
-- SQL mirror of src/lib/time.ts. The two must give identical answers on the shared case table
-- (tests/unit/cutoff-cases.ts, checked by tests/db/rules.test.ts).
--   cutoff  = kickoff - 2 hours of REAL time (an interval of hours only: no day/month arithmetic,
--             so daylight-saving changes cannot move it)
--   open    = match is 'scheduled' AND now < cutoff   (at the cutoff itself: closed)
-- These live in `core`: outside callers cannot execute them; later views and rpc_* functions
-- (owned by the migration role) call them.

create function core.rsvp_cutoff(p_kickoff timestamptz) returns timestamptz
  language sql stable
  set search_path = ''
as $$
  select p_kickoff - interval '2 hours'
$$;

create function core.rsvp_is_open(p_now timestamptz, p_kickoff timestamptz, p_status core.match_status)
  returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce(p_status = 'scheduled' and p_now < core.rsvp_cutoff(p_kickoff), false)
$$;

grant execute on function core.rsvp_cutoff(timestamptz) to service_role;
grant execute on function core.rsvp_is_open(timestamptz, timestamptz, core.match_status) to service_role;
