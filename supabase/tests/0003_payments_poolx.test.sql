begin;
select plan(54);

-- Fire these deferred checks per statement inside the test transaction (it never commits).
set constraints poolx.discount_tiers_monotonic, poolx.refunds_total_within_paid immediate;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'alice@pool.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@pool.test'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@pool.test'),
  ('d0000000-0000-0000-0000-00000000000d', 'manager@pool.test');
select core.operator_grant_role('manager@pool.test', 'poolx_manager', 'test fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- Staff pool management
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.poolx_admin_save_pool(null, '{}'::jsonb) $$, '42501', null, 'customers cannot create pools');
reset role;

select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d', 'aal1');
select throws_ok($$ select api.poolx_admin_save_pool(null, '{}'::jsonb) $$, '42501', null, 'staff without MFA cannot create pools');
reset role;

select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d', 'aal2');
select throws_ok($$ select api.poolx_admin_save_pool(null, jsonb_build_object(
    'slug', 'bad-ref', 'title', 'Bad reference', 'summary', 'A summary that is long enough', 'productName', 'Thing',
    'categorySlug', 'electronics', 'baseUnitPricePaise', '100000',
    'referencePricePaise', '150000', 'minQtyPerMember', 1, 'maxQtyPerMember', 2, 'minMembers', 1, 'targetMembers', 3,
    'deadlineAt', (now() + interval '2 days')::text)) $$,
  '23514', null, 'a reference price without a stated source is rejected');

insert into t values ('pool', api.poolx_admin_save_pool(null, jsonb_build_object(
  'slug', 'test-phones', 'title', 'Test phone pool', 'summary', 'A pool used by the database tests', 'productName', 'Phone X',
  'categorySlug', 'smartphones', 'baseUnitPricePaise', '1000000',
  'minQtyPerMember', 1, 'maxQtyPerMember', 2, 'minMembers', 2, 'targetMembers', 3,
  'deadlineAt', (now() + interval '2 days')::text))::text);
select ok((select v from t where k = 'pool') is not null, 'manager creates a draft pool');

select throws_ok($$ select api.poolx_admin_set_tiers((select v::uuid from t where k = 'pool'),
  '[{"threshold":2,"discountBps":1000},{"threshold":3,"discountBps":500}]') $$,
  '23514', null, 'tiers whose discount does not increase are rejected');
select is(api.poolx_admin_set_tiers((select v::uuid from t where k = 'pool'),
  '[{"threshold":2,"discountBps":1000},{"threshold":3,"discountBps":1500}]'), 2, 'valid tiers saved');

select is(api.poolx_get_pool('test-phones'), null, 'draft pools are not publicly visible');
select is(api.poolx_admin_publish((select v::uuid from t where k = 'pool')) ->> 'status', 'ACTIVE', 'pool published');
select throws_ok($$ select api.poolx_admin_set_tiers((select v::uuid from t where k = 'pool'), '[]') $$, 'P0001', null,
  'tiers are frozen once published');
select throws_ok($$ select api.poolx_admin_verify_seller(gen_random_uuid(), 'checked GST certificate') $$, '42501', null,
  'poolx manager cannot verify sellers (needs sellers.manage)');
reset role;

-- ---------------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from jsonb_array_elements(api.poolx_list_pools('Test phone pool', null, null, 48, 0) -> 'items') i
           where i ->> 'slug' = 'test-phones'), 1, 'anon lists the published pool');
select is((api.poolx_list_pools('phone', 'smartphones', 'popular', 10, 0) -> 'items' -> 0 ->> 'slug'), 'test-phones', 'search + category filter work');
select is((api.poolx_list_pools('zzz-no-match', null, null, null, null) ->> 'total')::int, 0, 'non-matching search returns nothing');
select is(api.poolx_get_pool('test-phones') ->> 'currentUnitPricePaise', '1000000', 'no members yet → base price');
select is(api.poolx_get_pool('test-phones') -> 'nextTier' ->> 'unitPricePaise', '900000', 'next tier price shown (10% off)');
select throws_ok($$ select api.poolx_start_contribution(gen_random_uuid(), 1) $$, '42501', null, 'anon cannot join pools');
reset role;

-- ---------------------------------------------------------------------------
-- Joining: server-computed amounts, no duplicate attempts
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 3) $$, 'P0001',
  'INVALID_QUANTITY: choose between 1 and 2', 'quantity outside the pool limits is rejected');
