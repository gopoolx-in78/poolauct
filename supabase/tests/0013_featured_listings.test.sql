-- Featured pools / auctions (migration 0019, TD-76).
begin;
select plan(20);

insert into auth.users (id, email) values
  ('a7200000-0000-0000-0000-000000000002', 'ft-content@test.test'),
  ('a7200000-0000-0000-0000-000000000003', 'ft-customer@test.test'),
  ('a7200000-0000-0000-0000-000000000004', 'ft-auction@test.test');
select core.operator_grant_role('ft-content@test.test', 'content_manager', 'fixture');
select core.operator_grant_role('ft-auction@test.test', 'auction_manager', 'fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

create function pg_temp.listing(p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'categorySlug', 'used-cars', 'sellerId', '',
    'title', 'Featured asset ' || p_slug, 'brand', 'Maruti', 'model', 'Swift', 'year', '2020', 'condition', 'GOOD',
    'description', 'A vehicle used by the automated featured-listing tests only.', 'city', 'Pune', 'state', 'Maharashtra',
    'pickupTerms', 'Pickup from seller yard within 7 days', 'charges', '[]'::jsonb,
    'startingPricePaise', '50000000', 'reservePricePaise', '', 'minIncrementPaise', '500000',
    'startsAt', (now() + interval '1 day')::text, 'endsAt', (now() + interval '2 days')::text,
    'depositMode', 'FIXED', 'depositValue', '200000',
    'depositTerms', 'The deposit is fully refundable unless you win; if you win it is credited to your invoice.',
    'winnerPaymentDeadlineHours', '48',
    'vehicle', jsonb_build_object('manufacturer', 'Maruti', 'variant', 'VXi', 'registrationState', 'MH',
      'registrationMasked', 'MH 14 •• ••21', 'fuelType', 'PETROL', 'transmission', 'MANUAL', 'odometerKm', '30000',
      'ownersCount', '1', 'accidentDisclosure', 'None reported by seller', 'damageDisclosure', 'None reported by seller',
      'ownershipTransferTerms', 'Seller provides Form 29/30 and RC at handover'));
$$;

alter table core.system_settings disable trigger system_settings_no_delete;
delete from core.system_settings where key like 'auction.deposit.%';
alter table core.system_settings enable trigger system_settings_no_delete;
insert into core.system_settings (key, value) values ('auction.deposit.global_min_paise', '50000');

-- Fixtures: one open pool, one draft pool, one scheduled auction, one draft auction.
insert into poolx.sellers (id, display_name) values ('5e920000-0000-0000-0000-000000000002', 'FT Pool Seller');
insert into poolx.pools (id, slug, title, summary, product_name, category_id, seller_id, base_unit_price_paise, platform_fee_bps,
                         min_qty_per_member, max_qty_per_member, min_members, target_members, deadline_at, status, published_at)
values ('9e920000-0000-0000-0000-000000000001', 'ft-open-pool', 'Featured open pool', 'Pool for the featured tests only', 'Widget',
        (select id from poolx.categories where slug = 'electronics'), '5e920000-0000-0000-0000-000000000002', 100000, 100,
        1, 5, 2, 3, now() + interval '2 days', 'ACTIVE', now()),
       ('9e920000-0000-0000-0000-000000000002', 'ft-draft-pool', 'Featured draft pool', 'Pool for the featured tests only', 'Widget',
        (select id from poolx.categories where slug = 'electronics'), '5e920000-0000-0000-0000-000000000002', 100000, 100,
        1, 5, 2, 3, now() + interval '2 days', 'DRAFT', null);

select pg_temp.as_user('a7200000-0000-0000-0000-000000000004');
insert into t values ('auc', api.auction_admin_save_listing(null, pg_temp.listing('ft-car'))::text);
select api.auction_admin_save_listing(null, pg_temp.listing('ft-draft-car'));
select api.auction_admin_publish((select v::uuid from t where k = 'auc'));
reset role;

-- Protection
select ok((select relrowsecurity from pg_class where oid = 'cms.featured_listings'::regclass), 'RLS on cms.featured_listings');
select ok(not has_function_privilege('anon', 'api.cms_admin_featured_add(text, text)', 'execute'), 'anonymous callers cannot feature listings');
select ok(has_function_privilege('anon', 'api.cms_featured()', 'execute'), 'anyone can read the featured slugs');

select pg_temp.as_user('a7200000-0000-0000-0000-000000000003');
select throws_ok($$ select api.cms_admin_featured_add('poolx', 'ft-open-pool') $$, '42501', null, 'customers cannot feature listings');
select throws_ok($$ select count(*) from cms.featured_listings $$, '42501', null, 'customers cannot read the table directly');
reset role;
select pg_temp.as_user('a7200000-0000-0000-0000-000000000004');
select throws_ok($$ select api.cms_admin_featured_add('auction', 'ft-car') $$, '42501', null, 'staff without content permission cannot feature');
reset role;
select pg_temp.as_user('a7200000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select api.cms_admin_featured_add('auction', 'ft-car') $$, '42501', null, 'content managers need an MFA session');
reset role;

-- Managing the list
select pg_temp.as_user('a7200000-0000-0000-0000-000000000002');
insert into t values ('p1', api.cms_admin_featured_add('poolx', 'ft-open-pool') ->> 'id');
select api.cms_admin_featured_add('poolx', '  FT-Draft-Pool ');
select api.cms_admin_featured_add('auction', 'ft-draft-car');
insert into t values ('a2', api.cms_admin_featured_add('auction', 'ft-car') ->> 'id');
select throws_ok($$ select api.cms_admin_featured_add('poolx', 'ft-open-pool') $$, 'P0001',
  'ALREADY_FEATURED: that listing is already featured', 'a listing can be featured once');
select throws_ok($$ select api.cms_admin_featured_add('shop', 'ft-open-pool') $$, 'P0001',
  'INVALID_MODULE: choose PoolX or Auctions', 'only the two marketplaces');
select throws_ok($$ select api.cms_admin_featured_add('poolx', '../etc/passwd') $$, 'P0001', null, 'slugs are validated');
select api.cms_admin_featured_add('poolx', 'ft-extra-' || i) from generate_series(1, 4) i;
select throws_ok($$ select api.cms_admin_featured_add('poolx', 'ft-extra-5') $$, 'P0001',
  'TOO_MANY_FEATURED: feature up to 6 listings per marketplace', 'at most 6 per marketplace');
select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(api.cms_admin_featured_list()) x where x ->> 'module' = 'auction'),
  '["ft-draft-car", "ft-car"]'::jsonb, 'staff list keeps the order of adding');
