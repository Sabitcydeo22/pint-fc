-- 0005_record_results_views.sql
-- Two public views for the home page. Both are read-only and public information: scores and dates only.
-- They read core.* as the view owner; callers get SELECT on the views and nothing on core.
--
-- Rules both views share (threat T-11, "unpublished results and cancelled matches never leak"):
--   * a result counts only when results.published is true
--   * and only when its match is status 'played' (a cancelled or not-yet-played match never shows, even if a
--     result row exists for it)
--
-- public.v_season_record: the league record of the CURRENT season (seasons.is_current).
--   * league competitions only: a friendly never counts (AC-2.2.3)
--   * no published league result means NO ROW, so the page shows an empty state instead of zeros (AC-2.2.4)
--
-- public.v_latest_results: every published league or friendly result, newest match first (AC-2.3.1).
--   The API takes the first 5. played_on is the calendar date in the club's time zone (America/New_York, the
--   same zone as core.is_minor); played_at is the kickoff instant, kept for ordering.

create view public.v_season_record as
select count(*)::int                                          as played,
       (count(*) filter (where r.goals_for >  r.goals_against))::int as won,
       (count(*) filter (where r.goals_for =  r.goals_against))::int as drawn,
       (count(*) filter (where r.goals_for <  r.goals_against))::int as lost,
       coalesce(sum(r.goals_for), 0)::int                     as goals_for,
       coalesce(sum(r.goals_against), 0)::int                 as goals_against
  from core.results r
  join core.matches m on m.id = r.match_id
  join core.competitions c on c.id = m.competition_id
  join core.seasons s on s.id = m.season_id
 where r.published
   and m.status = 'played'
   and c.kind = 'league'
   and s.is_current
having count(*) > 0;

create view public.v_latest_results as
select m.id as match_id,
       t.name as opponent,
       r.goals_for,
       r.goals_against,
       (m.kickoff_at at time zone 'America/New_York')::date as played_on,
       m.kickoff_at as played_at
  from core.results r
  join core.matches m on m.id = r.match_id
  join core.teams t on t.id = m.opponent_id
 where r.published
   and m.status = 'played'
 order by m.kickoff_at desc, m.id;

-- read-only for everyone: no write privilege for anyone but the owner
revoke all on public.v_season_record from public, anon, authenticated, service_role;
grant select on public.v_season_record to anon, authenticated, service_role;
revoke all on public.v_latest_results from public, anon, authenticated, service_role;
grant select on public.v_latest_results to anon, authenticated, service_role;