insert into t values ('a_attempt', api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 1) ->> 'attemptId');
select is(api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 1) ->> 'attemptId',
  (select v from t where k = 'a_attempt'), 'repeating join reuses the same pending attempt (no duplicate charge)');
select is((select count(*)::int from core.payment_attempts), 1, 'alice sees exactly one payment attempt');
select is((select amount_paise from core.payment_attempts), 1000000::bigint, 'amount computed server-side from base price');
select is((select provider from core.payment_attempts), null, 'provider is not chosen by the user');
reset role;

set local role service_role;
select is(api.payments_attach_order((select v::uuid from t where k = 'a_attempt'), 'sandbox', 'order_a') ->> 'status', 'PENDING',
  'server attaches the provider order');
select is(api.payments_process_event('sandbox', 'evt_a0', 'payment.captured', 'order_a', 'pay_a', 999999, 'INR', null, '{}'),
  'AMOUNT_MISMATCH', 'a captured amount that differs from the attempt is not applied');
select is(api.payments_process_event('sandbox', 'evt_a1', 'payment.captured', 'order_a', 'pay_a', 1000000, 'INR', null, '{}'),
  'CONTRIBUTION_CONFIRMED', 'verified capture confirms the contribution');
select is(api.payments_process_event('sandbox', 'evt_a1', 'payment.captured', 'order_a', 'pay_a', 1000000, 'INR', null, '{}'),
  'DUPLICATE', 'the same webhook event twice is a no-op');
select is(api.payments_process_event('sandbox', 'evt_a2', 'payment.captured', 'order_a', 'pay_a', 1000000, 'INR', null, '{}'),
  'ALREADY_CAPTURED', 'a second capture event for the same order changes nothing');
select is(api.payments_process_event('sandbox', 'evt_x', 'payment.captured', 'order_unknown', 'pay_x', 1, 'INR', null, '{}'),
  'UNKNOWN_ORDER', 'unknown orders are recorded but not applied');
reset role;

select is((select count(*)::int from ledger.journals j join poolx.contributions c on c.id = j.reference_id
           where j.kind = 'CONTRIBUTION_CAPTURED' and c.payment_attempt_id = (select v::uuid from t where k = 'a_attempt')), 1,
  'exactly one capture journal');
select is((select count(*)::int from core.payment_webhook_events where provider_event_id = 'evt_a1'), 1, 'webhook event stored once');
select is((select status from poolx.members where user_id = 'a0000000-0000-0000-0000-00000000000a'), 'ACTIVE', 'alice is an active member');

select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is(api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 1) ->> 'status', 'ALREADY_MEMBER',
  'an active member cannot pay twice');
reset role;

-- bob joins at the price for 1 confirmed member (no tier yet), then the 2-member tier unlocks
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from ledger.entries), 0, 'customers cannot read the ledger');
insert into t values ('b_attempt', api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 2) ->> 'attemptId');
select is((select count(*)::int from poolx.contributions), 1, 'bob cannot see alice''s contributions');
select is((select count(*)::int from poolx.members), 1, 'bob cannot see alice''s membership');
reset role;
set local role service_role;
select api.payments_attach_order((select v::uuid from t where k = 'b_attempt'), 'sandbox', 'order_b');
select is(api.payments_process_event('sandbox', 'evt_b1', 'payment.captured', 'order_b', 'pay_b', 2000000, 'INR', null, '{}'),
  'CONTRIBUTION_CONFIRMED', 'bob confirmed');
reset role;
set local role anon;
select is(api.poolx_get_pool('test-phones') ->> 'currentUnitPricePaise', '900000', 'price drops to the 2-member tier');
select is((api.poolx_get_pool('test-phones') ->> 'activeMembers')::int, 2, 'member count comes from confirmed contributions');
reset role;
select is(poolx.discounted_price(999, 1500), 849::bigint, 'discount rounds half-up to the paisa (999 − 149.85→150)');

-- ---------------------------------------------------------------------------
-- Ledger integrity
-- ---------------------------------------------------------------------------
select is((select sum(debit_paise) - sum(credit_paise) from ledger.entries), 0::numeric, 'ledger is balanced overall');
select ok(not exists (select 1 from ledger.entries e join ledger.journals j on j.id = e.journal_id
                      join ledger.accounts a on a.code = e.account_code where a.domain <> j.domain),
  'no entry crosses domains');
