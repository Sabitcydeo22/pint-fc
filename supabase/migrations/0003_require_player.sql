-- 0003_require_player.sql
-- core.require_player(): the database's own answer to "who is calling?". Every rpc_* function that
-- needs a player starts with it, so a request that reaches the database through the REST API
-- directly (not through our app) is held to the same rules.
-- It returns the player's id, or raises SQLSTATE PF401 (UNAUTHENTICATED) unless ALL of these hold:
--   * the token's `sub` claim is a uuid and `session_id` claim is a uuid
--   * that session exists in auth.sessions, belongs to that user and has not expired
--     (so "sign out" and "sign out of all devices" stop a stolen token at once: threat T-07)
--   * the user is an ACTIVE player
-- Real Supabase tokens carry `session_id` and the project has auth.sessions; tests use the stub.

create function core.require_player() returns uuid
  language plpgsql stable
  security definer
  set search_path = ''
as $$
declare
  v_sub uuid;
  v_session uuid;
begin
  begin
    v_sub := auth.uid();
    v_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'UNAUTHENTICATED' using errcode = 'PF401';
  end;

  if v_sub is null or v_session is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'PF401';
  end if;

  if not exists (
    select 1 from auth.sessions s
     where s.id = v_session
       and s.user_id = v_sub
       and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'UNAUTHENTICATED' using errcode = 'PF401';
  end if;

  if not exists (
    select 1 from core.players p where p.id = v_sub and p.status = 'active'
  ) then
    raise exception 'UNAUTHENTICATED' using errcode = 'PF401';
  end if;

  return v_sub;
end;
$$;

-- The first public function: who am I? Visitors cannot execute it; players get their own row only.
create function public.rpc_me()
  returns table (id uuid, full_name text, status text)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
declare
  v_id uuid := core.require_player();
begin
  return query
    select p.id, p.full_name, p.status::text
      from core.players p
     where p.id = v_id;
end;
$$;

revoke all on function public.rpc_me() from public, anon;
grant execute on function public.rpc_me() to authenticated;
