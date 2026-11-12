-- 0009_rsvp.sql
-- A player saves or changes THEIR OWN RSVP for a match (AC-3.3.1, AC-3.3.2, AC-3.3.4, AC-3.3.6; threats T-03, T-04, T-22).
--
--   public.rpc_rsvp_set(p_match_id uuid, p_answer text, p_reason text default null)
--     -> one row: the match's id, cutoff_at, rsvp_open and the database clock (server_now), and the caller's own
--        saved answer and reason
--
-- Why this is safe (the database is the lock; the API and the page are only conveniences):
--   * it starts with core.require_player(): no live session of an active player = PF401
--   * it takes NO player id: the row written is always the session's player, so there is nothing to point at another
--     player (T-04). Players hold no table grant on core.rsvps, so this function is the only write path (T-03).
--   * the match must exist (PF404), be 'scheduled' and not have kicked off (PF410 MATCH_NOT_OPEN: cancelled, played or
--     past, as docs/design/api.md says; kickoff_at <= now() is past), and the database clock must be before the
--     cutoff (PF409 RSVP_CLOSED: between the cutoff and kickoff). Same rule as core.rsvp_is_open: at now == cutoff
--     it is closed. (T-22, T-03)
--   * the clock is the database's now(), never a value from the caller.
--   * one row per (match, player): saving again replaces the answer AND the reason (an omitted reason clears the old
--     one); created_at stays, updated_at moves.
--   * the answer must be going, maybe or not_going and the reason at most 140 characters: otherwise 22023, before any
--     write. An empty reason is stored as no reason.
--   * the result carries only the caller's own reason, never anybody else's (T-05).
--   * SECURITY DEFINER with an empty search_path (every name is schema-qualified); not executable by anon or PUBLIC.

create function public.rpc_rsvp_set(p_match_id uuid, p_answer text, p_reason text default null)
  returns table (
    match_id uuid,
    cutoff_at timestamptz,
    rsvp_open boolean,
    server_now timestamptz,
    answer text,
    reason text
  )
  language plpgsql volatile
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid := core.require_player();
  v_kickoff timestamptz;
  v_status core.match_status;
  v_answer core.rsvp_answer;
  v_reason text := nullif(p_reason, '');
begin
  if p_answer is null or p_answer not in ('going', 'maybe', 'not_going') then
    raise exception 'answer must be going, maybe or not_going' using errcode = '22023';
  end if;
  v_answer := p_answer::core.rsvp_answer;
  if v_reason is not null and char_length(v_reason) > 140 then
    raise exception 'reason is at most 140 characters' using errcode = '22023';
  end if;

  select m.kickoff_at, m.status
    into v_kickoff, v_status
    from core.matches m
   where m.id = p_match_id
     for share;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'PF404';
  end if;
  if v_status <> 'scheduled' then
    raise exception 'MATCH_NOT_OPEN' using errcode = 'PF410';
  end if;
  if v_kickoff <= now() then
    raise exception 'MATCH_NOT_OPEN' using errcode = 'PF410';
  end if;
  if not core.rsvp_is_open(now(), v_kickoff, v_status) then
    raise exception 'RSVP_CLOSED' using errcode = 'PF409';
  end if;

  insert into core.rsvps as r (match_id, player_id, answer, reason)
  values (p_match_id, v_id, v_answer, v_reason)
  on conflict (match_id, player_id)
  do update set answer = excluded.answer, reason = excluded.reason, updated_at = now();

  return query
    select p_match_id,
           core.rsvp_cutoff(v_kickoff),
           true,
           now(),
           v_answer::text,
           v_reason;
end;
$$;

revoke all on function public.rpc_rsvp_set(uuid, text, text) from public, anon;
grant execute on function public.rpc_rsvp_set(uuid, text, text) to authenticated;
