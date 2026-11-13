begin;
select plan(36);

-- ---------------------------------------------------------------------------
-- Fixtures: base ₹1,000; 10% off at 2 members, 20% off at 3 members; 1% fee
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'lc-alice@pool.test'),
  ('b1000000-0000-0000-0000-00000000000b', 'lc-bob@pool.test'),
  ('c1000000-0000-0000-0000-00000000000c', 'lc-carol@pool.test'),
  ('d1000000-0000-0000-0000-00000000000d', 'lc-manager@pool.test'),
  ('e1000000-0000-0000-0000-00000000000e', 'lc-finance@pool.test');
select core.operator_grant_role('lc-manager@pool.test', 'poolx_manager', 'test fixture');
select core.operator_grant_role('lc-finance@pool.test', 'finance_manager', 'test fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create function pg_temp.join_and_pay(p_uid uuid, p_pool uuid, p_qty int, p_tag text) returns void language plpgsql as $$
declare v_attempt uuid; v_amount bigint;
begin
  perform pg_temp.as_user(p_uid);
  v_attempt := (api.poolx_start_contribution(p_pool, p_qty) ->> 'attemptId')::uuid;
  reset role;
  select amount_paise into v_amount from core.payment_attempts where id = v_attempt;
  perform api.payments_attach_order(v_attempt, 'sandbox', 'order_' || p_tag);
  perform api.payments_process_event('sandbox', 'evt_' || p_tag, 'payment.captured', 'order_' || p_tag, 'pay_' || p_tag,
                                     v_amount, 'INR', null, '{}');
end $$;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;

insert into poolx.sellers (id, display_name) values ('5e000000-0000-0000-0000-000000000001', 'LC Seller');
insert into poolx.pools (id, slug, title, summary, product_name, category_id, seller_id, base_unit_price_paise, platform_fee_bps,
                         min_qty_per_member, max_qty_per_member, min_members, target_members, deadline_at, status, published_at)
values ('9e000000-0000-0000-0000-000000000001', 'lc-pool', 'Lifecycle pool', 'Pool for the lifecycle tests', 'Widget',
        (select id from poolx.categories where slug = 'electronics'), '5e000000-0000-0000-0000-000000000001', 100000, 100,
        1, 5, 2, 3, now() + interval '2 days', 'ACTIVE', now());
insert into poolx.discount_tiers (pool_id, threshold, discount_bps) values
  ('9e000000-0000-0000-0000-000000000001', 2, 1000), ('9e000000-0000-0000-0000-000000000001', 3, 2000);

-- alice pays base (0 members before her), bob pays base (1 member), carol pays 10% tier (2 members)
select pg_temp.join_and_pay('a1000000-0000-0000-0000-00000000000a', '9e000000-0000-0000-0000-000000000001', 1, 'lca');
select pg_temp.join_and_pay('b1000000-0000-0000-0000-00000000000b', '9e000000-0000-0000-0000-000000000001', 2, 'lcb');
select pg_temp.join_and_pay('c1000000-0000-0000-0000-00000000000c', '9e000000-0000-0000-0000-000000000001', 1, 'lcc');

select is((select amount_paise from poolx.contributions where user_id = 'a1000000-0000-0000-0000-00000000000a'), 101000::bigint,
  'alice paid base + 1% fee');
select is((select amount_paise from poolx.contributions where user_id = 'c1000000-0000-0000-0000-00000000000c'), 90900::bigint,
  'carol paid the 10% tier + fee');

-- ---------------------------------------------------------------------------
-- Closing, negotiation, lock permissions and preconditions
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.poolx_admin_close_joining('9e000000-0000-0000-0000-000000000001') $$, '42501', null,
  'customers cannot close a pool');
reset role;

select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
select throws_ok($$ select api.poolx_admin_lock('9e000000-0000-0000-0000-000000000001') $$, 'P0001', null,
  'cannot lock while the pool is still open');