select api.cms_admin_featured_move((select v::uuid from t where k = 'a2'), 'up');
select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(api.cms_admin_featured_list()) x where x ->> 'module' = 'auction'),
  '["ft-car", "ft-draft-car"]'::jsonb, 'moving up swaps with the previous listing');
select throws_ok($$ select api.cms_admin_featured_move((select v::uuid from t where k = 'a2'), 'left') $$, 'P0001',
  'INVALID_MOVE: move up or down', 'only up or down');
reset role;

-- Public reads: only open listings, in the chosen order
set local role anon;
select is(api.cms_featured() -> 'auction', '["ft-car", "ft-draft-car"]'::jsonb, 'public featured slugs are in order');
select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(api.poolx_pools_by_slugs(
             array(select jsonb_array_elements_text(api.cms_featured() -> 'poolx')))) x),
  '["ft-open-pool"]'::jsonb, 'draft and unknown pools are left out');
select is((select jsonb_agg(x ->> 'slug') from jsonb_array_elements(api.auction_by_slugs(array['ft-draft-car', 'ft-car', 'nope'])) x),
  '["ft-car"]'::jsonb, 'draft and unknown auctions are left out');
reset role;
update poolx.pools set status = 'THRESHOLD_MET' where id = '9e920000-0000-0000-0000-000000000001';
set local role anon;
select is(api.poolx_pools_by_slugs(array['ft-open-pool']), '[]'::jsonb, 'a pool that is no longer open is not shown');
reset role;

-- Removing and the audit trail
select pg_temp.as_user('a7200000-0000-0000-0000-000000000002');
select api.cms_admin_featured_remove((select v::uuid from t where k = 'p1'));
select throws_ok($$ select api.cms_admin_featured_remove((select v::uuid from t where k = 'p1')) $$, 'P0001',
  'NOT_FOUND: featured listing not found', 'removing twice is refused');
reset role;
select is((select count(*)::int from core.audit_logs where action like 'cms.featured.%'
             and actor_id = 'a7200000-0000-0000-0000-000000000002'), 10, 'every change is audited (8 adds, 1 move, 1 removal)');

select * from finish();
rollback;
