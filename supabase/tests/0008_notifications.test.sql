-- Phase 8 notifications: event coverage (master prompt §15), preferences, privacy, delivery worker, staff tools.
-- Every event is raised by the real flow (API calls and scheduled jobs), not by inserting notifications directly.
begin;
select plan(80);

set constraints poolx.discount_tiers_monotonic immediate;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('0a800000-0000-0000-0000-00000000000a', 'nt-alice@test.test'),
  ('0b800000-0000-0000-0000-00000000000b', 'nt-bob@test.test'),
  ('0c800000-0000-0000-0000-00000000000c', 'nt-carol@test.test'),
  ('0d800000-0000-0000-0000-00000000000d', 'nt-requester@test.test'),
  ('0e800000-0000-0000-0000-00000000000e', 'nt-subscriber@test.test'),
  ('1a800000-0000-0000-0000-00000000000a', 'nt-xavier@test.test'),
  ('1b800000-0000-0000-0000-00000000000b', 'nt-yara@test.test'),
  ('1c800000-0000-0000-0000-00000000000c', 'nt-zane@test.test'),
  ('5a800000-0000-0000-0000-000000000005', 'nt-seller@test.test'),
  ('6a800000-0000-0000-0000-000000000006', 'nt-pool-manager@test.test'),
  ('7a800000-0000-0000-0000-000000000007', 'nt-auction-manager@test.test'),
  ('8a800000-0000-0000-0000-000000000008', 'nt-support@test.test');
