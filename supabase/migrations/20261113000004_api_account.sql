-- 0004 — Account API (HTTP surface for signed-in users). All functions are security definer, fix search_path,
-- derive the user from auth.uid() (never from arguments) and validate inputs.

create or replace function core.require_active_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select status into v_status from core.profiles where id = v_uid;
  if v_status is null then
    raise exception 'profile missing' using errcode = '28000';
  end if;
  if v_status in ('SUSPENDED', 'DELETED') then
    raise exception 'account not active' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function core.require_active_user() from public;

-- ---------------------------------------------------------------------------
-- api.get_my_account
-- ---------------------------------------------------------------------------
create or replace function api.get_my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'displayName', p.display_name,
    'phone', p.phone_e164,
    'city', p.city,
    'state', p.state,
    'status', p.status,
    'deletionRequestedAt', p.deletion_requested_at,
    'createdAt', p.created_at,
    'aal', core.current_aal(),
    'isStaff', core.is_staff(v_uid),
    'roles', coalesce((
      select jsonb_agg(ur.role_key order by ur.role_key)
      from core.user_roles ur where ur.user_id = v_uid and ur.revoked_at is null
    ), '[]'::jsonb),
    -- effective permissions in THIS session (staff permissions appear only at aal2)
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission_key)
      from core.user_roles ur
      join core.roles r on r.key = ur.role_key
      join core.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = v_uid and ur.revoked_at is null
        and (not r.is_staff or core.current_aal() = 'aal2')
    ), '[]'::jsonb)
  )
  into v_result
  from core.profiles p
  where p.id = v_uid;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- api.update_my_profile
-- ---------------------------------------------------------------------------
create or replace function api.update_my_profile(p_display_name text, p_city text, p_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_active_user();
  v_before jsonb;
  v_after jsonb;
begin
  select jsonb_build_object('display_name', display_name, 'city', city, 'state', state)
    into v_before from core.profiles where id = v_uid for update;

  update core.profiles
     set display_name = nullif(btrim(p_display_name), ''),
         city = nullif(btrim(p_city), ''),
         state = nullif(btrim(p_state), '')
   where id = v_uid
  returning jsonb_build_object('display_name', display_name, 'city', city, 'state', state) into v_after;

  if v_after is distinct from v_before then
    perform core.write_audit('profile.update', 'core', 'profiles', v_uid::text, v_before, v_after, null);
  end if;
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create or replace function api.list_my_sessions()
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip_hint text, aal text, is_current boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user();
begin
  return query
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at::timestamptz, s.updated_at),
         left(s.user_agent, 300),
         -- coarse hint only: first two octets of IPv4 / first block of IPv6
         case
           when s.ip is null then null
           when family(s.ip) = 4 then split_part(host(s.ip), '.', 1) || '.' || split_part(host(s.ip), '.', 2) || '.x.x'
           else split_part(host(s.ip), ':', 1) || ':…'
         end,
         s.aal::text,
         s.id::text = (auth.jwt() ->> 'session_id')
  from auth.sessions s
  where s.user_id = v_uid
    and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at) desc nulls last;
end;
$$;

create or replace function api.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); v_deleted int;
begin
  if p_session_id::text = (auth.jwt() ->> 'session_id') then
    raise exception 'use sign out to end the current session' using errcode = 'invalid_parameter_value';
  end if;
  delete from auth.sessions where id = p_session_id and user_id = v_uid;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into core.security_events (kind, user_id) values ('SESSION_REVOKED', v_uid);
    perform core.write_audit('session.revoke', 'auth', 'sessions', p_session_id::text, null, null, null);
  end if;
  return v_deleted > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion request (processing is a staff workflow: financial records are retained as required)
-- ---------------------------------------------------------------------------
create or replace function api.request_account_deletion(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); v_at timestamptz;
begin
  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception 'reason too long' using errcode = 'invalid_parameter_value';
  end if;
  update core.profiles
     set status = 'DELETION_REQUESTED', deletion_requested_at = now()
   where id = v_uid and status = 'ACTIVE'
  returning deletion_requested_at into v_at;
  if v_at is null then
    select deletion_requested_at into v_at from core.profiles where id = v_uid;
  else
    insert into core.security_events (kind, user_id) values ('ACCOUNT_DELETION_REQUESTED', v_uid);
    perform core.write_audit('account.deletion_requested', 'core', 'profiles', v_uid::text, null, null, nullif(btrim(p_reason), ''));
  end if;
  return jsonb_build_object('status', 'DELETION_REQUESTED', 'requestedAt', v_at);
end;
$$;

create or replace function api.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); v_rows int;
begin
  update core.profiles set status = 'ACTIVE', deletion_requested_at = null
   where id = v_uid and status = 'DELETION_REQUESTED';
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    perform core.write_audit('account.deletion_cancelled', 'core', 'profiles', v_uid::text, null, null, null);
  end if;
  return jsonb_build_object('status', 'ACTIVE');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only signed-in users may call the account API.
-- ---------------------------------------------------------------------------
revoke all on function api.get_my_account() from public, anon;
revoke all on function api.update_my_profile(text, text, text) from public, anon;
revoke all on function api.list_my_sessions() from public, anon;
revoke all on function api.revoke_my_session(uuid) from public, anon;
revoke all on function api.request_account_deletion(text) from public, anon;
revoke all on function api.cancel_account_deletion() from public, anon;

grant execute on function api.get_my_account() to authenticated;
grant execute on function api.update_my_profile(text, text, text) to authenticated;
grant execute on function api.list_my_sessions() to authenticated;
grant execute on function api.revoke_my_session(uuid) to authenticated;
grant execute on function api.request_account_deletion(text) to authenticated;
grant execute on function api.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- Operator bootstrap: grant a role by email. Not exposed over HTTP; run from SQL by an operator
-- (local psql / Supabase SQL editor). Audited as a system action.
-- ---------------------------------------------------------------------------
create or replace function core.operator_grant_role(p_email text, p_role text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid; v_id uuid;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason required' using errcode = 'invalid_parameter_value';
  end if;
  select id into v_uid from core.profiles where email = p_email::extensions.citext;
  if v_uid is null then
    raise exception 'no profile for that email' using errcode = 'no_data_found';
  end if;
  insert into core.user_roles (user_id, role_key, reason) values (v_uid, p_role, p_reason)
  on conflict (user_id, role_key) where revoked_at is null do nothing
  returning id into v_id;
  perform core.write_audit('role.grant', 'core', 'user_roles', coalesce(v_id::text, 'existing'),
                           null, jsonb_build_object('user_id', v_uid, 'role', p_role), p_reason);
  return v_uid;
end;
$$;
revoke all on function core.operator_grant_role(text, text, text) from public, anon, authenticated;
grant execute on function core.operator_grant_role(text, text, text) to service_role;
