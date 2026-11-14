-- Media pipeline (migration 0017, TD-74): storage bucket, RLS, staff-only registration, draft-only edits, public reads.
begin;
select plan(38);

insert into auth.users (id, email) values
  ('0a900000-0000-0000-0000-00000000000a', 'md-alice@test.test'),
  ('6a900000-0000-0000-0000-000000000006', 'md-pool-manager@test.test'),
  ('7a900000-0000-0000-0000-000000000007', 'md-auction-manager@test.test');
select core.operator_grant_role('md-pool-manager@test.test', 'poolx_manager', 'fixture');
select core.operator_grant_role('md-auction-manager@test.test', 'auction_manager', 'fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role, anon;

create function pg_temp.img(p_id uuid, p_alt text default 'Front view of the item') returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'width', 1600, 'height', 1200, 'thumbWidth', 480, 'thumbHeight', 360,
                            'bytes', 154321, 'alt', p_alt);
$$;
grant execute on function pg_temp.img(uuid, text) to authenticated;

create function pg_temp.listing(p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'categorySlug', 'used-cars', 'sellerId', '',
    'title', 'Media asset ' || p_slug, 'brand', 'Maruti', 'model', 'Swift', 'year', '2020', 'condition', 'GOOD',
    'description', 'A vehicle used by the automated media tests only.', 'city', 'Pune', 'state', 'Maharashtra',
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

-- ---------------------------------------------------------------------------
-- Bucket and table protection
-- ---------------------------------------------------------------------------
select ok((select public from storage.buckets where id = 'public-media'), 'public-media bucket is public-read');
select is((select allowed_mime_types from storage.buckets where id = 'public-media'), array['image/webp'],
  'public-media accepts only WebP (the server re-encodes every upload)');
select is((select file_size_limit from storage.buckets where id = 'public-media'), 2097152::bigint, 'public-media caps files at 2 MB');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')), 0,
  'no storage policy lets a client write, change or delete objects');
select ok((select relrowsecurity from pg_class where oid = 'core.media_assets'::regclass), 'RLS on core.media_assets');
select ok((select relrowsecurity from pg_class where oid = 'auction.asset_media'::regclass), 'RLS on auction.asset_media');
select ok((select relrowsecurity from pg_class where oid = 'poolx.pool_media'::regclass), 'RLS on poolx.pool_media');
select ok(not has_function_privilege('authenticated', 'core.media_insert(jsonb, uuid)', 'execute'),
  'clients cannot call the internal insert helper');
select ok(not has_function_privilege('anon', 'api.auction_admin_media_add(uuid, jsonb)', 'execute'),
  'anonymous callers cannot add auction photos');
select ok(has_function_privilege('anon', 'api.auction_media(text)', 'execute'), 'anyone can read published auction photos');

-- ---------------------------------------------------------------------------
-- Auction photos
-- ---------------------------------------------------------------------------
select pg_temp.as_user('7a900000-0000-0000-0000-000000000007', 'aal2');
insert into t values ('auc', api.auction_admin_save_listing(null, pg_temp.listing('md-car'))::text);
reset role;

select pg_temp.as_user('0a900000-0000-0000-0000-00000000000a', 'aal2');
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'a customer cannot add photos');
reset role;
select pg_temp.as_user('7a900000-0000-0000-0000-000000000007', 'aal1');
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'staff without an MFA session cannot add photos');
reset role;

select pg_temp.as_user('7a900000-0000-0000-0000-000000000007', 'aal2');
select is(api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000001')) #>> '{display,path}',
  'a1900000-0000-0000-0000-000000000001/display.webp', 'the storage path is derived from the media id');
select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000002', 'Rear view'));
select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000003', 'Dashboard'));
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000004', '  ')) $$,
  'P0001', 'INVALID_ALT: describe the image in 3 to 200 characters', 'alt text is required');
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'),
                   pg_temp.img('a1900000-0000-0000-0000-000000000004') || '{"width": 9000}') $$,
  'P0001', 'INVALID_MEDIA: image details are out of range', 'oversized dimensions are rejected');
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000001')) $$,
  'P0001', 'INVALID_MEDIA: this image is already registered', 'a media id cannot be registered twice');
select is(jsonb_array_length(api.auction_admin_media_list((select v::uuid from t where k = 'auc'))), 3, 'staff list shows three photos');
select api.auction_admin_media_update('a1900000-0000-0000-0000-000000000003', 'Dashboard and odometer', 'up');
select is((select jsonb_agg(x ->> 'alt') from jsonb_array_elements(api.auction_admin_media_list((select v::uuid from t where k = 'auc'))) x),
  '["Front view of the item", "Dashboard and odometer", "Rear view"]'::jsonb, 'moving up swaps order; alt text is updated');
select api.auction_admin_media_update('a1900000-0000-0000-0000-000000000001', null, 'up');
select is((select api.auction_admin_media_list((select v::uuid from t where k = 'auc')) -> 0 ->> 'id'),
  'a1900000-0000-0000-0000-000000000001', 'moving the first photo up changes nothing');
select throws_ok($$ select api.auction_admin_media_update('a1900000-0000-0000-0000-000000000001', null, 'left') $$,
  'P0001', 'INVALID_MOVE: move must be up or down', 'unknown moves are rejected');
