-- 0004_v_next_match.sql
-- public.v_next_match: the one next match for the home page. Visitors and players may read it (it is public
-- information: no counts, no names, no RSVP data). Rules, in order:
--   * only 'scheduled' matches (a cancelled or played match is never "next")
--   * only matches that have not kicked off yet (kickoff_at > now())
--   * the earliest one wins (a cancelled earlier match is simply skipped)
-- The match stays "next" after the RSVP cutoff, with rsvp_open = false, until kickoff.
-- The cutoff (kickoff - 2 hours of real time) and "open" (scheduled and now < cutoff) are written inline here,
-- the same expressions as core.rsvp_cutoff / core.rsvp_is_open in 0002. They cannot call those functions: Postgres
-- checks EXECUTE on functions used inside a view against the CALLER, and core.* is closed to visitors on purpose.
-- tests/db/next-match.test.ts (NEXT-MATCH-4) compares the view with the core functions, so the two cannot drift.
-- The view is owned by the migration role, so it can read core.* for the caller; the caller gets SELECT on the
-- view only (and nothing on core). server_now is the database clock: the browser corrects its own clock by it.

create view public.v_next_match as
select m.id,
       t.name  as opponent,
       c.name  as competition,
       v.name  as venue,
       m.kickoff_at,
       m.kickoff_at - interval '2 hours' as cutoff_at,
       (m.status = 'scheduled' and now() < m.kickoff_at - interval '2 hours') as rsvp_open,
       now()   as server_now
  from core.matches m
  join core.teams t on t.id = m.opponent_id
  join core.competitions c on c.id = m.competition_id
  join core.venues v on v.id = m.venue_id
 where m.status = 'scheduled'
   and m.kickoff_at > now()
 order by m.kickoff_at
 limit 1;

-- read-only for everyone: no write privilege for anyone but the owner
revoke all on public.v_next_match from public, anon, authenticated, service_role;
grant select on public.v_next_match to anon, authenticated, service_role;
