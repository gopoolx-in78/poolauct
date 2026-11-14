-- Phase 7 theme manager + CMS: permissions, allowlist validation (no CSS/HTML/JS/URL injection), versions with
-- draft / publish / rollback, content draft / publish / revisions, SEO, and acceptance test 20 (design and content
-- changes never touch business, financial or permission data).
begin;
select plan(71);

insert into auth.users (id, email) values
  ('a7000000-0000-0000-0000-000000000001', 'cms-super@test.test'),
  ('a7000000-0000-0000-0000-000000000002', 'cms-content@test.test'),
  ('a7000000-0000-0000-0000-000000000003', 'cms-customer@test.test'),
  ('a7000000-0000-0000-0000-000000000004', 'cms-admin@test.test'),
  ('a7000000-0000-0000-0000-000000000005', 'cms-poolx@test.test');
select core.operator_grant_role('cms-super@test.test', 'super_admin', 'fixture');
select core.operator_grant_role('cms-content@test.test', 'content_manager', 'fixture');
select core.operator_grant_role('cms-admin@test.test', 'admin', 'fixture');
select core.operator_grant_role('cms-poolx@test.test', 'poolx_manager', 'fixture');

create function pg_temp.as_user(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.as_user(uuid, text) to authenticated, anon;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
grant execute on function pg_temp.as_anon() to authenticated, anon;

-- The shipped design (DEFAULT_THEME in src/modules/theme/schema.ts)
create function pg_temp.cfg() returns jsonb language sql immutable as $$ select '{"schema": 1, "template": "editorial", "colorScheme": "system", "colors": {"light": {"paper": "#f7f5f0", "surface": "#ffffff", "secondary": "#efebe3", "ink": "#141412", "inkMuted": "#55534d", "rule": "#d9d5cc", "primary": "#141412", "primaryInk": "#f7f5f0", "accent": "#1f5fad", "poolx": "#0b7a57", "poolxInk": "#ffffff", "auction": "#c2410c", "auctionInk": "#ffffff"}, "dark": {"paper": "#0e0e0c", "surface": "#181816", "secondary": "#1d1c19", "ink": "#f2f0ea", "inkMuted": "#a8a59c", "rule": "#2c2b27", "primary": "#f2f0ea", "primaryInk": "#0e0e0c", "accent": "#7cb4ff", "poolx": "#3ddc97", "poolxInk": "#06281c", "auction": "#ff8a4c", "auctionInk": "#2a0e02"}}, "fonts": {"display": "fraunces", "text": "plex-sans"}, "type": {"headingScale": "standard", "bodyScale": "standard"}, "radius": 4, "header": {"layout": "classic", "sticky": true}, "footer": {"layout": "columns", "tagline": "Group buying and online auctions — two marketplaces, one account."}, "nav": [{"href": "/", "label": "Home"}, {"href": "/poolx", "label": "PoolX"}, {"href": "/auctions", "label": "Auctions"}, {"href": "/how-it-works", "label": "How It Works"}, {"href": "/about", "label": "About Us"}, {"href": "/contact", "label": "Contact Us"}], "footerGroups": [{"title": "PoolX", "links": [{"href": "/poolx", "label": "Buying pools"}, {"href": "/how-it-works#poolx", "label": "How pooling works"}]}, {"title": "Auctions", "links": [{"href": "/auctions", "label": "Auctions"}, {"href": "/how-it-works#auctions", "label": "How bidding works"}]}, {"title": "Company", "links": [{"href": "/about", "label": "About Us"}, {"href": "/contact", "label": "Contact Us"}, {"href": "/faq", "label": "FAQ"}]}], "hero": {"eyebrow": "Two marketplaces · One account", "heading": "Buy together for better prices. Bid for what’s worth having.", "subheading": "Pool your demand with other buyers on PoolX, or take part in transparent online auctions for second-hand assets. Each marketplace runs on its own rules, with its own payments and records."}, "modules": {"poolx": {"visible": true, "heroStyle": "plain"}, "auction": {"visible": true, "heroStyle": "plain"}}, "home": {"sections": [{"type": "hero", "enabled": true}, {"type": "marketplaces", "enabled": true}, {"type": "principles", "enabled": true}, {"type": "how", "enabled": true}, {"type": "faq", "enabled": false}, {"type": "blog", "enabled": false}]}, "banners": []}'::jsonb $$;
grant execute on function pg_temp.cfg() to authenticated, anon;

-- Acceptance test 20: fingerprint of every business, financial and permission table before any design/content change
create function pg_temp.business_fingerprint() returns text language plpgsql as $$
declare r record; v text; acc text := '';
begin
  for r in select table_schema, table_name from information_schema.tables
            where table_type = 'BASE TABLE'
              and (table_schema in ('poolx', 'auction', 'ledger')
                   or (table_schema = 'core' and table_name in ('payment_attempts', 'payment_webhook_events', 'provider_refunds',
                       'system_settings', 'role_permissions', 'user_roles', 'roles', 'permissions', 'profiles')))
            order by 1, 2 loop
    execute format('select coalesce(md5(string_agg(t::text, ''|'' order by t::text)), ''empty'') from %I.%I t', r.table_schema, r.table_name)
      into v;
    acc := acc || r.table_schema || '.' || r.table_name || '=' || v || ';';
  end loop;
  return md5(acc);
end $$;
create temp table fingerprint as select pg_temp.business_fingerprint() as before;
grant select on fingerprint to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select api.cms_theme_overview() $$, '42501', null, 'anonymous visitors cannot open the theme manager');
select lives_ok($$ select api.cms_public_site() $$, 'anyone can read the published site design');
reset role;
select pg_temp.as_user('a7000000-0000-0000-0000-000000000003');
select throws_ok($$ select api.cms_theme_overview() $$, '42501', null, 'customers cannot open the theme manager');
select throws_ok($$ select api.cms_admin_list_faqs() $$, '42501', null, 'customers cannot manage content');
select throws_ok($$ select api.cms_admin_save_seo('home', 'A perfectly fine title', null) $$, '42501', null, 'customers cannot edit SEO');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000005');
select throws_ok($$ select api.cms_theme_save_draft(pg_temp.cfg(), 'PoolX attempt') $$, '42501', null, 'PoolX managers cannot edit the theme');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002', 'aal1');
select throws_ok($$ select api.cms_theme_save_draft(pg_temp.cfg(), 'No MFA') $$, '42501', null, 'staff without MFA cannot edit the theme');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000004');
select throws_ok($$ select api.cms_theme_overview() $$, '42501', null, 'admins (no theme permission) cannot open the theme manager');
select lives_ok($$ select api.cms_admin_list_faqs() $$, 'admins can manage content');

