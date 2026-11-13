-- Auction module acceptance tests (AUCTION_REQUIREMENTS.md §Acceptance, master prompt §24).
-- Test numbers in descriptions refer to the 20 mandatory cases. #8 (true concurrency) is covered by
-- tests/integration/auction-concurrency.test.ts; #20 (theme change) by the Phase 7 suite.
begin;
select plan(90);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-00000000000a', 'au-alice@test.test'),
  ('b2000000-0000-0000-0000-00000000000b', 'au-bob@test.test'),
  ('c2000000-0000-0000-0000-00000000000c', 'au-carol@test.test'),
  ('d2000000-0000-0000-0000-00000000000d', 'au-dave@test.test'),
  ('e2000000-0000-0000-0000-00000000000e', 'au-eve@test.test'),
  ('f2000000-0000-0000-0000-00000000000f', 'au-frank@test.test'),
  ('52000000-0000-0000-0000-000000000005', 'au-seller@test.test'),
  ('62000000-0000-0000-0000-000000000006', 'au-manager@test.test'),
  ('72000000-0000-0000-0000-000000000007', 'au-finance@test.test'),
  ('82000000-0000-0000-0000-000000000008', 'au-finance2@test.test');
select core.operator_grant_role('au-manager@test.test', 'auction_manager', 'fixture');
select core.operator_grant_role('au-finance@test.test', 'finance_manager', 'fixture');
select core.operator_grant_role('au-finance2@test.test', 'finance_manager', 'fixture');
insert into auction.sellers (id, kind, display_name, profile_id) values
  ('5e200000-0000-0000-0000-000000000001', 'THIRD_PARTY', 'Seller Motors', '52000000-0000-0000-0000-000000000005');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role, anon;

-- start a deposit as a user and attach a provider order (as the server would); returns the attempt id
create function pg_temp.start_deposit(p_uid uuid, p_auction uuid, p_order text) returns uuid language plpgsql as $$
declare v_attempt uuid; v_terms text;
begin
  select terms_version into v_terms from auction.auctions where id = p_auction;
  perform pg_temp.as_user(p_uid);
  v_attempt := (api.auction_start_deposit(p_auction, v_terms) ->> 'attemptId')::uuid;
  reset role;
  perform api.payments_attach_order(v_attempt, 'sandbox', p_order);
  return v_attempt;
end $$;

create function pg_temp.capture(p_order text, p_event text) returns text language plpgsql as $$
declare v_amount bigint;
begin
  select amount_paise into v_amount from core.payment_attempts where provider = 'sandbox' and provider_order_id = p_order;
  return api.payments_process_event('sandbox', p_event, 'payment.captured', p_order, 'pay_' || p_order, v_amount, 'INR', null, '{}');
end $$;

create function pg_temp.bid(p_uid uuid, p_auction uuid, p_amount bigint, p_key text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.as_user(p_uid);
  v := api.auction_place_bid(p_auction, p_amount, p_key);
  reset role;
  return v;
end $$;

-- listing payloads
create function pg_temp.listing(p_slug text, p_category text, p_deposit_mode text, p_deposit_value bigint, p_reserve bigint default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'categorySlug', p_category, 'sellerId', '5e200000-0000-0000-0000-000000000001',
    'title', 'Test asset ' || p_slug, 'brand', 'Hyundai', 'model', 'Creta', 'year', '2021', 'condition', 'GOOD',
    'description', 'A well maintained vehicle used for automated acceptance tests.', 'city', 'Pune', 'state', 'Maharashtra',
    'pickupTerms', 'Pickup from seller yard within 7 days', 'charges', '[{"label":"Documentation fee","amountPaise":50000}]'::jsonb,
    'startingPricePaise', '50000000', 'reservePricePaise', coalesce(p_reserve::text, ''), 'minIncrementPaise', '500000',
    'startsAt', (now() - interval '1 minute')::text, 'endsAt', (now() + interval '2 hours')::text,
    'depositMode', coalesce(p_deposit_mode, ''), 'depositValue', coalesce(p_deposit_value::text, ''),
    'depositTerms', 'The deposit is fully refundable unless you win; if you win it is credited to your invoice.',
    'winnerPaymentDeadlineHours', '48',
    'vehicle', jsonb_build_object('manufacturer', 'Hyundai', 'variant', 'SX', 'registrationState', 'MH',
      'registrationMasked', 'MH 12 •• ••34', 'fuelType', 'PETROL', 'transmission', 'MANUAL', 'odometerKm', '42000',
      'ownersCount', '1', 'accidentDisclosure', 'None reported by seller', 'damageDisclosure', 'Minor scratches on rear bumper',
      'ownershipTransferTerms', 'Seller provides Form 29/30 and RC at handover'));
$$;

-- Start from "no deposit policy configured" regardless of the local dev seed (rolled back with the test).
alter table core.system_settings disable trigger system_settings_no_delete;
delete from core.system_settings where key like 'auction.deposit.%';
alter table core.system_settings enable trigger system_settings_no_delete;

-- ---------------------------------------------------------------------------
-- Deposit policy & publishing (Tests 1, 2)
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '0') $$, '23514', null,
  'Test 2: a zero global minimum deposit cannot be configured');
