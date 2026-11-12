-- 0010_attendance.sql
-- What a signed-in player sees on the event page (AC-3.3.1, AC-3.4.1, AC-3.4.3; threats T-05, T-12).
--
--   public.rpc_attendance(p_match_id uuid)
--     -> one row: the match (opponent, competition, venue, kickoff_at, cutoff_at, status, rsvp_open), the database clock
--        (server_now), the counts (going, maybe, not_going, no_answer), the attendance list (attendees, a jsonb array
--        of { player_id, name, answer }) and the CALLER's own answer and reason (my_answer, my_reason).
--
-- Why this is safe (the database is the lock; the API and the page are only conveniences):
--   * it starts with core.require_player(): no live session of an active player = PF401. Visitors cannot execute it
--     at all (T-12). There is no public view of RSVP data.
--   * NO REASON of anybody is selected into the list or the counts. The only reason that leaves this function is the
--     caller's own, read with a filter on core.require_player()'s id (T-05).
--   * the list and the counts cover ACTIVE players only (an archived player is no longer part of the squad), and only
--     players who answered are listed; no_answer is the number of active players who have not.
--   * the list is ordered going, maybe, not_going, then by name, then by id, so equal inputs give equal output.
--   * rsvp_open is the shared rule (core.rsvp_is_open on the database clock), true only for a scheduled match before
--     its cutoff; a cancelled, played or closed match can still be read.
--   * unknown match = PF404. SECURITY DEFINER with an empty search_path (every name is schema-qualified); not
--     executable by anon or PUBLIC.

create function public.rpc_attendance(p_match_id uuid)
  returns table (
    match_id uuid,
    opponent text,
    competition text,
    venue text,
    kickoff_at timestamptz,
    cutoff_at timestamptz,
    status text,
    rsvp_open boolean,
    server_now timestamptz,
    going integer,
    maybe integer,
    not_going integer,
    no_answer integer,
    attendees jsonb,
    my_answer text,
    my_reason text
  )
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid := core.require_player();
begin
  if not exists (select 1 from core.matches m where m.id = p_match_id) then
    raise exception 'NOT_FOUND' using errcode = 'PF404';
  end if;

  return query
  select m.id,
         t.name::text,
         c.name::text,
         v.name::text,
         m.kickoff_at,
         core.rsvp_cutoff(m.kickoff_at),
         m.status::text,
         core.rsvp_is_open(now(), m.kickoff_at, m.status),
         now(),
         (select count(*)::int from core.rsvps r join core.players p on p.id = r.player_id
           where r.match_id = m.id and p.status = 'active' and r.answer = 'going'),
         (select count(*)::int from core.rsvps r join core.players p on p.id = r.player_id
           where r.match_id = m.id and p.status = 'active' and r.answer = 'maybe'),
         (select count(*)::int from core.rsvps r join core.players p on p.id = r.player_id
           where r.match_id = m.id and p.status = 'active' and r.answer = 'not_going'),
         (select count(*)::int from core.players p
           where p.status = 'active'
             and not exists (select 1 from core.rsvps r where r.match_id = m.id and r.player_id = p.id)),
         (select coalesce(
                   jsonb_agg(
                     jsonb_build_object('player_id', p.id, 'name', p.full_name, 'answer', r.answer::text)
                     order by case r.answer when 'going' then 1 when 'maybe' then 2 else 3 end, p.full_name, p.id),
                   '[]'::jsonb)
            from core.rsvps r join core.players p on p.id = r.player_id
           where r.match_id = m.id and p.status = 'active'),
         (select r.answer::text from core.rsvps r where r.match_id = m.id and r.player_id = v_id),
         (select r.reason from core.rsvps r where r.match_id = m.id and r.player_id = v_id)
    from core.matches m
    join core.teams t on t.id = m.opponent_id
    join core.competitions c on c.id = m.competition_id
    join core.venues v on v.id = m.venue_id
   where m.id = p_match_id;
end;
$$;

revoke all on function public.rpc_attendance(uuid) from public, anon;
grant execute on function public.rpc_attendance(uuid) to authenticated;