select api.auction_admin_media_remove('a1900000-0000-0000-0000-000000000002');
select is(jsonb_array_length(api.auction_admin_media_list((select v::uuid from t where k = 'auc'))), 2, 'removed photos disappear from the list');
reset role;
select is((select status from core.media_assets where id = 'a1900000-0000-0000-0000-000000000002'), 'REMOVED',
  'removed photos are kept as REMOVED, never deleted');
select throws_ok($$ delete from core.media_assets where id = 'a1900000-0000-0000-0000-000000000002' $$, null, null,
  'media rows cannot be deleted');
select is((select count(*)::int from core.audit_logs where action like 'auction.media.%'
             and entity_id = (select v from t where k = 'auc')), 6, 'every photo change is audited');

set local role anon;
select is(api.auction_media('md-car'), '[]'::jsonb, 'draft auction photos are not public');
reset role;
select pg_temp.as_user('0a900000-0000-0000-0000-00000000000a');
select throws_ok($$ select count(*) from core.media_assets $$, '42501', null, 'customers cannot read media rows directly');
reset role;

select pg_temp.as_user('7a900000-0000-0000-0000-000000000007', 'aal2');
select api.auction_admin_publish((select v::uuid from t where k = 'auc'));
select throws_ok($$ select api.auction_admin_media_add((select v::uuid from t where k = 'auc'), pg_temp.img('a1900000-0000-0000-0000-000000000005')) $$,
  'P0001', 'NOT_EDITABLE: photos can only change while the auction is a draft', 'no new photos after publishing');
select throws_ok($$ select api.auction_admin_media_remove('a1900000-0000-0000-0000-000000000001') $$,
  'P0001', 'NOT_EDITABLE: photos can only change while the auction is a draft', 'no removals after publishing');
reset role;

set local role anon;
select is(jsonb_array_length(api.auction_media('md-car')), 2, 'published auction photos are public');
select is(api.auction_media_covers(array['md-car', 'no-such-auction']) #>> '{md-car,thumb,path}',
  'a1900000-0000-0000-0000-000000000001/thumb.webp', 'the cover is the first photo');
select is((api.auction_media_covers(array['md-car']) -> 'no-such-auction'), null, 'unknown slugs are left out');
reset role;

-- ---------------------------------------------------------------------------
-- Pool photos
-- ---------------------------------------------------------------------------
insert into poolx.sellers (id, display_name) values ('5e900000-0000-0000-0000-000000000002', 'MD Pool Seller');
insert into poolx.pools (id, slug, title, summary, product_name, category_id, seller_id, base_unit_price_paise, platform_fee_bps,
                         min_qty_per_member, max_qty_per_member, min_members, target_members, deadline_at)
values ('9e900000-0000-0000-0000-000000000001', 'md-pool', 'Media pool', 'Pool for the media tests only', 'Widget',
        (select id from poolx.categories where slug = 'electronics'), '5e900000-0000-0000-0000-000000000002', 100000, 100,
        1, 5, 2, 3, now() + interval '2 days');
insert into poolx.discount_tiers (pool_id, threshold, discount_bps) values ('9e900000-0000-0000-0000-000000000001', 2, 1000);

select pg_temp.as_user('7a900000-0000-0000-0000-000000000007', 'aal2');
select throws_ok($$ select api.poolx_admin_media_add('9e900000-0000-0000-0000-000000000001', pg_temp.img('b1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'an auction manager cannot add pool photos');
reset role;
select pg_temp.as_user('6a900000-0000-0000-0000-000000000006', 'aal2');
select is(api.poolx_admin_media_add('9e900000-0000-0000-0000-000000000001', pg_temp.img('b1900000-0000-0000-0000-000000000001')) ->> 'alt',
  'Front view of the item', 'a pool manager adds a pool photo');
select api.poolx_admin_media_add('9e900000-0000-0000-0000-000000000001', pg_temp.img(('b1900000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid))
  from generate_series(2, 12) i;
select throws_ok($$ select api.poolx_admin_media_add('9e900000-0000-0000-0000-000000000001', pg_temp.img('b1900000-0000-0000-0000-000000000013')) $$,
  'P0001', 'TOO_MANY_IMAGES: a pool can have at most 12 photos', 'at most 12 photos per pool');
select api.poolx_admin_media_update('b1900000-0000-0000-0000-000000000001', null, 'down');
select is((select api.poolx_admin_media_list('9e900000-0000-0000-0000-000000000001') -> 1 ->> 'id'),
  'b1900000-0000-0000-0000-000000000001', 'moving down swaps with the next photo');
select api.poolx_admin_publish('9e900000-0000-0000-0000-000000000001');
select throws_ok($$ select api.poolx_admin_media_update('b1900000-0000-0000-0000-000000000001', 'New caption') $$,
  'P0001', 'NOT_EDITABLE: photos can only change while the pool is a draft', 'no caption changes after publishing');
reset role;

set local role anon;
select is(jsonb_array_length(api.poolx_pool_media('md-pool')), 12, 'published pool photos are public');
select is(api.poolx_media_covers(array['md-pool']) #>> '{md-pool,id}', 'b1900000-0000-0000-0000-000000000002',
  'the pool cover follows the photo order');
reset role;

select * from finish();
rollback;
