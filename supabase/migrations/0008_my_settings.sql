-- 0008_my_settings.sql
-- A player reads and edits their OWN public-visibility settings (AC-4.3.2, AC-4.3.3, AC-4.3.4, threat T-06).
--
--   public.rpc_my_settings()                -> the caller's four flags, is_minor, guardian_consent and their own email
--   public.rpc_update_my_settings(4 flags)  -> changes those four flags, on the caller's row, and nothing else
--
-- Why this is safe (the database is the lock; the API and the page are only conveniences):
--   * both start with core.require_player(): no live session of an active player = PF401
--   * neither takes a player id: the row is always auth.uid()'s, so there is no argument to point at somebody else
--   * the update function has parameters for the four consent flags ONLY: status, guardian_consent, shirt number,
--     name, email and date of birth cannot be named, and players hold no table grant at all
--   * a minor without guardian consent who asks for public_opt_in = true gets PF422 (MINOR_NEEDS_GUARDIAN) before any
--     write; the whole call is rejected, so a flag sent along with it is not saved either. The players_guard trigger
--     says the same thing a second time (defence in depth).
--   * SECURITY DEFINER with an empty search_path (every name is schema-qualified); not executable by anon or PUBLIC.
-- An omitted flag (NULL) is left as it is. A call with no flag at all is an error (22023).

create function public.rpc_my_settings()
  returns table (
    public_opt_in boolean,
    show_photo boolean,
    show_nationality boolean,
    show_stats boolean,
    is_minor boolean,
    guardian_consent boolean,
    email text
  )
  language plpgsql stable
  security definer
  set search_path = ''
as $$
declare
  v_id uuid := core.require_player();
begin
  return query
    select p.public_opt_in, p.show_photo, p.show_nationality, p.show_stats,
           core.is_minor(p.date_of_birth), p.guardian_consent, p.email::text
      from core.players p
     where p.id = v_id;
end;
$$;

revoke all on function public.rpc_my_settings() from public, anon;
grant execute on function public.rpc_my_settings() to authenticated;

create function public.rpc_update_my_settings(
  p_public_opt_in boolean default null,
  p_show_photo boolean default null,
  p_show_nationality boolean default null,
  p_show_stats boolean default null
)
  returns table (
    public_opt_in boolean,
    show_photo boolean,
    show_nationality boolean,
    show_stats boolean,
    is_minor boolean,
    guardian_consent boolean,
    email text
  )
  language plpgsql volatile
  security definer
  set search_path = ''
as $$
declare
  v_id uuid := core.require_player();
  v_minor boolean;
  v_consent boolean;
begin
  if p_public_opt_in is null and p_show_photo is null and p_show_nationality is null and p_show_stats is null then
    raise exception 'at least one setting is required' using errcode = '22023';
  end if;

  select core.is_minor(p.date_of_birth), p.guardian_consent
    into v_minor, v_consent
    from core.players p
   where p.id = v_id;

  if p_public_opt_in is true and v_minor and not v_consent then
    raise exception 'MINOR_NEEDS_GUARDIAN' using errcode = 'PF422';
  end if;

  update core.players p
     set public_opt_in    = coalesce(p_public_opt_in, p.public_opt_in),
         show_photo       = coalesce(p_show_photo, p.show_photo),
         show_nationality = coalesce(p_show_nationality, p.show_nationality),
         show_stats       = coalesce(p_show_stats, p.show_stats)
   where p.id = v_id;

  return query
    select p.public_opt_in, p.show_photo, p.show_nationality, p.show_stats,
           core.is_minor(p.date_of_birth), p.guardian_consent, p.email::text
      from core.players p
     where p.id = v_id;
end;
$$;

revoke all on function public.rpc_update_my_settings(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.rpc_update_my_settings(boolean, boolean, boolean, boolean) to authenticated;