select throws_ok($$ insert into core.system_settings (key, value) values ('auction.deposit.enabled', 'false') $$, '23514', null,
  'there is no setting that can disable deposits');

select pg_temp.as_user('62000000-0000-0000-0000-000000000006', 'aal2');
insert into t values ('nocfg', api.auction_admin_save_listing(null, pg_temp.listing('acc-nocfg', 'used-cars', null, null))::text);
select throws_ok($$ select api.auction_admin_publish((select v::uuid from t where k = 'nocfg')) $$, 'P0001',
  'DEPOSIT_REQUIRED: configure the refundable participation deposit before publishing', 'Test 1: publishing without a deposit is rejected');
select throws_ok($$ select api.auction_admin_save_listing(null, pg_temp.listing('acc-zero', 'used-cars', 'FIXED', 0)) $$, '23514', null,
  'Test 2: a zero deposit configuration is rejected');
insert into t values ('fixed', api.auction_admin_save_listing(null, pg_temp.listing('acc-car', 'used-cars', 'FIXED', 200000))::text);
select throws_ok($$ select api.auction_admin_publish((select v::uuid from t where k = 'fixed')) $$, 'P0001',
  'DEPOSIT_POLICY_NOT_CONFIGURED: set auction.deposit.global_min_paise before publishing auctions',
  'publishing needs an owner-configured minimum deposit policy');
reset role;
select throws_ok($$ update auction.auctions set status = 'SCHEDULED', published_at = now() where id = (select v::uuid from t where k = 'nocfg') $$,
  '23514', null, 'Test 1: the database itself refuses a non-draft auction without a deposit');

insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000');   -- ₹500 (test value)
select is(auction.compute_deposit('PERCENT_OF_STARTING', 50, 50000000), 250000::bigint, '0.5% of ₹5,00,000 = ₹2,500');
select is(auction.compute_deposit('PERCENT_OF_STARTING', 1, 1000000), 50000::bigint, 'percentage deposits never go below the minimum');
select is(auction.compute_deposit('PERCENT_OF_STARTING', 3, 1000001), 50000::bigint, 'rounded up to the whole rupee, then floored at minimum');

select pg_temp.as_user('62000000-0000-0000-0000-000000000006', 'aal2');
select is(api.auction_admin_publish((select v::uuid from t where k = 'fixed')) ->> 'depositAmountPaise', '200000', 'auction published with a ₹2,000 deposit');
insert into t values ('b_auc', api.auction_admin_save_listing(null, pg_temp.listing('acc-bike', 'used-cars', 'FIXED', 100000))::text);
select api.auction_admin_publish((select v::uuid from t where k = 'b_auc'));
insert into t values ('reserve', api.auction_admin_save_listing(null, pg_temp.listing('acc-reserve', 'used-cars', 'FIXED', 100000, 90000000))::text);
select api.auction_admin_publish((select v::uuid from t where k = 'reserve'));
insert into t values ('default', api.auction_admin_save_listing(null, pg_temp.listing('acc-default', 'used-cars', 'FIXED', 100000))::text);
select api.auction_admin_publish((select v::uuid from t where k = 'default'));
reset role;
select throws_ok($$ update auction.auctions set deposit_amount_paise = 1 where id = (select v::uuid from t where k = 'fixed') $$, 'P0001', null,
  'the deposit is frozen once published');