-- ---------------------------------------------------------------------------
-- Allowlist validation: anything but the documented tokens is rejected
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select throws_ok($$ select api.cms_theme_save_draft(pg_temp.cfg() || '{"deposit": {"enabled": false}}', 'Sneaky deposit') $$,
  'P0001', 'INVALID_THEME: unknown or missing top-level settings', 'unknown keys (e.g. a deposit switch) are rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{colors,light,paper}', '"red;} body{display:none"'::jsonb), 'CSS injection') $$,
  'P0001', 'INVALID_THEME: colours must be #rrggbb hex values (light.paper)', 'CSS injection through a colour is rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{colors,dark,accent}', '"#7CB4FF"'::jsonb), 'Upper case') $$,
  'P0001', 'INVALID_THEME: colours must be #rrggbb hex values (dark.accent)', 'colours must be normalised lowercase hex');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{nav,0,href}', '"javascript:alert(1)"'::jsonb), 'Script link') $$,
  'P0001', 'INVALID_THEME: Navigation: links must be internal paths such as /poolx', 'javascript: links are rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{nav,0,href}', '"//evil.example/login"'::jsonb), 'Offsite link') $$,
  'P0001', 'INVALID_THEME: Navigation: links must be internal paths such as /poolx', 'protocol-relative links are rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{hero,heading}', '"<script>alert(1)</script>"'::jsonb), 'Script text') $$,
  'P0001', 'INVALID_THEME: hero text: eyebrow up to 60, heading 1–120, subheading up to 300 plain characters',
  'markup in text fields is rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{colors,light,ink}', '"#f7f5f0"'::jsonb), 'Invisible text') $$,
  'P0001', 'INVALID_THEME: contrast too low in the light palette: ink on paper must be at least 4.5:1', 'unreadable colour pairs are rejected');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{home,sections,0,enabled}', 'false'::jsonb), 'No hero') $$,
  'P0001', 'INVALID_THEME: the hero (page heading) section must stay enabled', 'the page heading cannot be removed');