select is(api.poolx_admin_close_joining('9e000000-0000-0000-0000-000000000001') ->> 'status', 'THRESHOLD_MET', 'joining closed');
select throws_ok($$ select api.poolx_admin_lock('9e000000-0000-0000-0000-000000000001') $$, 'P0001',
  'SELLER_NOT_CONFIRMED: record the seller''s accepted offer first', 'lock requires an accepted seller offer');
select ok(api.poolx_admin_record_negotiation('9e000000-0000-0000-0000-000000000001', 85000, 'Seller asked for ₹850; countered', 'REJECTED') is not null,
  'a rejected offer is recorded');
select ok(api.poolx_admin_record_negotiation('9e000000-0000-0000-0000-000000000001', 90000, 'Seller confirms ₹900/unit, dispatch in 5 days', 'ACCEPTED') is not null,
  'an accepted offer is recorded');
select is((select status from poolx.pools where id = '9e000000-0000-0000-0000-000000000001'), 'NEGOTIATING', 'pool is negotiating');
select throws_ok($$ update poolx.negotiations set outcome = 'ACCEPTED' $$, '42501', null, 'negotiation records are append-only');
reset role;
select throws_ok($$ update poolx.negotiations set outcome = 'ACCEPTED' $$, '42501', null, 'negotiation records are append-only even for the owner');

-- ---------------------------------------------------------------------------
-- Lock: final price = min(tier price at 3 members = ₹800, accepted offer ₹900) = ₹800
-- ---------------------------------------------------------------------------
select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
insert into t values ('lock', api.poolx_admin_lock('9e000000-0000-0000-0000-000000000001')::text);
-- fire the deferred integrity checks NOW, as the staff user (what happens at COMMIT over HTTP)
select lives_ok($$ set constraints ledger.entries_balanced, poolx.refunds_total_within_paid immediate $$,
  'ledger/refund integrity checks pass when fired as a non-finance staff user');
set constraints ledger.entries_balanced, poolx.refunds_total_within_paid deferred;
reset role;
select is((select v::jsonb ->> 'finalUnitPricePaise' from t where k = 'lock'), '80000', 'final unit price is the cheaper of tier and offer');
select is((select (v::jsonb ->> 'orders')::int from t where k = 'lock'), 3, 'one order per confirmed member');
select is((select (v::jsonb ->> 'priceAdjustments')::int from t where k = 'lock'), 3, 'everyone paid more than the final price');
select is((select amount_paise from poolx.refunds where reason = 'PRICE_ADJUSTMENT' and user_id = 'a1000000-0000-0000-0000-00000000000a'),
  20200::bigint, 'alice is refunded ₹202 (₹1,010 paid − ₹808 final incl. fee)');
select is((select amount_paise from poolx.refunds where reason = 'PRICE_ADJUSTMENT' and user_id = 'b1000000-0000-0000-0000-00000000000b'),
  40400::bigint, 'bob (qty 2) is refunded ₹404');
select is((select amount_paise from poolx.orders where user_id = 'c1000000-0000-0000-0000-00000000000c'), 80800::bigint,
  'carol''s order is ₹808 (₹800 + 1% fee)');

select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
select is((api.poolx_admin_lock('9e000000-0000-0000-0000-000000000001') ->> 'alreadyLocked')::boolean, true, 'locking again is a no-op');
reset role;
select is((select count(*)::int from poolx.orders where pool_id = '9e000000-0000-0000-0000-000000000001'), 3, 'still exactly three orders');
select is((select count(*)::int from poolx.refunds where pool_id = '9e000000-0000-0000-0000-000000000001' and reason = 'PRICE_ADJUSTMENT'), 3,
  'still exactly three adjustments');
select is((select sum(e.debit_paise) - sum(e.credit_paise) from ledger.entries e join ledger.journals j on j.id = e.journal_id
           join poolx.orders o on o.id = j.reference_id where o.pool_id = '9e000000-0000-0000-0000-000000000001'), 0::numeric,
  'order journals balance');
select is((select sum(e.credit_paise) from ledger.entries e join ledger.journals j on j.id = e.journal_id
           join poolx.orders o on o.id = j.reference_id
           where o.pool_id = '9e000000-0000-0000-0000-000000000001' and e.account_code = 'poolx:platform_fee_revenue'), 3200::numeric,
  'disclosed fees (1% of ₹3,200) recognised as revenue');

