begin;
select plan(10);

select ok(not has_function_privilege('anon', 'api.launch_readiness()', 'execute'), 'anonymous users cannot run the launch check');
select ok(not has_function_privilege('authenticated', 'api.launch_readiness()', 'execute'), 'signed-in users cannot run the launch check');
select ok(has_function_privilege('service_role', 'api.launch_readiness()', 'execute'), 'the service role can run the launch check');

create temp table lr_keys as select jsonb_array_elements(api.launch_readiness() -> 'checks') ->> 'key' as key;
select set_eq(
  'select key from lr_keys',
  array['deposit_policy_set_by_staff', 'no_test_accounts', 'no_sandbox_payments', 'super_admin_with_mfa',
        'rls_on_all_tables', 'service_role_timeouts'],
  'all six checks are reported'
);

create function pg_temp.check_ok(p_key text) returns boolean language sql as $$
  select (c ->> 'ok')::boolean from jsonb_array_elements(api.launch_readiness() -> 'checks') c where c ->> 'key' = p_key
$$;

-- Deposit policy: the seed (no author) fails; a staff-authored value passes.
insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000')
on conflict (key) do update set value = excluded.value, updated_by = null;
select ok(not pg_temp.check_ok('deposit_policy_set_by_staff'), 'a deposit policy without a staff author fails the check');
insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000001', 'lr-staff@launch.invalid');
update core.system_settings set updated_by = 'a1000000-0000-4000-8000-000000000001'
where key = 'auction.deposit.global_min_paise';
select ok(pg_temp.check_ok('deposit_policy_set_by_staff'), 'a staff-authored deposit policy passes');

-- Test accounts are detected.
insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000002', 'someone@fixture.test');
select ok(not pg_temp.check_ok('no_test_accounts'), 'a .test account fails the check');

select ok(pg_temp.check_ok('rls_on_all_tables'), 'every application table has RLS');
select ok(pg_temp.check_ok('service_role_timeouts'), 'service_role timeouts are present');
select ok(not (api.launch_readiness() ->> 'ok')::boolean, 'overall result fails while any check fails');

select * from finish();
rollback;