select throws_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{radius}', '99'::jsonb), 'Huge radius') $$,
  'P0001', 'INVALID_THEME: corner radius must be 0, 2, 4, 6, 8 or 12', 'radius outside the list is rejected');
select throws_ok($$ select api.cms_theme_save_draft(pg_temp.cfg() || '{"banners": [{"id": "promo", "message": "Sale", "linkLabel": "Go", "href": "https://evil.example", "tone": "info", "enabled": true}]}', 'Offsite banner') $$,
  'P0001', 'INVALID_THEME: banner links must be internal paths with link text', 'banners cannot link off-site');
select throws_ok($$ select api.cms_theme_save_draft(pg_temp.cfg() || '{"fonts": {"display": "Comic Sans", "text": "plex-sans"}}', 'Bad font') $$,
  'P0001', 'INVALID_THEME: fonts must be chosen from the list', 'fonts outside the self-hosted list are rejected');
select throws_ok($$ insert into cms.theme_versions (label, config, created_by, updated_by)
  values ('Direct', pg_temp.cfg(), 'a7000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'staff cannot write theme rows directly');
reset role;
select throws_ok($$ insert into cms.theme_versions (label, config, created_by, updated_by)
  values ('Invalid', '{"schema": 1}', 'a7000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'the table itself refuses invalid design documents');

-- ---------------------------------------------------------------------------
-- Draft / publish / versions / rollback
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select lives_ok($$ select api.cms_theme_save_draft(pg_temp.cfg(), 'Spring refresh') $$, 'content managers can save a valid draft');
select lives_ok($$ select api.cms_theme_save_draft(jsonb_set(pg_temp.cfg(), '{hero,heading}', '"A calmer homepage heading"'::jsonb), 'Spring refresh v2') $$,
  'saving again updates the single working draft');
select is((select count(*)::int from cms.theme_versions where status = 'DRAFT'), 1, 'there is only ever one working draft');
select is(api.cms_theme_overview() -> 'draft' -> 'config' -> 'hero' ->> 'heading', 'A calmer homepage heading', 'the draft holds the latest edit');
select is((api.cms_theme_overview() ->> 'canPublish')::boolean, false, 'content managers cannot publish');
select throws_ok($$ select api.cms_theme_publish('Ship the spring refresh') $$, '42501', null, 'publishing needs cms.theme.publish');

select pg_temp.as_user('a7000000-0000-0000-0000-000000000001');
select throws_ok($$ select api.cms_theme_publish('short') $$, 'P0001', 'REASON_REQUIRED: describe the change (at least 10 characters)',
  'publishing needs a description');
create temp table v1 as select api.cms_theme_publish('Ship the spring refresh') as id;
grant select on v1 to anon;
select pg_temp.as_anon();
select is((api.cms_public_site() ->> 'version')::bigint, (select id from v1), 'the published version is served publicly');
select is(api.cms_public_site() -> 'config' -> 'hero' ->> 'heading', 'A calmer homepage heading', 'visitors see the published design');
reset role;
select is((select count(*)::int from cms.theme_versions where status = 'DRAFT'), 0, 'publishing consumes the draft');
select throws_ok($$ update cms.theme_versions set config = pg_temp.cfg() where id = (select id from v1) $$,
  'P0001', 'THEME_LOCKED: published and archived versions cannot be edited', 'published versions are immutable');
select throws_ok($$ delete from cms.theme_versions where id = (select id from v1) $$, '42501', null, 'versions are never deleted');

select pg_temp.as_user('a7000000-0000-0000-0000-000000000001');
select lives_ok($$ select api.cms_theme_save_draft(jsonb_set(jsonb_set(pg_temp.cfg(), '{template}', '"bold"'::jsonb), '{radius}', '8'::jsonb), 'Bold experiment') $$, 'a second draft');
create temp table v2 as select api.cms_theme_publish('Trying the bold template') as id;
select is((select status from cms.theme_versions where id = (select id from v1)), 'ARCHIVED', 'the previous version is archived');
create temp table v3 as select api.cms_theme_rollback((select id from v1), 'Bold template confused members') as id;
select is((select config from cms.theme_versions where id = (select id from v3)), (select config from cms.theme_versions where id = (select id from v1)),
  'rollback re-publishes the earlier design as a new version');
select is((select status from cms.theme_versions where id = (select id from v2)), 'ARCHIVED', 'the rolled-back version is archived, not deleted');
select throws_ok($$ select api.cms_theme_rollback((select id from v3), 'Already live version') $$, 'P0001',
  'INVALID_REQUEST: that version is already live', 'cannot roll back to the live version');
select lives_ok($$ select api.cms_theme_save_draft(pg_temp.cfg(), 'Abandoned idea') $$, 'a draft to discard');
select throws_ok($$ select api.cms_theme_rollback((select id from cms.theme_versions where status = 'DRAFT'), 'Restore the draft') $$, 'P0001',
  'NOT_FOUND: only previously published versions can be restored', 'never-published versions cannot be restored');
select throws_ok($$ select api.cms_theme_discard_draft('nope') $$, 'P0001', 'REASON_REQUIRED: give a reason (at least 10 characters)',
  'discarding needs a reason');
select lives_ok($$ select api.cms_theme_discard_draft('Not pursuing this idea') $$, 'drafts can be discarded');
select is((select count(*)::int from core.audit_logs where action in ('cms.theme.published', 'cms.theme.rolled_back')
            and entity_id in ((select id::text from v1), (select id::text from v2), (select id::text from v3))), 3,
  'every publish and rollback is in the audit log');

-- ---------------------------------------------------------------------------
-- Content: draft / publish / revisions (pages and posts)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select throws_ok($$ select api.cms_admin_save_document(null, 'POST', 'Bad Slug', 'A title', '', 'Body', null, null, null) $$,
  'P0001', 'INVALID_SLUG: use 3–80 lowercase letters, numbers and single hyphens', 'slugs are validated');
create temp table doc as select api.cms_admin_save_document(null, 'POST', 'pool-tips', 'Five pooling tips', 'Short summary',
  E'Intro <script>alert(1)</script>\n\n[x](javascript:alert(1))', null, null, 'first draft') as id;
grant select on doc to authenticated, anon;
select pg_temp.as_anon();
select is(api.cms_public_document('POST', 'pool-tips'), null, 'drafts are not public');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select lives_ok($$ select api.cms_admin_document_action((select id from doc), 'PUBLISH', null, null) $$, 'publish');
select lives_ok($$ select api.cms_admin_save_document((select id from doc), 'POST', 'pool-tips', 'Six pooling tips', 'Short summary',
  'Updated body', null, null, 'second draft') $$, 'edit after publishing creates a new revision');
select pg_temp.as_anon();
select is(api.cms_public_document('POST', 'pool-tips') ->> 'title', 'Five pooling tips', 'visitors keep seeing the published revision');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select lives_ok($$ select api.cms_admin_document_action((select id from doc), 'PUBLISH', null, null) $$, 'publish the new revision');
select pg_temp.as_anon();
select is(api.cms_public_document('POST', 'pool-tips') ->> 'title', 'Six pooling tips', 'the new revision is live after publishing');
select ok(api.cms_public_documents('POST', 100, 0) -> 'items' @> '[{"slug": "pool-tips"}]', 'listed in the public blog index');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000002');
select throws_ok($$ select api.cms_admin_save_document((select id from doc), 'POST', 'pool-tips-2', 'Six pooling tips', '', 'Body', null, null, null) $$,
  'P0001', 'SLUG_LOCKED: the web address cannot change after first publication', 'published addresses are stable');
select lives_ok($$ select api.cms_admin_document_action((select id from doc), 'RESTORE', 1, null) $$, 'restore revision 1');
select is((api.cms_admin_get_document((select id from doc)) -> 'latest' ->> 'title'), 'Five pooling tips', 'restored content becomes the latest revision');
select is((api.cms_admin_get_document((select id from doc)) ->> 'latestRevision')::int, 3, 'restoring adds a revision (history kept)');
select throws_ok($$ select api.cms_admin_document_action((select id from doc), 'UNPUBLISH', null, 'no') $$, 'P0001',
  'REASON_REQUIRED: give a reason (at least 10 characters)', 'unpublishing needs a reason');
select lives_ok($$ select api.cms_admin_document_action((select id from doc), 'UNPUBLISH', null, 'Outdated advice for now') $$, 'unpublish');
select pg_temp.as_anon();
select is(api.cms_public_document('POST', 'pool-tips'), null, 'unpublished content disappears');
reset role;
select throws_ok($$ update cms.document_revisions set title = 'Rewritten history' where document_id = (select id from doc) $$,
  '42501', null, 'revisions are append-only');

-- ---------------------------------------------------------------------------
-- FAQs and SEO
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a7000000-0000-0000-0000-000000000004');
create temp table faq as select api.cms_admin_save_faq(null, 'auction', 'Is the deposit refundable?',
  'If you do not win, the full deposit is refunded.', 10, 'HIDDEN') as id;
grant select on faq to authenticated, anon;
select pg_temp.as_anon();
select ok(not (api.cms_public_faqs() @> jsonb_build_array(jsonb_build_object('id', (select id from faq)))), 'hidden FAQs are not public');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000004');
select lives_ok($$ select api.cms_admin_save_faq((select id from faq), 'auction', 'Is the deposit refundable?',
  'If you do not win, the full deposit is refunded to your original payment method.', 10, 'PUBLISHED') $$, 'publish the FAQ');
select pg_temp.as_anon();
select ok(api.cms_public_faqs() @> jsonb_build_array(jsonb_build_object('id', (select id from faq))), 'published FAQs are public');
reset role;
select is((select before ->> 'answer' from core.audit_logs where action = 'cms.faq.saved' and entity_id = (select id::text from faq)
            and before is not null order by id desc limit 1), 'If you do not win, the full deposit is refunded.',
  'the audit log keeps the previous answer so the change can be reversed');
select pg_temp.as_user('a7000000-0000-0000-0000-000000000004');
select lives_ok($$ select api.cms_admin_save_seo('home', 'Group buying and online auctions in India', null) $$, 'admins can set an SEO title');
select throws_ok($$ select api.cms_admin_save_seo('home', 'Short', null) $$, '23514', null, 'SEO titles are length-checked');
select throws_ok($$ select api.cms_admin_save_seo('admin', 'Admin area title override', null) $$, '23514', null, 'only allowlisted routes have SEO entries');
select pg_temp.as_anon();
select is(api.cms_public_seo() -> 'home' ->> 'title', 'Group buying and online auctions in India', 'SEO overrides are public');

-- ---------------------------------------------------------------------------
-- Acceptance test 20: design and content changes did not alter any business data, and CMS code never references it
-- ---------------------------------------------------------------------------
reset role;
select is(pg_temp.business_fingerprint(), (select before from fingerprint),
  'acceptance 20: no PoolX, auction, ledger, payment, settings or permission row changed');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'cms' or (n.nspname = 'api' and p.proname like 'cms\_%'))
              and p.prosrc ~* '(poolx|auction|ledger)\.|payment_attempts|system_settings|role_permissions|user_roles'), 0,
  'acceptance 20: no theme / CMS function references business tables');
select is((select count(*)::int from information_schema.table_constraints tc
             join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
            where tc.table_schema = 'cms' and tc.constraint_type = 'FOREIGN KEY' and ccu.table_schema in ('poolx', 'auction', 'ledger')), 0,
  'acceptance 20: CMS tables have no foreign keys into business schemas');

select * from finish();
rollback;