select throws_ok($$ select ledger.post_journal('poolx', 'TEST', 'test', gen_random_uuid(), 'x-domain',
  '[{"account":"poolx:gateway_clearing","debit":5},{"account":"auction:deposit_liability","credit":5}]') $$,
  '23514', null, 'a PoolX journal cannot touch auction accounts');
insert into ledger.journals (id, domain, kind, reference_type, reference_id, idempotency_key)
values ('eeeeeeee-0000-0000-0000-000000000001', 'poolx', 'TEST', 'test', gen_random_uuid(), 'unbalanced');
insert into ledger.entries (journal_id, account_code, debit_paise) values ('eeeeeeee-0000-0000-0000-000000000001', 'poolx:gateway_clearing', 10);
select throws_ok($$ set constraints ledger.entries_balanced immediate $$, '23514', null, 'an unbalanced journal is rejected');
select throws_ok($$ update ledger.entries set debit_paise = 1 $$, '42501', null, 'ledger entries cannot be edited');

-- ---------------------------------------------------------------------------
-- Withdrawal → refund lifecycle (idempotent)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
select is(api.poolx_withdraw((select v::uuid from t where k = 'pool')) ->> 'status', 'WITHDRAWN', 'alice withdraws');
select is((select status from poolx.refunds), 'REFUND_ELIGIBLE', 'a full refund becomes eligible');
select is((select amount_paise from poolx.refunds), 1000000::bigint, 'refund equals the full contribution');
reset role;

set local role service_role;
insert into t select 'refund', c.refund_id::text from api.poolx_claim_refunds(50) c
  join poolx.refunds r on r.id = c.refund_id where r.user_id = 'a0000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from api.poolx_claim_refunds(50) c join poolx.refunds r on r.id = c.refund_id
           where r.user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'a claimed refund is not handed out twice');
select is(api.poolx_record_refund_result((select v::uuid from t where k = 'refund'), 'PROCESSED', 'rfnd_1', null, null),
  'REFUNDED', 'provider-confirmed refund completes');
select is(api.poolx_record_refund_result((select v::uuid from t where k = 'refund'), 'PROCESSED', 'rfnd_1', null, null),
  'ALREADY_REFUNDED', 'recording the same result again changes nothing');
reset role;
select is((select count(*)::int from ledger.journals where kind = 'CONTRIBUTION_REFUNDED'
           and reference_id = (select v::uuid from t where k = 'refund')), 1, 'exactly one refund journal');
select throws_ok($$ insert into poolx.refunds (contribution_id, pool_id, user_id, amount_paise, reason)
  select contribution_id, pool_id, user_id, amount_paise, 'MANUAL' from poolx.refunds limit 1 $$,
  '23505', null, 'a contribution cannot be fully refunded twice');

-- ---------------------------------------------------------------------------
-- Late capture after withdrawing a pending payment → refunded, never applied
-- ---------------------------------------------------------------------------
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
insert into t values ('c_attempt', api.poolx_start_contribution((select v::uuid from t where k = 'pool'), 1) ->> 'attemptId');
reset role;
set local role service_role;
select api.payments_attach_order((select v::uuid from t where k = 'c_attempt'), 'sandbox', 'order_c');
reset role;
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select api.poolx_withdraw((select v::uuid from t where k = 'pool'));
reset role;
set local role service_role;
select is(api.payments_process_event('sandbox', 'evt_c1', 'payment.captured', 'order_c', 'pay_c',
  (select amount_paise from core.payment_attempts where id = (select v::uuid from t where k = 'c_attempt')), 'INR', null, '{}'),
  'LATE_CAPTURE_REFUND', 'a capture after withdrawal is refunded, not applied');
reset role;

-- ---------------------------------------------------------------------------
-- Cancellation refunds every confirmed member; HTTP privileges
-- ---------------------------------------------------------------------------
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d', 'aal2');
select is((api.poolx_admin_cancel((select v::uuid from t where k = 'pool'), 'Seller withdrew the offer') ->> 'refunds')::int, 1,
  'cancelling refunds the remaining confirmed member (bob)');
reset role;

select ok(not has_function_privilege('authenticated', 'api.payments_process_event(text,text,text,text,text,bigint,text,text,jsonb)', 'execute'),
  'users cannot submit payment events');

select * from finish();
rollback;
