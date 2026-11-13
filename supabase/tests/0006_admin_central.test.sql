-- Phase 6 central admin: permission matrix enforcement, suspension, role management guard rails, sellers, finance, audit.
begin;
select plan(54);

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-000000000001', 'ad-super@test.test'),
  ('a6000000-0000-0000-0000-000000000002', 'ad-admin@test.test'),
  ('a6000000-0000-0000-0000-000000000003', 'ad-finance@test.test'),
  ('a6000000-0000-0000-0000-000000000004', 'ad-support@test.test'),
  ('a6000000-0000-0000-0000-000000000005', 'ad-customer@test.test'),
  ('a6000000-0000-0000-0000-000000000006', 'ad-target@test.test'),
  ('a6000000-0000-0000-0000-000000000007', 'ad-staffer@test.test'),
  ('a6000000-0000-0000-0000-000000000008', 'ad-content@test.test');
-- this test controls who is Super Admin (rolled back at the end)
update core.user_roles set revoked_at = now(), revoke_reason = 'test isolation' where role_key = 'super_admin' and revoked_at is null;
select core.operator_grant_role('ad-super@test.test', 'super_admin', 'fixture');
select core.operator_grant_role('ad-admin@test.test', 'admin', 'fixture');
select core.operator_grant_role('ad-finance@test.test', 'finance_manager', 'fixture');
select core.operator_grant_role('ad-support@test.test', 'customer_support', 'fixture');
select core.operator_grant_role('ad-staffer@test.test', 'poolx_manager', 'fixture');
select core.operator_grant_role('ad-content@test.test', 'content_manager', 'fixture');
insert into auth.sessions (id, user_id) values
  ('a6500000-0000-0000-0000-000000000006', 'a6000000-0000-0000-0000-000000000006'),
  ('a6500000-0000-0000-0000-000000000016', 'a6000000-0000-0000-0000-000000000006');
insert into poolx.sellers (id, display_name) values ('a6e00000-0000-0000-0000-000000000001', 'Admin Test Supplies');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Permission matrix: who may call what
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a6000000-0000-0000-0000-000000000005');
select throws_ok($$ select api.admin_metrics() $$, '42501', null, 'customers cannot open the admin dashboard');
select throws_ok($$ select api.admin_list_users(null, null, null, 10, 0) $$, '42501', null, 'customers cannot list users');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select api.admin_list_users(null, null, null, 10, 0) $$, '42501', null, 'staff without MFA (aal1) have no permissions');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002');
select lives_ok($$ select api.admin_list_users(null, null, null, 10, 0) $$, 'admin can list users');
select is((api.admin_metrics() -> 'poolx' ->> 'capturedPaise'), null, 'admin sees no money figures without finance.ledger.read');
select ok((api.admin_metrics() -> 'users') is not null, 'admin sees user metrics');
select throws_ok($$ select api.admin_list_roles() $$, '42501', null, 'admin cannot manage roles');
select throws_ok($$ select api.admin_list_payments(null, null, null, 10, 0) $$, '42501', null, 'admin cannot read finance');
select lives_ok($$ select api.admin_list_audit(null, null, null, 10, 0) $$, 'admin can read the audit log');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000003');
select ok((api.admin_metrics() -> 'auction' ->> 'depositLiabilityPaise') is not null, 'finance sees deposit liability');
select lives_ok($$ select api.admin_list_payments('auction', null, null, 10, 0) $$, 'finance can list payments');
select lives_ok($$ select api.admin_list_refunds(null, null, 10, 0) $$, 'finance can list refunds');
select lives_ok($$ select api.admin_ledger_overview('poolx', 10, 0) $$, 'finance can read the PoolX ledger');
select throws_ok($$ select api.admin_ledger_overview('both', 10, 0) $$, 'P0001', 'INVALID_REQUEST: choose poolx or auction', 'ledger views never mix domains');
select throws_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000006', 'SUSPENDED', 'Fraudulent chargebacks reported') $$,
  '42501', null, 'finance cannot suspend users');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000004');
