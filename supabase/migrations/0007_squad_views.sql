-- 0007_squad_views.sql
-- The public squad: who may be shown to a visitor, and two read-only views built on that rule.
--
-- core.is_publicly_visible(p core.players): THE rule, written once (docs/design/data.md):
--   active  AND  opted in (public_opt_in)  AND  ( an adult  OR  has guardian consent )
-- An adult needs no consent; a player under 18 (club-zone calendar, core.is_minor) is public only with guardian
-- consent AND their own opt-in. Archived players are never public.
--
-- Why visitors may execute this one core function: Postgres checks EXECUTE on a function used inside a view against
-- the CALLER, not the view owner, so the public views can only call it if anon and authenticated hold EXECUTE.
-- It is safe to open because it is a pure predicate:
--   * SECURITY DEFINER with a FIXED EMPTY search_path (every name inside is schema-qualified),
--   * it reads ONLY its argument: no table, no other data. It calls one pure date helper, core.is_minor,
--   * core is not exposed through the REST API, and a caller can only pass a row it could already read (none).
-- It is the ONLY core function granted to visitors; tests/db/squad.test.ts (VIS-FN-2, VIS-FN-3) and the access
-- matrix (CORE_FUNCTIONS_OPEN_TO_VIEWS) fail if anything else is opened, or if this function changes shape.

create function core.is_publicly_visible(p core.players) returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select p.status = 'active' and p.public_opt_in and (p.guardian_consent or not core.is_minor(p.date_of_birth))
$$;

revoke all on function core.is_publicly_visible(core.players) from public, anon, authenticated;
grant execute on function core.is_publicly_visible(core.players) to anon, authenticated;
-- (service_role keeps the default execute grant that every core function gets)

-- public.v_squad: visible players only, grouped by position (GK, DEF, MID, FWD, the enum's own order) then shirt
-- number. Name, position and number only: nothing that is not meant for the whole world.
create view public.v_squad as
select p.id,
       p.full_name as name,
       p.position::text as position,
       p.shirt_number
  from core.players p
 where core.is_publicly_visible(p)
 order by p.position, p.shirt_number, p.id;

-- public.v_player_profile: the same visible players, plus three OPTIONAL parts, each shown only when that player
-- consented (show_photo, show_nationality, show_stats); otherwise the column is NULL. Stats count only published
-- results of played matches (the same rule as the home page, T-11).
create view public.v_player_profile as
select p.id,
       p.full_name as name,
       p.position::text as position,
       p.shirt_number,
       case when p.show_photo then p.photo_url end as photo_url,
       case when p.show_nationality then p.nationality end as nationality,
       case when p.show_stats then st.appearances end as appearances,
       case when p.show_stats then st.goals end as goals,
       case when p.show_stats then st.assists end as assists,
       case when p.show_stats then st.minutes end as minutes
  from core.players p
  left join lateral (
         select count(*)::int as appearances,
                coalesce(sum(s.goals), 0)::int as goals,
                coalesce(sum(s.assists), 0)::int as assists,
                coalesce(sum(s.minutes), 0)::int as minutes
           from core.player_match_stats s
           join core.matches m on m.id = s.match_id
           join core.results r on r.match_id = m.id
          where s.player_id = p.id
            and r.published
            and m.status = 'played'
       ) st on true
 where core.is_publicly_visible(p);

-- read-only for everyone: no write privilege for anyone but the owner
revoke all on public.v_squad from public, anon, authenticated, service_role;
grant select on public.v_squad to anon, authenticated, service_role;
revoke all on public.v_player_profile from public, anon, authenticated, service_role;
grant select on public.v_player_profile to anon, authenticated, service_role;