select core.operator_grant_role('nt-pool-manager@test.test', 'poolx_manager', 'fixture');
select core.operator_grant_role('nt-auction-manager@test.test', 'auction_manager', 'fixture');
select core.operator_grant_role('nt-support@test.test', 'customer_support', 'fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role, anon;

-- notifications created in this test for a user and event
create function pg_temp.n(p_uid uuid, p_event text) returns integer language sql as $$
  select count(*)::int from core.notifications where user_id = p_uid and event_key = p_event and created_at >= now();
$$;

create function pg_temp.join_and_pay(p_uid uuid, p_pool uuid, p_qty int, p_tag text) returns void language plpgsql as $$
declare v_attempt uuid; v_amount bigint;
begin
  perform pg_temp.as_user(p_uid);
  v_attempt := (api.poolx_start_contribution(p_pool, p_qty) ->> 'attemptId')::uuid;
  reset role;
  select amount_paise into v_amount from core.payment_attempts where id = v_attempt;
  perform api.payments_attach_order(v_attempt, 'sandbox', 'nt_order_' || p_tag);
  perform api.payments_process_event('sandbox', 'nt_evt_' || p_tag, 'payment.captured', 'nt_order_' || p_tag, 'nt_pay_' || p_tag,
                                     v_amount, 'INR', null, '{}');
end $$;

create function pg_temp.deposit(p_uid uuid, p_auction uuid, p_tag text) returns void language plpgsql as $$
declare v_attempt uuid; v_terms text; v_amount bigint;
begin
  select terms_version into v_terms from auction.auctions where id = p_auction;
  perform pg_temp.as_user(p_uid);
  v_attempt := (api.auction_start_deposit(p_auction, v_terms) ->> 'attemptId')::uuid;
  reset role;
  select amount_paise into v_amount from core.payment_attempts where id = v_attempt;
  perform api.payments_attach_order(v_attempt, 'sandbox', 'nt_dep_' || p_tag);
  perform api.payments_process_event('sandbox', 'nt_devt_' || p_tag, 'payment.captured', 'nt_dep_' || p_tag, 'nt_dpay_' || p_tag,
                                     v_amount, 'INR', null, '{}');
end $$;

create function pg_temp.bid(p_uid uuid, p_auction uuid, p_amount bigint, p_key text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.as_user(p_uid);
  v := api.auction_place_bid(p_auction, p_amount, p_key);
  reset role;
  return v;
end $$;

create function pg_temp.listing(p_slug text, p_starts timestamptz) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'categorySlug', 'used-cars', 'sellerId', '5e800000-0000-0000-0000-000000000001',
    'title', 'Notify asset ' || p_slug, 'brand', 'Maruti', 'model', 'Swift', 'year', '2020', 'condition', 'GOOD',
    'description', 'A vehicle used by the automated notification tests only.', 'city', 'Pune', 'state', 'Maharashtra',
    'pickupTerms', 'Pickup from seller yard within 7 days', 'charges', '[]'::jsonb,
    'startingPricePaise', '50000000', 'reservePricePaise', '', 'minIncrementPaise', '500000',
    'startsAt', p_starts::text, 'endsAt', (p_starts + interval '3 hours')::text,
    'depositMode', 'FIXED', 'depositValue', '200000',
    'depositTerms', 'The deposit is fully refundable unless you win; if you win it is credited to your invoice.',
    'winnerPaymentDeadlineHours', '48',
    'vehicle', jsonb_build_object('manufacturer', 'Maruti', 'variant', 'VXi', 'registrationState', 'MH',
      'registrationMasked', 'MH 14 •• ••21', 'fuelType', 'PETROL', 'transmission', 'MANUAL', 'odometerKm', '30000',
      'ownersCount', '1', 'accidentDisclosure', 'None reported by seller', 'damageDisclosure', 'None reported by seller',
      'ownershipTransferTerms', 'Seller provides Form 29/30 and RC at handover'));
$$;

-- a deterministic deposit policy for this test (rolled back)
alter table core.system_settings disable trigger system_settings_no_delete;
delete from core.system_settings where key like 'auction.deposit.%';
alter table core.system_settings enable trigger system_settings_no_delete;
insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000');

insert into auction.sellers (id, kind, display_name, profile_id) values
  ('5e800000-0000-0000-0000-000000000001', 'THIRD_PARTY', 'NT Motors', '5a800000-0000-0000-0000-000000000005');
insert into poolx.sellers (id, display_name) values ('5e800000-0000-0000-0000-000000000002', 'NT Pool Seller');

-- ---------------------------------------------------------------------------
-- Catalogue and preferences
-- ---------------------------------------------------------------------------
select is((select count(*)::int from core.notification_events), 28, 'the catalogue has the 11 PoolX and 17 auction events of §15');
select is((select count(*)::int from core.notification_events where domain = 'poolx'), 11, '11 PoolX events');

select pg_temp.as_user('0e800000-0000-0000-0000-00000000000e');
select is((select count(*)::int from jsonb_array_elements(api.notifications_preferences()) p where (p ->> 'inApp')::boolean
           and p ->> 'audience' = 'SUBSCRIBER'), 0, 'announcements are off until the user opts in');
select lives_ok($$ select api.notifications_set_preference('poolx.pool_created', true, true) $$, 'subscriber opts in to new pools');
select lives_ok($$ select api.notifications_set_preference('auction.auction_published', true, false) $$, 'subscriber opts in to new auctions (in-app only)');
select throws_ok($$ select api.notifications_set_preference('auction.deposit_confirmed', true, false) $$, 'P0001',
  'ESSENTIAL: payment and refund notices cannot be turned off', 'essential notices cannot be turned off');
select throws_ok($$ select api.notifications_set_preference('poolx.nope', true, true) $$, 'P0001', 'NOT_FOUND: unknown notification',
  'unknown events are rejected');
select throws_ok($$ insert into core.notification_preferences (user_id, event_key, in_app, email)
                   values ('0e800000-0000-0000-0000-00000000000e', 'poolx.pool_joined', false, false) $$, '42501', null,
  'preferences cannot be written directly');
reset role;
-- xavier keeps outbid notices in-app but turns the e-mail off
select pg_temp.as_user('1a800000-0000-0000-0000-00000000000a');
select api.notifications_set_preference('auction.outbid', true, false);
reset role;

-- ---------------------------------------------------------------------------
-- PoolX events
-- ---------------------------------------------------------------------------
insert into poolx.requests (id, requester_id, title, product, description, delivery_location)
values ('9e800000-0000-0000-0000-0000000000a1', '0d800000-0000-0000-0000-00000000000d', 'Office chairs', 'Ergo chair',
        'Twenty ergonomic office chairs for a co-working space.', 'Pune');
insert into poolx.pools (id, slug, title, summary, product_name, category_id, seller_id, base_unit_price_paise, platform_fee_bps,
                         min_qty_per_member, max_qty_per_member, min_members, target_members, deadline_at)
values ('9e800000-0000-0000-0000-000000000001', 'nt-pool', 'Notify pool', 'Pool for the notification tests', 'Widget',
        (select id from poolx.categories where slug = 'electronics'), '5e800000-0000-0000-0000-000000000002', 100000, 100,
        1, 5, 2, 3, now() + interval '2 days');
insert into poolx.discount_tiers (pool_id, threshold, discount_bps) values
  ('9e800000-0000-0000-0000-000000000001', 2, 1000), ('9e800000-0000-0000-0000-000000000001', 3, 2000);

select pg_temp.as_user('6a800000-0000-0000-0000-000000000006', 'aal2');
select api.poolx_admin_review_request('9e800000-0000-0000-0000-0000000000a1', 'APPROVED', 'Approved for pooling');
select api.poolx_admin_publish('9e800000-0000-0000-0000-000000000001');
reset role;
select is(pg_temp.n('0d800000-0000-0000-0000-00000000000d', 'poolx.pool_approved'), 1, 'pool approved → requester');
select is(pg_temp.n('0e800000-0000-0000-0000-00000000000e', 'poolx.pool_created'), 1, 'pool created → opted-in subscriber');
select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.pool_created'), 0, 'pool created → not sent to users who did not opt in');

select pg_temp.join_and_pay('0a800000-0000-0000-0000-00000000000a', '9e800000-0000-0000-0000-000000000001', 1, 'a');
select pg_temp.join_and_pay('0b800000-0000-0000-0000-00000000000b', '9e800000-0000-0000-0000-000000000001', 2, 'b');
select pg_temp.join_and_pay('0c800000-0000-0000-0000-00000000000c', '9e800000-0000-0000-0000-000000000001', 1, 'c');

select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.pool_joined'), 1, 'pool joined');
select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.contribution_confirmed'), 1, 'contribution confirmed');
select is((select data ->> 'amountPaise' from core.notifications where user_id = '0a800000-0000-0000-0000-00000000000a'
            and event_key = 'poolx.contribution_confirmed'), '101000', 'the confirmed amount is carried as paise text');
select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.discount_milestone'), 2, 'alice hears about both discount levels');
select is(pg_temp.n('0c800000-0000-0000-0000-00000000000c', 'poolx.discount_milestone'), 1, 'carol hears only about the level her join unlocked');
select is(pg_temp.n('0b800000-0000-0000-0000-00000000000b', 'poolx.target_achieved'), 1, 'target achieved → every active member');

select pg_temp.as_user('6a800000-0000-0000-0000-000000000006', 'aal2');
select api.poolx_admin_close_joining('9e800000-0000-0000-0000-000000000001');
select api.poolx_admin_record_negotiation('9e800000-0000-0000-0000-000000000001', 90000, 'Seller confirms ₹900 per unit', 'ACCEPTED');
select api.poolx_admin_lock('9e800000-0000-0000-0000-000000000001');
reset role;
set local role service_role;
insert into t select 'prf_' || left(r.user_id::text, 2), c.refund_id::text from api.poolx_claim_refunds(50) c
  join poolx.refunds r on r.id = c.refund_id where r.pool_id = '9e800000-0000-0000-0000-000000000001';
select api.poolx_record_refund_result((select v::uuid from t where k = 'prf_0a'), 'PROCESSED', 'rfnd_nt_alice_9876', null, null);
reset role;
select is(pg_temp.n('0b800000-0000-0000-0000-00000000000b', 'poolx.refund_initiated'), 1, 'refund initiated');
select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.refund_completed'), 1, 'refund completed after provider confirmation');
select is((select data ->> 'reference' from core.notifications where user_id = '0a800000-0000-0000-0000-00000000000a'
            and event_key = 'poolx.refund_completed'), '••••9876', 'only the last four characters of the provider reference are shown');
select is(pg_temp.n('0b800000-0000-0000-0000-00000000000b', 'poolx.refund_completed'), 0, 'no completion notice before the provider confirms');

insert into t select 'po_' || left(user_id::text, 2), id::text from poolx.orders where pool_id = '9e800000-0000-0000-0000-000000000001';
select pg_temp.as_user('6a800000-0000-0000-0000-000000000006', 'aal2');
select api.poolx_admin_ship_order((select v::uuid from t where k = 'po_' || x), 'BlueDart', 'NT' || x || '001', null)
  from unnest(array['0a', '0b', '0c']) x;
reset role;
select is(pg_temp.n('0c800000-0000-0000-0000-00000000000c', 'poolx.order_dispatched'), 1, 'order dispatched');
select is((select data ->> 'trackingNumber' from core.notifications where user_id = '0c800000-0000-0000-0000-00000000000c'
            and event_key = 'poolx.order_dispatched'), 'NT0c001', 'dispatch notice carries the tracking number');
select pg_temp.as_user('0a800000-0000-0000-0000-00000000000a');
select api.poolx_confirm_delivery((select v::uuid from t where k = 'po_0a'));
reset role;
select pg_temp.as_user('6a800000-0000-0000-0000-000000000006', 'aal2');
select api.poolx_admin_mark_delivered((select v::uuid from t where k = 'po_' || x), 'Courier POD received') from unnest(array['0b', '0c']) x;
reset role;
select is(pg_temp.n('0a800000-0000-0000-0000-00000000000a', 'poolx.delivery_update'), 1, 'delivery update');
select is((select status from poolx.pools where id = '9e800000-0000-0000-0000-000000000001'), 'COMPLETED', 'pool completed');
select is(pg_temp.n('0c800000-0000-0000-0000-00000000000c', 'poolx.pool_completed'), 1, 'pool completed → members');

-- ---------------------------------------------------------------------------
-- Auction events
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7a800000-0000-0000-0000-000000000007', 'aal2');
insert into t values ('main', api.auction_admin_save_listing(null, pg_temp.listing('nt-car', now() - interval '1 minute'))::text);
insert into t values ('later', api.auction_admin_save_listing(null, pg_temp.listing('nt-bike', now() + interval '30 minutes'))::text);
select api.auction_admin_publish((select v::uuid from t where k = 'main'));
select api.auction_admin_publish((select v::uuid from t where k = 'later'));
reset role;
select is(pg_temp.n('5a800000-0000-0000-0000-000000000005', 'auction.auction_approved'), 2, 'listing approved → seller');
select is(pg_temp.n('0e800000-0000-0000-0000-00000000000e', 'auction.auction_published'), 2, 'auction published → opted-in subscriber');
select is((select count(*)::int from core.notification_deliveries d join core.notifications n on n.id = d.notification_id
           where n.user_id = '0e800000-0000-0000-0000-00000000000e' and n.event_key = 'auction.auction_published'), 0,
  'in-app-only preference creates no e-mail delivery');

select pg_temp.deposit('1a800000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'main'), 'x');
select pg_temp.deposit('1b800000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'main'), 'y');
select pg_temp.deposit('1c800000-0000-0000-0000-00000000000c', (select v::uuid from t where k = 'main'), 'z');
select pg_temp.deposit('1c800000-0000-0000-0000-00000000000c', (select v::uuid from t where k = 'later'), 'zl');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.deposit_confirmed'), 1, 'deposit confirmed');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.bidding_activated'), 1, 'bidding activated when the auction is live');
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.bidding_activated'), 1, 'no activation yet for the auction that has not started');

set local role service_role;
select ok(api.auction_notify_due() >= 1, 'reminder job runs');
reset role;
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.auction_starting'), 1, 'auction starting soon → depositors');

select pg_temp.bid('1a800000-0000-0000-0000-00000000000a', (select v::uuid from t where k = 'main'), 50000000, 'nt-x-1-xxxxxx');
select pg_temp.bid('1b800000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'main'), 50500000, 'nt-y-1-xxxxxx');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.bid_accepted'), 1, 'new valid bid → bidder');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.outbid'), 1, 'outbid → previous leader');
select is(pg_temp.n('1b800000-0000-0000-0000-00000000000b', 'auction.outbid'), 0, 'the new leader is not told they were outbid');
select is((select count(*)::int from core.notification_deliveries d join core.notifications n on n.id = d.notification_id
           where n.user_id = '1a800000-0000-0000-0000-00000000000a' and n.event_key = 'auction.outbid'), 0,
  'the outbid e-mail respects the user''s preference');