select ok((select count(*) = 0 from auction.auctions where status <> 'DRAFT' and (deposit_amount_paise is null or deposit_amount_paise <= 0)),
  'no published auction anywhere has a missing or zero deposit');

-- ---------------------------------------------------------------------------
-- Bidding requires a verified, paid deposit for THIS auction (Tests 3–7, 19)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.auction_place_bid((select v::uuid from t where k = 'fixed'), 50000000, 'alice-k1-xxxxx') $$, 'P0001',
  'DEPOSIT_REQUIRED: pay the refundable deposit for this auction to bid', 'Test 3: bidding without paying is rejected');
select throws_ok($$ select api.auction_start_deposit((select v::uuid from t where k = 'fixed'), 'old-terms') $$, 'P0001',
  'TERMS_NOT_ACCEPTED: accept the current auction terms to continue', 'participation requires accepting the current terms');
reset role;

insert into t values ('a_att', pg_temp.start_deposit('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 'ord-alice')::text);
select is((select status from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'PAYMENT_PENDING', 'deposit is payment-pending');
select is((select amount_paise from core.payment_attempts where id = (select v::uuid from t where k = 'a_att')), 200000::bigint,
  'the charge is the server-frozen deposit amount');
select throws_ok($$ select pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 50000000, 'alice-k1-xxxxx') $$,
  'P0001', 'DEPOSIT_PENDING: your deposit payment is not confirmed yet', 'Test 4: a pending payment grants no bidding');
select is((select (api.auction_start_deposit((select v::uuid from t where k = 'fixed'), (select terms_version from auction.auctions where id = (select v::uuid from t where k = 'fixed'))) ->> 'attemptId')
           from (select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a')) s), (select v from t where k = 'a_att'),
  'D-8: retrying while pending reuses the same payment attempt (no second charge)');
reset role;

select is(pg_temp.capture('ord-alice', 'evt-alice-1'), 'DEPOSIT_PAID', 'Test 5: verified capture marks the deposit PAID');
select is(pg_temp.capture('ord-alice', 'evt-alice-1'), 'DUPLICATE', 'Test 15: the same webhook twice changes nothing');
select is((select count(*)::int from ledger.journals j join auction.deposits d on d.id = j.reference_id
           where d.user_id = 'a2000000-0000-0000-0000-00000000000a' and j.kind = 'DEPOSIT_CAPTURED'), 1, 'Test 15: exactly one ledger posting');
select is((select status from auction.participants where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'ACTIVE', 'Test 5: bidding permission activated');

select is(pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 50000000, 'alice-k1-xxxxx') ->> 'status', 'ACCEPTED',
  'Test 5: the paid depositor can bid');
select is(pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 50000000, 'alice-k1-xxxxx') ->> 'status', 'DUPLICATE',
  'a replayed bid (same idempotency key) is not accepted twice');
select throws_ok($$ select pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 50400000, 'alice-k2-xxxxx') $$,
  'P0001', 'BID_TOO_LOW: the minimum bid is 50500000 paise', 'bids below current + increment are rejected');
select is(pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'fixed'), 50500000, 'alice-k3-xxxxx') ->> 'status', 'ACCEPTED',
  'Test 6: the same depositor bids again');
