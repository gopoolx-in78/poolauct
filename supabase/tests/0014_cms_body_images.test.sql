-- Images inside CMS bodies (migration 0020, TD-77).
begin;
select plan(15);

insert into auth.users (id, email) values
  ('a7300000-0000-0000-0000-000000000002', 'bi-content@test.test'),
  ('a7300000-0000-0000-0000-000000000003', 'bi-customer@test.test'),
  ('a7300000-0000-0000-0000-000000000004', 'bi-poolx@test.test');
select core.operator_grant_role('bi-content@test.test', 'content_manager', 'fixture');
select core.operator_grant_role('bi-poolx@test.test', 'poolx_manager', 'fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated;

create function pg_temp.img(p_id uuid, p_alt text default 'Members unpacking a pooled delivery') returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'width', 1600, 'height', 900, 'thumbWidth', 480, 'thumbHeight', 270,
                            'bytes', 120000, 'alt', p_alt);
$$;
grant execute on function pg_temp.img(uuid, text) to authenticated;

create temp table doc (k text primary key, id uuid);
grant select, insert on doc to authenticated, anon;

select pg_temp.as_user('a7300000-0000-0000-0000-000000000002');
insert into doc select 'a', api.cms_admin_save_document(null, 'POST', 'body-image-post', 'Body image post', 'A post with images',
  'Intro ![x](media:c2000000-0000-0000-0000-000000000001)', null, null, 'draft');
insert into doc select 'b', api.cms_admin_save_document(null, 'POST', 'body-image-other', 'Other post', 'Another post',
  'Body', null, null, 'draft');
reset role;

select ok((select relrowsecurity from pg_class where oid = 'cms.document_images'::regclass), 'RLS on cms.document_images');
select ok(not has_function_privilege('anon', 'api.cms_admin_image_add(uuid, jsonb)', 'execute'), 'anonymous callers cannot add images');

select pg_temp.as_user('a7300000-0000-0000-0000-000000000003');
select throws_ok($$ select api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'customers cannot add images');
reset role;
select pg_temp.as_user('a7300000-0000-0000-0000-000000000004');
select throws_ok($$ select api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'staff without content permission cannot add images');
reset role;
select pg_temp.as_user('a7300000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'content managers need an MFA session');
reset role;

select pg_temp.as_user('a7300000-0000-0000-0000-000000000002');
select is(api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000001')) #>> '{display,path}',
  'c2000000-0000-0000-0000-000000000001/display.webp', 'a content manager adds a body image');
select api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000002', 'Second image'));
select api.cms_admin_image_add((select id from doc where k = 'b'), pg_temp.img('c2000000-0000-0000-0000-000000000003', 'Other post image'));
select throws_ok($$ select api.cms_admin_image_add((select id from doc where k = 'a'), pg_temp.img('c2000000-0000-0000-0000-000000000004', 'x')) $$,
  'P0001', 'INVALID_ALT: describe the image in 3 to 200 characters', 'alt text is required');
select throws_ok($$ select api.cms_admin_image_add('00000000-0000-0000-0000-000000000000', pg_temp.img('c2000000-0000-0000-0000-000000000005')) $$,
  'P0001', 'DOCUMENT_NOT_FOUND: page or post not found', 'unknown documents are rejected');
select is(jsonb_array_length(api.cms_admin_image_list((select id from doc where k = 'a'))), 2, 'staff list shows the document''s images');
select api.cms_admin_document_action((select id from doc where k = 'a'), 'PUBLISH', null, null);
reset role;

set local role anon;
select is((select array_agg(k order by k) from jsonb_object_keys(api.cms_public_document('POST', 'body-image-post') -> 'images') k),
  array['c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002'],
  'the published post includes only its own images');
select is(api.cms_public_document('POST', 'body-image-other'), null, 'draft posts and their images are not public');
reset role;

select pg_temp.as_user('a7300000-0000-0000-0000-000000000002');
select is(api.cms_admin_image_remove('c2000000-0000-0000-0000-000000000002'), (select id from doc where k = 'a'),
  'removing returns the document id');
select throws_ok($$ select api.cms_admin_image_remove('c2000000-0000-0000-0000-000000000002') $$, 'P0001',
  'NOT_FOUND: image not found', 'an image can be removed once');
reset role;
set local role anon;
select is((select array_agg(k) from jsonb_object_keys(api.cms_public_document('POST', 'body-image-post') -> 'images') k),
  array['c2000000-0000-0000-0000-000000000001'], 'removed images disappear from the public post');
reset role;
select is((select count(*)::int from core.audit_logs where action like 'cms.image.%'
             and entity_id in (select id::text from doc)), 4, 'every image change is audited');

select * from finish();
rollback;