select is(pg_temp.bid('1b800000-0000-0000-0000-00000000000b', (select v::uuid from t where k = 'main'), 50500000, 'nt-y-1-xxxxxx') ->> 'status',
  'DUPLICATE', 'a replayed bid ...');
select is(pg_temp.n('1b800000-0000-0000-0000-00000000000b', 'auction.bid_accepted'), 1, '... is not notified twice');

update auction.auctions set ends_at = now() + interval '10 minutes' where id = (select v::uuid from t where k = 'main');
set local role service_role;
select api.auction_notify_due();
select api.auction_notify_due();
reset role;
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.ending_soon'), 1, 'ending soon → depositors, once');

update auction.auctions set ends_at = clock_timestamp() - interval '1 second' where id = (select v::uuid from t where k = 'main');
set local role service_role;
select api.auction_close_due();
reset role;
select is(pg_temp.n('1b800000-0000-0000-0000-00000000000b', 'auction.auction_won'), 1, 'auction won → winner');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.auction_lost'), 1, 'auction lost → outbid bidder');
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.auction_closed'), 1, 'auction closed → depositor who never bid');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.refund_eligible'), 1, 'refund eligible → non-winner');
select is(pg_temp.n('1b800000-0000-0000-0000-00000000000b', 'auction.refund_eligible'), 0, 'the winner''s deposit is not refunded');

