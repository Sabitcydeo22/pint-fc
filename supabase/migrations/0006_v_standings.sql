-- 0006_v_standings.sql
-- public.v_standings: the league table of the LATEST standings snapshot of the current season, one row per
-- team, in position order. Read-only and public information (positions, points, goal difference).
--   * the latest snapshot = the one with the newest taken_on among snapshots of the current season
--     (a snapshot of another season never shows, even if its date is newer)
--   * no snapshot for the current season means NO ROWS (the page shows an empty state)
--   * taken_on is returned so the API can carry it; the home page does not display it until session 16
--   * goal_difference = goals_for - goals_against, computed here from the stored columns
-- The view is owned by the migration role, so it can read core.* for the caller; the caller gets SELECT on the
-- view only (and nothing on core).

create view public.v_standings as
select sn.taken_on,
       r.position,
       t.name as team,
       t.is_us,
       r.played,
       (r.goals_for - r.goals_against) as goal_difference,
       r.points
  from core.standings_snapshots sn
  join core.seasons s on s.id = sn.season_id and s.is_current
  join core.standings_rows r on r.snapshot_id = sn.id
  join core.teams t on t.id = r.team_id
 where sn.id = (
         select sn2.id
           from core.standings_snapshots sn2
           join core.seasons s2 on s2.id = sn2.season_id
          where s2.is_current
          order by sn2.taken_on desc, sn2.id
          limit 1
       )
 order by r.position;

-- read-only for everyone: no write privilege for anyone but the owner
revoke all on public.v_standings from public, anon, authenticated, service_role;
grant select on public.v_standings to anon, authenticated, service_role;
