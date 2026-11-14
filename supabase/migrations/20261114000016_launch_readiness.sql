-- Phase 10: launch-readiness checks (TD-71). Read-only; service_role only. Used by `pnpm launch:check` before any
-- production start. Each check returns ok + a short, non-sensitive detail (counts only, never e-mails or ids).
create or replace function api.launch_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_n bigint;
  v_set_by uuid;
  v_role text[];
begin
  -- 1. Deposit policy set by staff through the audited admin flow (the local seed writes it with no author).
  select updated_by into v_set_by from core.system_settings where key = 'auction.deposit.global_min_paise';
  v_checks := v_checks || jsonb_build_object(
    'key', 'deposit_policy_set_by_staff',
    'ok', v_set_by is not null,
    'detail', case
      when not exists (select 1 from core.system_settings where key = 'auction.deposit.global_min_paise')
        then 'no deposit policy configured (OD-04)'
      when v_set_by is null then 'deposit policy is the local demo seed — set real values in /admin/auctions/policy (OD-04)'
      else 'set by staff' end);

  -- 2. No test accounts (e2e and fixtures use *.test addresses).
  select count(*) into v_n from auth.users where email ilike '%.test';
  v_checks := v_checks || jsonb_build_object(
    'key', 'no_test_accounts', 'ok', v_n = 0, 'detail', v_n || ' account(s) with a .test e-mail address');

  -- 3. No sandbox payments recorded.
  select count(*) into v_n from core.payment_attempts where provider = 'sandbox';
  v_checks := v_checks || jsonb_build_object(
    'key', 'no_sandbox_payments', 'ok', v_n = 0, 'detail', v_n || ' sandbox payment attempt(s)');

  -- 4. At least one active Super Admin with a verified authenticator (staff MFA).
  select count(distinct r.user_id) into v_n
  from core.user_roles r
  join core.profiles p on p.id = r.user_id and p.status = 'ACTIVE'
  join auth.mfa_factors f on f.user_id = r.user_id and f.status = 'verified' and f.factor_type = 'totp'
  where r.role_key = 'super_admin' and r.revoked_at is null;
  v_checks := v_checks || jsonb_build_object(
    'key', 'super_admin_with_mfa', 'ok', v_n >= 1, 'detail', v_n || ' active Super Admin(s) with a verified authenticator');

  -- 5. Row-level security on every application table.
  select count(*) into v_n
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname in ('core', 'poolx', 'auction', 'ledger', 'cms') and not c.relrowsecurity;
  v_checks := v_checks || jsonb_build_object(
    'key', 'rls_on_all_tables', 'ok', v_n = 0, 'detail', v_n || ' application table(s) without RLS');

  -- 6. Job / webhook role has its statement timeout (TD-69).
  select rolconfig into v_role from pg_roles where rolname = 'service_role';
  v_checks := v_checks || jsonb_build_object(
    'key', 'service_role_timeouts',
    'ok', coalesce(v_role, '{}') @> array['statement_timeout=30s', 'lock_timeout=10s'],
    'detail', case when coalesce(v_role, '{}') @> array['statement_timeout=30s'] then 'set' else 'missing (migration 0015)' end);

  return jsonb_build_object(
    'ok', not exists (select 1 from jsonb_array_elements(v_checks) c where not (c ->> 'ok')::boolean),
    'checks', v_checks);
end;
$$;

revoke all on function api.launch_readiness() from public, anon, authenticated;
grant execute on function api.launch_readiness() to service_role;