set local role service_role;
insert into t select 'arf_' || left(r.user_id::text, 2), c.refund_id::text from api.auction_claim_refunds(50) c
  join auction.refunds r on r.id = c.refund_id where r.auction_id = (select v::uuid from t where k = 'main');
select api.auction_record_refund_result((select v::uuid from t where k = 'arf_1a'), 'PROCESSED', 'rfnd_nt_x_1234', null, null);
select api.auction_record_refund_result((select v::uuid from t where k = 'arf_1c'), 'FAILED', null, 'bank timeout', true);
reset role;
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.refund_initiated'), 1, 'deposit refund initiated');
select is(pg_temp.n('1a800000-0000-0000-0000-00000000000a', 'auction.refund_completed'), 1, 'deposit refund completed');
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.refund_failed'), 1, 'deposit refund failed → user told it is retried');

-- the winner pays the balance: the deposit is credited
select pg_temp.as_user('1b800000-0000-0000-0000-00000000000b');
insert into t values ('inv_att', api.auction_start_invoice_payment(
  (select id from auction.invoices where auction_id = (select v::uuid from t where k = 'main'))) ->> 'attemptId');
reset role;
select api.payments_attach_order((select v::uuid from t where k = 'inv_att'), 'sandbox', 'nt_inv_y');
select api.payments_process_event('sandbox', 'nt_inv_evt', 'payment.captured', 'nt_inv_y', 'nt_inv_pay',
  (select amount_paise from core.payment_attempts where id = (select v::uuid from t where k = 'inv_att')), 'INR', null, '{}');
