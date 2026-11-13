begin;
select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures (run as postgres). Inserting into auth.users fires the profile trigger.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.test',   '{}'),
  ('33333333-3333-3333-3333-333333333333', 'staff@example.test', '{"display_name":"Staff"}');

select core.operator_grant_role('staff@example.test', 'admin', 'test fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1', p_session uuid default null) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
                      'session_id', coalesce(p_session, gen_random_uuid()))::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------
select is((select count(*)::int from core.profiles where id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')),
  3, 'profiles are created for new auth users');
select is((select display_name from core.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice', 'display name copied from sign-up metadata');
select is((select role_key from core.user_roles where user_id = '22222222-2222-2222-2222-222222222222'),
  'customer', 'new users get the customer role');

-- ---------------------------------------------------------------------------
-- Reference data mirrors the permission matrix
-- ---------------------------------------------------------------------------
select is((select count(*)::int from core.role_permissions where role_key = 'super_admin'),
  (select count(*)::int from core.permissions), 'super_admin holds every permission');
select ok(not exists (select 1 from core.role_permissions where role_key = 'admin' and permission_key = 'roles.manage'),
  'admin cannot manage roles');
select ok(not exists (select 1 from core.role_permissions where role_key = 'admin' and permission_key = 'auction.deposit.refund.manual'),
  'admin cannot issue manual deposit refunds');
select ok(not exists (select 1 from core.permissions where key ~ '(disable|bypass|skip)'),
  'no permission exists to disable or bypass controls (e.g. deposits)');
select ok(not exists (select 1 from core.role_permissions rp join core.roles r on r.key = rp.role_key where not r.is_staff),
  'non-staff roles hold no admin permissions');

-- ---------------------------------------------------------------------------
-- RLS: profiles — SELECT
-- ---------------------------------------------------------------------------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from core.profiles), 1, 'alice sees exactly one profile');
select is((select id from core.profiles), '11111111-1111-1111-1111-111111111111'::uuid, 'alice sees her own profile');
select is((select count(*)::int from core.profiles where id = '22222222-2222-2222-2222-222222222222'), 0,
  'alice cannot read bob''s profile (IDOR)');
select ok(not core.has_permission('users.read'), 'customer lacks users.read');

-- RLS: profiles — INSERT / UPDATE / DELETE denied for end users
select throws_ok($$ insert into core.profiles (id, email) values (gen_random_uuid(), 'x@example.test') $$,
  '42501', null, 'authenticated cannot INSERT profiles');
select throws_ok($$ update core.profiles set display_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'authenticated cannot UPDATE profiles directly');
select throws_ok($$ delete from core.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'authenticated cannot DELETE profiles');

-- user_roles
select is((select count(*)::int from core.user_roles), 1, 'alice sees only her own role rows');
select throws_ok($$ insert into core.user_roles (user_id, role_key) values ('11111111-1111-1111-1111-111111111111', 'super_admin') $$,
  '42501', null, 'authenticated cannot self-grant roles');
select throws_ok($$ update core.user_roles set role_key = 'super_admin' $$, '42501', null, 'authenticated cannot UPDATE user_roles');
select throws_ok($$ delete from core.user_roles $$, '42501', null, 'authenticated cannot DELETE user_roles');

-- roles reference data readable, not writable
select ok((select count(*) from core.roles) = 11, 'roles are readable');
select throws_ok($$ insert into core.roles (key, name, is_staff) values ('evil', 'Evil', true) $$, '42501', null,
  'authenticated cannot INSERT roles');
select throws_ok($$ insert into core.role_permissions values ('customer', 'roles.manage') $$, '42501', null,
  'authenticated cannot grant permissions to roles');

-- ---------------------------------------------------------------------------
-- Staff permissions require MFA (aal2)
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'aal1');
select ok(core.is_staff(), 'staff user is recognised as staff');
select ok(not core.has_permission('users.read'), 'staff permission is NOT effective at aal1');
select is((select count(*)::int from core.profiles), 1, 'staff at aal1 sees only own profile');
select is(jsonb_array_length(api.get_my_account() -> 'permissions'), 0, 'get_my_account lists no staff permissions at aal1');

reset role;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333', 'aal2');
select ok(core.has_permission('users.read'), 'staff permission is effective at aal2');
select ok((select count(*) from core.profiles) >= 3, 'staff with users.read at aal2 can list profiles');
select ok(not core.has_permission('roles.manage'), 'admin still lacks roles.manage at aal2');

-- ---------------------------------------------------------------------------
-- Account API
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select is(api.update_my_profile('Alice A', 'Pune', 'Maharashtra') ->> 'city', 'Pune', 'user can update own profile via API');
select throws_ok($$ select api.update_my_profile(repeat('x', 81), null, null) $$, '23514', null,
  'over-long display name rejected by constraint');
select is(api.get_my_account() ->> 'email', 'alice@example.test', 'get_my_account returns own account');

-- sessions: fixtures inserted as postgres
reset role;
insert into auth.sessions (id, user_id, created_at, updated_at, aal)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', now(), now(), 'aal1'),
       ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', now(), now(), 'aal1');

select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select is(api.revoke_my_session('aaaaaaaa-0000-0000-0000-000000000001'), false, 'bob cannot revoke alice''s session');
select is((select count(*)::int from api.list_my_sessions()), 0, 'bob does not see alice''s sessions');

reset role;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111', 'aal1', 'aaaaaaaa-0000-0000-0000-000000000002');
select is((select count(*)::int from api.list_my_sessions()), 2, 'alice sees her two sessions');
select is((select count(*)::int from api.list_my_sessions() where is_current), 1, 'current session is flagged');
select throws_ok($$ select api.revoke_my_session('aaaaaaaa-0000-0000-0000-000000000002') $$, '22023', null,
  'current session cannot be revoked via revoke_my_session');
select is(api.revoke_my_session('aaaaaaaa-0000-0000-0000-000000000001'), true, 'alice revokes her other session');

-- deletion request
select is(api.request_account_deletion('moving away') ->> 'status', 'DELETION_REQUESTED', 'deletion can be requested');

-- ---------------------------------------------------------------------------
-- Audit log is append-only and private
-- ---------------------------------------------------------------------------
select is((select count(*)::int from core.audit_logs), 0, 'customer cannot read audit logs');
reset role;
select throws_ok($$ update core.audit_logs set action = 'tampered' $$, '42501', null, 'audit rows cannot be updated, even by the owner role');

-- ---------------------------------------------------------------------------
-- HTTP surface: api.* execute privileges
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'api.get_my_account()', 'execute'), 'anon cannot call get_my_account');
select ok(not has_function_privilege('anon', 'api.update_my_profile(text,text,text)', 'execute'), 'anon cannot call update_my_profile');
select ok(not has_function_privilege('authenticated', 'api.rate_limit_hit(text,integer,integer)', 'execute'),
  'signed-in users cannot touch the rate limiter');
select ok(not has_function_privilege('authenticated', 'core.operator_grant_role(text,text,text)', 'execute'),
  'signed-in users cannot call the operator role grant');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'api' and c.relkind in ('r', 'v', 'm', 'p')), 0, 'the api schema contains no tables or views');

select * from finish();
rollback;