select lives_ok($$ select api.admin_get_user('a6000000-0000-0000-0000-000000000006') $$, 'support can view a user');
select throws_ok($$ select api.admin_list_sellers() $$, '42501', null, 'support cannot manage sellers');
select throws_ok($$ select api.admin_list_audit(null, null, null, 10, 0) $$, '42501', null, 'support cannot read the audit log');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000008');
select throws_ok($$ select api.admin_list_users(null, null, null, 10, 0) $$, '42501', null, 'content manager cannot list users');
select ok((api.admin_metrics() -> 'users') = 'null'::jsonb or (api.admin_metrics() -> 'users') is null, 'content manager sees no user metrics');

-- ---------------------------------------------------------------------------
-- Users: search, detail, sessions, suspension
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002');
select is((api.admin_list_users('ad-target@', null, null, 10, 0) ->> 'total')::int, 1, 'search by email finds the user');
select is((api.admin_list_users(null, null, 'finance_manager', 100, 0) -> 'items') @> '[{"email": "ad-finance@test.test"}]', true, 'filter by role');
select is((api.admin_get_user('a6000000-0000-0000-0000-000000000006') ->> 'activeSessions')::int, 2, 'detail shows active sessions');
select throws_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000006', 'SUSPENDED', 'short') $$,
  'P0001', 'REASON_REQUIRED: give a reason (at least 10 characters)', 'suspension needs a reason');
select throws_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000002', 'SUSPENDED', 'Testing self suspension') $$,
  'P0001', 'NOT_ALLOWED: you cannot change your own account status', 'staff cannot suspend themselves');
select throws_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000007', 'SUSPENDED', 'Policy breach investigation') $$,
  '42501', null, 'admins cannot suspend staff (needs roles.manage)');
select lives_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000006', 'SUSPENDED', 'Fraudulent chargebacks reported') $$,
  'admin suspends a customer with a reason');
reset role;
select is((select status from core.profiles where id = 'a6000000-0000-0000-0000-000000000006'), 'SUSPENDED', 'profile is suspended');
select is((select count(*)::int from auth.sessions where user_id = 'a6000000-0000-0000-0000-000000000006'), 0, 'suspension ends every session');
select ok(exists (select 1 from core.audit_logs where action = 'user.suspend' and entity_id = 'a6000000-0000-0000-0000-000000000006'
                   and reason = 'Fraudulent chargebacks reported'), 'suspension is audited with its reason');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000006', 'aal1');
select throws_ok($$ select api.update_my_profile('x', null, null) $$, '42501', null, 'a suspended user cannot act');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002');
select lives_ok($$ select api.admin_set_user_status('a6000000-0000-0000-0000-000000000006', 'ACTIVE', 'Chargebacks resolved by the bank') $$,
  'admin reactivates the user');
reset role;
insert into auth.sessions (id, user_id) values ('a6500000-0000-0000-0000-000000000026', 'a6000000-0000-0000-0000-000000000006');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000004');
select is(api.admin_revoke_user_sessions('a6000000-0000-0000-0000-000000000006', 'User reported a lost phone'), 1, 'support revokes a user''s sessions');

-- A suspended staff member loses every permission, even in RLS policies.
reset role;
select ledger.post_journal('poolx', 'TEST_FIXTURE', 'test', 'a6f00000-0000-0000-0000-000000000001', 'test:admin-rls',
  jsonb_build_array(jsonb_build_object('account', 'poolx:gateway_clearing', 'debit', 100),
                    jsonb_build_object('account', 'poolx:contribution_liability', 'credit', 100)));
select pg_temp.as_user('a6000000-0000-0000-0000-000000000003');
select ok((select count(*) from ledger.entries) > 0, 'active finance staff can read ledger rows');
reset role;
update core.profiles set status = 'SUSPENDED', suspended_at = now(), suspension_reason = 'test' where id = 'a6000000-0000-0000-0000-000000000003';
select pg_temp.as_user('a6000000-0000-0000-0000-000000000003');
select is(core.has_permission('finance.ledger.read'), false, 'suspended staff have no permissions');
select is((select count(*)::int from ledger.entries), 0, 'suspended staff see no ledger rows through RLS');
reset role;
update core.profiles set status = 'ACTIVE', suspended_at = null, suspension_reason = null where id = 'a6000000-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a6000000-0000-0000-0000-000000000001');
select lives_ok($$ select api.admin_list_roles() $$, 'super admin lists roles');
select lives_ok($$ select api.admin_grant_role('a6000000-0000-0000-0000-000000000006', 'auction_manager', 'Hired as auction coordinator') $$,
  'super admin grants a staff role');