select is(pg_temp.n('1b800000-0000-0000-0000-00000000000b', 'auction.deposit_adjusted'), 1, 'winning deposit adjusted');

-- the later auction: goes live via the job (bidding activated), zane wins and does not pay (payment overdue)
update auction.auctions set starts_at = now() - interval '1 minute' where id = (select v::uuid from t where k = 'later');
set local role service_role;
select api.auction_close_due();
reset role;
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.bidding_activated'), 2, 'bidding activated when a scheduled auction goes live');
select pg_temp.bid('1c800000-0000-0000-0000-00000000000c', (select v::uuid from t where k = 'later'), 50000000, 'nt-z-1-xxxxxx');
update auction.auctions set ends_at = clock_timestamp() - interval '1 second' where id = (select v::uuid from t where k = 'later');
set local role service_role;
select api.auction_close_due();
reset role;
update auction.invoices set due_at = now() - interval '1 minute' where auction_id = (select v::uuid from t where k = 'later');
set local role service_role;
select api.auction_close_due();
reset role;
select is(pg_temp.n('1c800000-0000-0000-0000-00000000000c', 'auction.payment_overdue'), 1, 'payment overdue → winner');

-- ---------------------------------------------------------------------------
-- Coverage, isolation and integrity
-- ---------------------------------------------------------------------------
select is((select string_agg(e.key, ', ' order by e.key) from core.notification_events e
           where not exists (select 1 from core.notifications n where n.event_key = e.key and n.created_at >= now())), null,
  'every catalogue event was raised by its real source');
select is((select count(*)::int from core.notification_errors where created_at >= now()), 0, 'no notification trigger failed');
select is((select count(*)::int from core.notifications n join core.notification_events e on e.key = n.event_key
           where n.created_at >= now() and e.essential and not exists (
             select 1 from core.notification_deliveries d where d.notification_id = n.id and d.channel = 'EMAIL')), 0,
  'every essential notice has an e-mail delivery');
select ok((select bool_and(link ~ '^/(poolx|auctions|account)/') from core.notifications where created_at >= now()),
  'every link is an internal path');
select ok((select bool_and(data::text !~ 'nt_pay|nt_dpay|rfnd_nt|@test.test') from core.notifications where created_at >= now()),
  'notification data carries no payment ids or e-mail addresses');

-- ---------------------------------------------------------------------------
-- Member API and privacy
-- ---------------------------------------------------------------------------
select pg_temp.as_user('0a800000-0000-0000-0000-00000000000a');
select is((select count(*)::int from core.notifications where user_id <> '0a800000-0000-0000-0000-00000000000a'), 0,
  'users see only their own notifications');