-- ---------------------------------------------------------------------------
-- Shipping, delivery, disputes
-- ---------------------------------------------------------------------------
insert into t select 'o_' || left(user_id::text, 1), id::text from poolx.orders where pool_id = '9e000000-0000-0000-0000-000000000001';

select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.poolx_admin_ship_order((select v::uuid from t where k = 'o_a'), 'BlueDart', 'BD123', null) $$, '42501', null,
  'customers cannot mark orders shipped');
select is((select count(*)::int from poolx.orders), 1, 'alice sees only her own order');
reset role;

select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
select lives_ok($$ select api.poolx_admin_ship_order((select v::uuid from t where k = 'o_' || x), 'BlueDart', 'BD' || x || '001', 'https://example.test/track')
                   from unnest(array['a','b','c']) x $$, 'manager ships all three orders');
reset role;

select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
select throws_ok($$ select api.poolx_confirm_delivery((select v::uuid from t where k = 'o_a')) $$, 'P0001',
  'ORDER_NOT_FOUND: order not found', 'bob cannot confirm alice''s delivery');
reset role;

select pg_temp.as_user('a1000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.poolx_confirm_delivery((select v::uuid from t where k = 'o_a')) $$, 'alice confirms delivery');
reset role;
select is((select status from poolx.members where user_id = 'a1000000-0000-0000-0000-00000000000a'), 'FULFILLED', 'alice''s membership is fulfilled');

select pg_temp.as_user('b1000000-0000-0000-0000-00000000000b');
insert into t values ('dispute', api.poolx_open_dispute((select v::uuid from t where k = 'o_b'), 'One of the two units arrived damaged.')::text);
reset role;

select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
select throws_ok($$ select api.poolx_admin_resolve_dispute((select v::uuid from t where k = 'dispute'), 'REFUND', 50000, 'Damaged unit, refund one') $$,
  '42501', null, 'a PoolX manager cannot issue a dispute refund (needs poolx.refunds.manual)');
reset role;

select pg_temp.as_user('e1000000-0000-0000-0000-00000000000e', 'aal2');
select throws_ok($$ select api.poolx_admin_resolve_dispute((select v::uuid from t where k = 'dispute'), 'REFUND', 999999, 'Too much money back') $$,
  'P0001', null, 'a refund above what remains refundable is rejected');
select is(api.poolx_admin_resolve_dispute((select v::uuid from t where k = 'dispute'), 'REFUND', 80000, 'One damaged unit refunded at ₹800') ->> 'status',
  'RESOLVED_REFUND', 'finance resolves with a partial refund');
reset role;
select is((select status from poolx.orders where id = (select v::uuid from t where k = 'o_b')), 'SHIPPED', 'partial refund returns the order to its previous status');

-- dispute refund is processed by the worker: ledger debits seller_payable (money already moved to the seller side)
set local role service_role;
select api.poolx_record_refund_result((select refund_id from poolx.disputes where id = (select v::uuid from t where k = 'dispute')), 'PROCESSED', 'rf_d', null, null);
reset role;
select is((select e.account_code from ledger.entries e join ledger.journals j on j.id = e.journal_id
           where j.reference_id = (select refund_id from poolx.disputes where id = (select v::uuid from t where k = 'dispute')) and e.debit_paise > 0),
  'poolx:seller_payable', 'a post-order dispute refund reduces the seller payable');

-- remaining deliveries complete the pool
select pg_temp.as_user('d1000000-0000-0000-0000-00000000000d', 'aal2');
select throws_ok($$ select api.poolx_admin_mark_delivered((select v::uuid from t where k = 'o_c'), '') $$, 'P0001', null,
  'staff delivery needs evidence');
select api.poolx_admin_mark_delivered((select v::uuid from t where k = 'o_' || x), 'Courier POD received') from unnest(array['b','c']) x;
reset role;
select is((select status from poolx.pools where id = '9e000000-0000-0000-0000-000000000001'), 'COMPLETED', 'pool completes when every order is finished');

select * from finish();
rollback;