select throws_ok($$ select api.admin_grant_role('a6000000-0000-0000-0000-000000000006', 'auction_manager', 'Hired as auction coordinator') $$,
  'P0001', 'ALREADY_GRANTED: the user already has this role', 'no duplicate active role');
select throws_ok($$ select api.admin_grant_role('a6000000-0000-0000-0000-000000000001', 'finance_manager', 'Covering finance this week') $$,
  'P0001', 'NOT_ALLOWED: you cannot change your own roles', 'nobody changes their own roles');
select lives_ok($$ select api.admin_revoke_role('a6000000-0000-0000-0000-000000000006', 'auction_manager', 'Contract ended this month') $$,
  'super admin revokes the role');
reset role;
select ok(exists (select 1 from core.user_roles where user_id = 'a6000000-0000-0000-0000-000000000006' and role_key = 'auction_manager'
                   and revoked_at is not null and revoke_reason = 'Contract ended this month'), 'revocation keeps history with reason');
-- an admin who was given roles.manage still cannot remove the last active Super Admin
insert into core.role_permissions (role_key, permission_key) values ('admin', 'roles.manage');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002');
select throws_ok($$ select api.admin_revoke_role('a6000000-0000-0000-0000-000000000001', 'super_admin', 'Reorganising the admin team') $$,
  'P0001', 'LAST_SUPER_ADMIN: at least one active Super Admin must remain', 'the last Super Admin cannot be removed');
reset role;
delete from core.role_permissions where role_key = 'admin' and permission_key = 'roles.manage';
select pg_temp.as_user('a6000000-0000-0000-0000-000000000001');
select throws_ok($$ select api.admin_set_role_permission('super_admin', 'roles.manage', false, 'Trying to lock everyone out') $$,
  'P0001', 'NOT_ALLOWED: Super Admin keeps every permission', 'Super Admin keeps every permission');
select throws_ok($$ select api.admin_set_role_permission('customer', 'users.read', true, 'Customers should see users') $$,
  'P0001', 'INVALID_ROLE: permissions are assigned to staff roles only', 'customer roles never get staff permissions');
select lives_ok($$ select api.admin_set_role_permission('customer_support', 'audit.read', true, 'Support needs audit history for tickets') $$,
  'super admin can extend a staff role');
select pg_temp.as_user('a6000000-0000-0000-0000-000000000004');
select lives_ok($$ select api.admin_list_audit(null, null, null, 10, 0) $$, 'the matrix change takes effect immediately');

-- ---------------------------------------------------------------------------
-- Sellers
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a6000000-0000-0000-0000-000000000002');
select is((api.admin_list_sellers() ->> 'settlementsVisible')::boolean, false, 'admins see sellers without settlement figures');
select throws_ok($$ select api.admin_set_seller_status('poolx', 'a6e00000-0000-0000-0000-000000000001', 'VERIFIED', 'ok') $$,
  'P0001', 'NOTE_REQUIRED: record what was checked or why (at least 10 characters)', 'verification needs a documented note');
select lives_ok($$ select api.admin_set_seller_status('poolx', 'a6e00000-0000-0000-0000-000000000001', 'VERIFIED', 'GSTIN and bank letter checked') $$,
  'admin verifies a seller with a note');
reset role;
select ok((select verified_by = 'a6000000-0000-0000-0000-000000000002' and verified_at is not null from poolx.sellers
           where id = 'a6e00000-0000-0000-0000-000000000001'), 'verification records who and when');

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a6000000-0000-0000-0000-000000000003');
select throws_ok($$ select api.admin_export('payments', 'auction', now(), now() - interval '1 day') $$,
  'P0001', 'INVALID_REQUEST: choose a date range of up to one year', 'export needs a valid range');
select lives_ok($$ select api.admin_export('ledger', 'auction', now() - interval '30 days', now() + interval '1 day') $$, 'finance exports the ledger');
reset role;
select ok(exists (select 1 from core.audit_logs where action = 'finance.export' and actor_id = 'a6000000-0000-0000-0000-000000000003'), 'exports are audited');

select * from finish();
rollback;