select is((select count(*)::int from core.notification_deliveries), 0, 'users cannot read the delivery log');
insert into t values ('a_unread', api.notifications_unread_count()::text);
select ok((select v::int from t where k = 'a_unread') >= 7, 'unread count covers alice''s notices');
select is((api.notifications_list(false, 5, 0) -> 'items' -> 0 ->> 'domain'), 'poolx', 'list returns newest first with its domain');
select is(api.notifications_mark_read((api.notifications_list(false, 1, 0) -> 'items' -> 0 ->> 'id')::uuid), 1, 'mark one as read');
select is(api.notifications_mark_read(null), (select v::int from t where k = 'a_unread') - 1, 'mark all as read');
select is(api.notifications_unread_count(), 0, 'nothing unread');
select throws_ok($$ update core.notifications set read_at = null $$, '42501', null, 'notifications cannot be edited directly');
select is(api.notifications_mark_read((select id from core.notifications where user_id = '0b800000-0000-0000-0000-00000000000b' limit 1)), 0,
  'a user cannot mark someone else''s notification');
reset role;
select throws_ok($$ update core.notifications set data = '{}' where user_id = '0a800000-0000-0000-0000-00000000000a' $$, 'P0001',
  'IMMUTABLE: notifications can only be marked as read', 'notification content is immutable even for the owner');

-- ---------------------------------------------------------------------------
-- Delivery worker
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'api.notifications_claim_deliveries(integer)', 'execute'), 'users cannot claim deliveries');
select ok(not has_function_privilege('authenticated', 'api.auction_notify_due()', 'execute'), 'users cannot run the reminder job');
set local role service_role;
insert into t select 'dl_' || row_number() over (), c.delivery_id::text
  from api.notifications_claim_deliveries(100) c join core.notifications n on n.id = (
    select notification_id from core.notification_deliveries where id = c.delivery_id)
 where n.created_at >= now() limit 3;
select is(api.notifications_record_delivery((select v::uuid from t where k = 'dl_1'), 'SENT', 'mailpit', 'msg-1', null, null), 'SENT', 'delivery sent');
select is(api.notifications_record_delivery((select v::uuid from t where k = 'dl_1'), 'FAILED', 'mailpit', null, 'late', true), 'IGNORED',
  'a recorded delivery cannot be recorded again');
select is(api.notifications_record_delivery((select v::uuid from t where k = 'dl_2'), 'FAILED', 'mailpit', null, 'timeout', true), 'RETRY',
  'retryable failure goes back to the queue');
select ok((select next_attempt_at > now() from core.notification_deliveries where id = (select v::uuid from t where k = 'dl_2')),
  'with a back-off delay');
select is(api.notifications_record_delivery((select v::uuid from t where k = 'dl_3'), 'SKIPPED', 'none', null, 'EMAIL_NOT_CONFIGURED', null),
  'SKIPPED', 'unconfigured channel is recorded as skipped');
reset role;

-- ---------------------------------------------------------------------------
-- Staff tools
-- ---------------------------------------------------------------------------
select pg_temp.as_user('6a800000-0000-0000-0000-000000000006', 'aal2');
select throws_ok($$ select api.admin_list_notification_deliveries(null, null, null, 10, 0) $$, '42501', null,
  'staff without support.tickets cannot see the delivery log');
reset role;
select pg_temp.as_user('8a800000-0000-0000-0000-000000000008', 'aal2');
select ok((api.admin_list_notification_deliveries('SKIPPED', null, 'nt-', 10, 0) ->> 'total')::int >= 1, 'support sees skipped deliveries');
select throws_ok($$ select api.admin_retry_notification_delivery((select v::uuid from t where k = 'dl_3'), 'short') $$, 'P0001', null,
  'retry needs a reason');
select lives_ok($$ select api.admin_retry_notification_delivery((select v::uuid from t where k = 'dl_3'), 'Mail provider configured now') $$,
  'support re-queues a skipped delivery');
select throws_ok($$ select api.admin_retry_notification_delivery((select v::uuid from t where k = 'dl_1'), 'Customer asked again') $$, 'P0001',
  'INVALID_REQUEST: only failed or skipped deliveries can be retried', 'sent deliveries cannot be re-sent');
reset role;
select is((select count(*)::int from core.audit_logs where action = 'notification.delivery.retried' and entity_id = (select v from t where k = 'dl_3')), 1,
  'the retry is audited');

select * from finish();
rollback;
