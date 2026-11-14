-- CMS cover images (migration 0018, TD-75).
begin;
select plan(16);

insert into auth.users (id, email) values
  ('a7100000-0000-0000-0000-000000000002', 'cv-content@test.test'),
  ('a7100000-0000-0000-0000-000000000003', 'cv-customer@test.test'),
  ('a7100000-0000-0000-0000-000000000004', 'cv-poolx@test.test');
select core.operator_grant_role('cv-content@test.test', 'content_manager', 'fixture');
select core.operator_grant_role('cv-poolx@test.test', 'poolx_manager', 'fixture');

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

create temp table doc (id uuid);
grant select, insert on doc to authenticated, anon;

select pg_temp.as_user('a7100000-0000-0000-0000-000000000002');
insert into doc select api.cms_admin_save_document(null, 'POST', 'cover-test-post', 'Cover test post', 'A post with a cover',
  'Body text', null, null, 'draft');
reset role;

select ok((select relrowsecurity from pg_class where oid = 'cms.document_covers'::regclass), 'RLS on cms.document_covers');
select ok(not has_function_privilege('anon', 'api.cms_admin_cover_set(uuid, jsonb)', 'execute'), 'anonymous callers cannot set covers');

select pg_temp.as_user('a7100000-0000-0000-0000-000000000003');
select throws_ok($$ select api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'customers cannot set covers');
reset role;
select pg_temp.as_user('a7100000-0000-0000-0000-000000000004');
select throws_ok($$ select api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'staff without content permission cannot set covers');
reset role;
select pg_temp.as_user('a7100000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000001')) $$,
  '42501', null, 'content managers need an MFA session');
reset role;

select pg_temp.as_user('a7100000-0000-0000-0000-000000000002');
select is(api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000001')) ->> 'replacedId', null,
  'first cover replaces nothing');
select throws_ok($$ select api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000002', 'x')) $$,
  'P0001', 'INVALID_ALT: describe the image in 3 to 200 characters', 'alt text is required');
select is(api.cms_admin_cover_set((select id from doc), pg_temp.img('c1900000-0000-0000-0000-000000000003', 'Second cover')) ->> 'replacedId',
  'c1900000-0000-0000-0000-000000000001', 'replacing returns the old media id for file deletion');
select is(api.cms_admin_cover_get((select id from doc)) ->> 'alt', 'Second cover', 'staff see the current cover');
select throws_ok($$ select api.cms_admin_cover_set('00000000-0000-0000-0000-000000000000', pg_temp.img('c1900000-0000-0000-0000-000000000004')) $$,
  'P0001', 'DOCUMENT_NOT_FOUND: page or post not found', 'unknown documents are rejected');
reset role;
select is((select status from core.media_assets where id = 'c1900000-0000-0000-0000-000000000001'), 'REMOVED',
  'the replaced cover is kept as REMOVED');

set local role anon;
select is(api.cms_public_document('POST', 'cover-test-post'), null, 'draft posts and their covers are not public');
reset role;
select pg_temp.as_user('a7100000-0000-0000-0000-000000000002');
select api.cms_admin_document_action((select id from doc), 'PUBLISH', null, null);
reset role;
set local role anon;
select is(api.cms_public_document('POST', 'cover-test-post') #>> '{cover,display,path}',
  'c1900000-0000-0000-0000-000000000003/display.webp', 'the published post includes its cover');
select is((select x -> 'cover' ->> 'alt' from jsonb_array_elements(api.cms_public_documents('POST', 100, 0) -> 'items') x
           where x ->> 'slug' = 'cover-test-post'), 'Second cover', 'the blog index includes covers');
reset role;

select pg_temp.as_user('a7100000-0000-0000-0000-000000000002');
select is(api.cms_admin_cover_remove((select id from doc)), 'c1900000-0000-0000-0000-000000000003'::uuid, 'removing returns the media id');
reset role;
select is((select count(*)::int from core.audit_logs where action like 'cms.cover.%' and entity_id = (select id::text from doc)), 3,
  'every cover change is audited');

select * from finish();
rollback;