select is((select count(*)::int from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 1,
  'Test 6: multiple bids, still exactly one deposit');
select is((select count(*)::int from core.payment_attempts where user_id = 'a2000000-0000-0000-0000-00000000000a'), 1,
  'Test 6: and exactly one payment');

select throws_ok($$ select pg_temp.bid('a2000000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'b_auc'), 50000000, 'alice-b1-xxxxx') $$,
  'P0001', 'DEPOSIT_REQUIRED: pay the refundable deposit for this auction to bid', 'Test 7: a deposit cannot be reused in another auction');
select throws_ok($$ update auction.deposits set auction_id = (select v::uuid from t where k = 'b_auc') where user_id = 'a2000000-0000-0000-0000-00000000000a' $$,
  'P0001', null, 'Test 7: a deposit cannot be moved to another auction');
select throws_ok($$ update auction.deposits set user_id = 'b2000000-0000-0000-0000-00000000000b' where user_id = 'a2000000-0000-0000-0000-00000000000a' $$,
  'P0001', null, 'a deposit cannot be transferred to another user');
select throws_ok($$ update auction.deposits set status = 'REFUNDED' where user_id = 'a2000000-0000-0000-0000-00000000000a' $$,
  'P0001', 'DIRECT_STATUS_CHANGE: use auction.transition_deposit()', 'deposit status cannot be set directly');
select throws_ok($$ select auction.transition_deposit((select id from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'FORFEITED', 'x') $$,
  'P0001', 'INVALID_TRANSITION: PAID → FORFEITED', 'only valid deposit transitions are allowed');

insert into t values ('terms', (select terms_version from auction.auctions where id = (select v::uuid from t where k = 'fixed')));
select pg_temp.as_user('52000000-0000-0000-0000-000000000005');
select throws_ok($$ select api.auction_start_deposit((select v::uuid from t where k = 'fixed'), (select v from t where k = 'terms')) $$,
  'P0001', 'SELLER_CANNOT_BID: sellers cannot participate in their own auction', 'Test 19: the seller cannot register for their own auction');
select throws_ok($$ select api.auction_place_bid((select v::uuid from t where k = 'fixed'), 60000000, 'seller-k1-xxxx') $$,
  'P0001', 'SELLER_CANNOT_BID: sellers cannot bid on their own auction', 'Test 19: the seller cannot bid on their own auction');
reset role;

-- bob outbids; carol pays but never bids; dave starts a deposit but never pays
select pg_temp.start_deposit('b2000000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'fixed'), 'ord-bob');
select pg_temp.capture('ord-bob', 'evt-bob-1');
select is(pg_temp.bid('b2000000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'fixed'), 56500000, 'bob-k1-xxxxxxx') ->> 'currentBidPaise', '56500000',
  'a higher bid becomes the current bid');
select pg_temp.start_deposit('c2000000-0000-0000-0000-00000000000c', (select v::uuid from t where k = 'fixed'), 'ord-carol');
select pg_temp.capture('ord-carol', 'evt-carol-1');
insert into t values ('d_att', pg_temp.start_deposit('d2000000-0000-0000-0000-00000000000d', (select v::uuid from t where k = 'fixed'), 'ord-dave')::text);

-- ---------------------------------------------------------------------------
-- Privacy (Test 18)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b2000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from auction.deposits), 1, 'Test 18: bob sees only his own deposit');
select is((select count(*)::int from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 0, 'Test 18: alice''s deposit is not visible to bob');
select is((select count(*)::int from auction.bids where user_id <> 'b2000000-0000-0000-0000-00000000000b'), 0, 'other users'' bids are not visible');
select is(jsonb_array_length(api.auction_my_activity() -> 'deposits'), 1, 'bob''s activity lists only his deposit');
reset role;
select ok(api.auction_bid_history('acc-car')::text !~ 'a2000000|b2000000', 'public bid history never exposes user ids');
select is(api.auction_bid_history('acc-car') -> 0 ->> 'bidder', 'Bidder 2', 'bidders appear only as "Bidder N"');
select ok(not has_function_privilege('anon', 'api.auction_place_bid(uuid,bigint,text)', 'execute'), 'anon cannot bid');
select ok(not has_function_privilege('authenticated', 'api.auction_close_due()', 'execute'), 'users cannot close auctions');
select ok(not has_function_privilege('authenticated', 'api.auction_claim_refunds(integer)', 'execute'), 'users cannot claim refunds');

-- ---------------------------------------------------------------------------
-- Closing (Tests 9–11, 14) — end time passes
-- ---------------------------------------------------------------------------
update auction.auctions set ends_at = clock_timestamp() - interval '1 second' where id = (select v::uuid from t where k = 'fixed');
select throws_ok($$ select pg_temp.bid('b2000000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'fixed'), 70000000, 'bob-late-xxxxx') $$,
  'P0001', 'AUCTION_NOT_LIVE: this auction is not accepting bids', 'Test 9: a bid after closing time is rejected');
set local role service_role;
select is(api.auction_close_due(), 1, 'the scheduled job closes the ended auction');
reset role;
select is(auction.close_auction((select v::uuid from t where k = 'fixed')), 'WON', 'closing again is idempotent');
select is((select count(*)::int from auction.results where auction_id = (select v::uuid from t where k = 'fixed')), 1, 'exactly one result');
select is((select winner_user_id from auction.results where auction_id = (select v::uuid from t where k = 'fixed')),
  'b2000000-0000-0000-0000-00000000000b'::uuid, 'highest bidder wins');

select is((select status from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'REFUND_ELIGIBLE', 'Test 10: the loser''s deposit becomes refund-eligible');
select is((select reason || ':' || amount_paise from auction.refunds where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'LOST:200000',
  'Test 10: full ₹2,000 refund, nothing deducted');
select is((select reason || ':' || amount_paise from auction.refunds where user_id = 'c2000000-0000-0000-0000-00000000000c'), 'NO_BID:200000',
  'Test 11: paid but never bid → full refund');
select is((select status from auction.deposits where user_id = 'd2000000-0000-0000-0000-00000000000d'), 'PAYMENT_FAILED', 'an unpaid deposit is closed out');
select is((select status from auction.deposits where user_id = 'b2000000-0000-0000-0000-00000000000b'), 'WINNER_ADJUSTMENT_PENDING', 'Test 14: the winner''s deposit is held for adjustment');
select is((select hammer_price_paise || '/' || charges_total_paise || '/' || deposit_credit_paise || '/' || total_payable_paise from auction.invoices
           where auction_id = (select v::uuid from t where k = 'fixed')), '56500000/50000/200000/56350000',
  'Test 14: ₹5,65,000 + ₹500 charges − ₹2,000 deposit = ₹5,63,500 payable');
select throws_ok($$ insert into auction.refunds (deposit_id, payment_attempt_id, auction_id, user_id, amount_paise, reason)
  select id, payment_attempt_id, auction_id, user_id, amount_paise - 100, 'MANUAL' from auction.deposits where user_id = 'b2000000-0000-0000-0000-00000000000b' $$,
  'P0001', null, 'D-9: a partial (deducted) deposit refund is impossible');

-- late capture of dave's abandoned payment → refunded, never bidding
select is(pg_temp.capture('ord-dave', 'evt-dave-1'), 'LATE_CAPTURE_REFUND', 'a payment confirmed after closing is refunded automatically');

-- ---------------------------------------------------------------------------
-- Refund engine (Tests 16, 17)
-- ---------------------------------------------------------------------------
set local role service_role;
insert into t select 'rf_' || left(r.user_id::text, 1), c.refund_id::text from api.auction_claim_refunds(50) c
  join auction.refunds r on r.id = c.refund_id where r.auction_id = (select v::uuid from t where k = 'fixed');
select is((select count(*)::int from api.auction_claim_refunds(50) c join auction.refunds r on r.id = c.refund_id
           where r.auction_id = (select v::uuid from t where k = 'fixed')), 0, 'Test 16: claimed refunds are not handed out twice');
reset role;
select is((select status from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'REFUND_INITIATED', 'deposit shows refund initiated');
select is((select status from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'REFUND_INITIATED',
  'not REFUNDED before the provider confirms');
set local role service_role;
select is(api.auction_record_refund_result((select v::uuid from t where k = 'rf_a'), 'PROCESSED', 'rfnd_alice', null, null), 'REFUNDED', 'provider confirms alice''s refund');
select is(api.auction_record_refund_result((select v::uuid from t where k = 'rf_a'), 'PROCESSED', 'rfnd_alice', null, null), 'ALREADY_REFUNDED',
  'Test 16: a retried result does not refund twice');
select is(api.auction_record_refund_result((select v::uuid from t where k = 'rf_c'), 'FAILED', null, 'bank timeout', true), 'REFUND_FAILED',
  'Test 17: a provider failure is recorded');
reset role;
select is((select status from auction.deposits where user_id = 'a2000000-0000-0000-0000-00000000000a'), 'REFUNDED', 'alice''s deposit is REFUNDED');
select is((select count(*)::int from ledger.journals where kind = 'DEPOSIT_REFUNDED' and reference_id = (select v::uuid from t where k = 'rf_a')), 1,
  'Test 16: exactly one refund ledger posting');
select is((select status || '/' || retryable::text || '/' || (next_retry_at > now())::text from auction.refunds where id = (select v::uuid from t where k = 'rf_c')),
  'REFUND_FAILED/true/true', 'Test 17: failed state retained with a scheduled retry');
select is((select status from auction.deposits where user_id = 'c2000000-0000-0000-0000-00000000000c'), 'REFUND_FAILED', 'Test 17: carol''s deposit shows REFUND_FAILED');
select ok(exists (select 1 from core.audit_logs where action = 'auction.refund.failed' and entity_id = (select v from t where k = 'rf_c')),
  'Test 17: the failure is recorded for finance (alert)');
set local role service_role;
select is((select count(*)::int from api.auction_claim_refunds(50) c where c.refund_id = (select v::uuid from t where k = 'rf_c')), 0,
  'a failed refund is not retried before its back-off time');
reset role;

-- ---------------------------------------------------------------------------
-- Winner pays: deposit credited exactly once (Test 14)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('b2000000-0000-0000-0000-00000000000b');
insert into t values ('inv_att', api.auction_start_invoice_payment((select id from auction.invoices where auction_id = (select v::uuid from t where k = 'fixed'))) ->> 'attemptId');
reset role;
select is((select amount_paise from core.payment_attempts where id = (select v::uuid from t where k = 'inv_att')), 56350000::bigint,
  'the winner is charged the balance only (deposit already counted)');
select api.payments_attach_order((select v::uuid from t where k = 'inv_att'), 'sandbox', 'ord-invoice');
select is(pg_temp.capture('ord-invoice', 'evt-invoice-1'), 'INVOICE_PAID', 'balance captured, invoice paid');
select is((select status from auction.deposits where user_id = 'b2000000-0000-0000-0000-00000000000b'), 'ADJUSTED', 'Test 14: deposit ADJUSTED');
select auction.settle_invoice((select id from auction.invoices where auction_id = (select v::uuid from t where k = 'fixed')));
select is((select count(*)::int from auction.deposit_adjustments a join auction.deposits d on d.id = a.deposit_id
           where d.user_id = 'b2000000-0000-0000-0000-00000000000b'), 1, 'Test 14: credited exactly once, even if settled again');
select is((select sum(e.debit_paise) - sum(e.credit_paise) from ledger.entries e join ledger.journals j on j.id = e.journal_id
           where e.account_code = 'auction:buyer_receivable' and e.user_id = 'b2000000-0000-0000-0000-00000000000b'), 0::numeric,
  'the winner owes nothing more: receivable is zero');

-- ---------------------------------------------------------------------------
-- Cancellation (Test 12) and reserve not met (Test 13)
-- ---------------------------------------------------------------------------
select pg_temp.start_deposit('e2000000-0000-0000-0000-00000000000e', (select v::uuid from t where k = 'b_auc'), 'ord-eve');
select pg_temp.capture('ord-eve', 'evt-eve-1');
select pg_temp.as_user('a2000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.auction_admin_cancel((select v::uuid from t where k = 'b_auc'), 'ADMIN', 'not allowed') $$, '42501', null,
  'customers cannot cancel auctions');
reset role;
select pg_temp.as_user('62000000-0000-0000-0000-000000000006', 'aal2');
select is((api.auction_admin_cancel((select v::uuid from t where k = 'b_auc'), 'ADMIN', 'Asset failed inspection') ->> 'refunds')::int, 1,
  'Test 12: cancelling refunds every paid participant');
reset role;
select is((select reason || ':' || amount_paise || ':' || status from auction.refunds where user_id = 'e2000000-0000-0000-0000-00000000000e'),
  'CANCELLED:100000:REFUND_ELIGIBLE', 'Test 12: full refund queued');

select pg_temp.start_deposit('f2000000-0000-0000-0000-00000000000f', (select v::uuid from t where k = 'reserve'), 'ord-frank');
select pg_temp.capture('ord-frank', 'evt-frank-1');
select pg_temp.bid('f2000000-0000-0000-0000-00000000000f', (select v::uuid from t where k = 'reserve'), 50000000, 'frank-k1-xxxxx');
update auction.auctions set ends_at = clock_timestamp() - interval '1 second' where id = (select v::uuid from t where k = 'reserve');
select is(auction.close_auction((select v::uuid from t where k = 'reserve')), 'RESERVE_NOT_MET', 'Test 13: reserve not reached → no winner');
select is((select count(*)::int from auction.invoices where auction_id = (select v::uuid from t where k = 'reserve')), 0, 'Test 13: no invoice');
select is((select reason || ':' || amount_paise from auction.refunds where user_id = 'f2000000-0000-0000-0000-00000000000f'), 'RESERVE_NOT_MET:100000',
  'Test 13: the participant is refunded in full');

-- ---------------------------------------------------------------------------
-- Winner default (§7.7): review, never automatic forfeiture
-- ---------------------------------------------------------------------------
select pg_temp.start_deposit('e2000000-0000-0000-0000-00000000000e', (select v::uuid from t where k = 'default'), 'ord-eve2');
select pg_temp.capture('ord-eve2', 'evt-eve-2');
select pg_temp.bid('e2000000-0000-0000-0000-00000000000e', (select v::uuid from t where k = 'default'), 50000000, 'eve-d1-xxxxxxx');
update auction.auctions set ends_at = clock_timestamp() - interval '1 second' where id = (select v::uuid from t where k = 'default');
select auction.close_auction((select v::uuid from t where k = 'default'));
update auction.invoices set due_at = now() - interval '1 minute' where auction_id = (select v::uuid from t where k = 'default');
set local role service_role;
select api.auction_close_due();
reset role;
select is((select status from auction.deposits where user_id = 'e2000000-0000-0000-0000-00000000000e' and auction_id = (select v::uuid from t where k = 'default')),
  'DEFAULT_REVIEW', 'an overdue winner goes to review');
select pg_temp.as_user('72000000-0000-0000-0000-000000000007', 'aal2');
select throws_ok($$ select api.auction_admin_decide_default((select id from auction.default_reviews where invoice_id = (select id from auction.invoices where auction_id = (select v::uuid from t where k = 'default'))), 'FORFEIT', 'Winner did not pay within the deadline', null) $$,
  'P0001', 'FORFEIT_BLOCKED: no approved forfeiture policy is configured', 'forfeiture is blocked without an approved policy');
select is(api.auction_admin_decide_default((select id from auction.default_reviews where invoice_id = (select id from auction.invoices where auction_id = (select v::uuid from t where k = 'default'))),
  'REFUND', 'Buyer had a documented medical emergency', null) ->> 'status', 'REFUND', 'finance can void the sale and refund the deposit');
reset role;
select is((select status from auction.deposits where user_id = 'e2000000-0000-0000-0000-00000000000e' and auction_id = (select v::uuid from t where k = 'default')),
  'REFUND_ELIGIBLE', 'the deposit is refund-eligible after the review');

select pg_temp.as_user('72000000-0000-0000-0000-000000000007', 'aal2');
select is((select r ->> 'decision' from jsonb_array_elements(api.auction_admin_list_default_reviews()) r
           where r ->> 'auctionId' = (select v from t where k = 'default')), 'REFUND', 'the default review list shows the recorded decision');
reset role;

-- reserved slugs would shadow the static /auctions/browse, /sell and /category routes
select throws_ok($$ insert into auction.auctions (slug, asset_id, type, starting_price_paise, min_increment_paise, starts_at, ends_at)
                    select 'browse', asset_id, 'TIMED_ENGLISH', 100000, 10000, now(), now() + interval '1 day' from auction.auctions limit 1 $$,
  '23514', null, 'reserved slugs are rejected');
set local role anon;
select throws_ok($$ select api.auction_admin_list_default_reviews() $$, '42501', null, 'anonymous callers cannot list default reviews');
reset role;

-- ---------------------------------------------------------------------------
-- Global ledger integrity
-- ---------------------------------------------------------------------------
select is((select sum(debit_paise) - sum(credit_paise) from ledger.entries), 0::numeric, 'ledger balanced across all postings');
select ok(not exists (select 1 from ledger.entries e join ledger.journals j on j.id = e.journal_id
                      join ledger.accounts a on a.code = e.account_code where a.domain <> j.domain), 'auction money never touches PoolX accounts');

select * from finish();
rollback;
