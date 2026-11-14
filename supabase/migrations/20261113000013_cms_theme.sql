-- Phase 7: theme manager and CMS (cms schema).
-- Design is data: a site-design document (theme tokens + homepage + navigation + footer + banners) is validated
-- against an allowlist here, versioned (draft / publish / rollback) and compiled to CSS variables by the app.
-- Nothing in this file reads or writes business tables (poolx, auction, ledger, payments, settings) — acceptance test 20.

grant usage on schema cms to authenticated;

-- ---------------------------------------------------------------------------
-- Validation helpers (pure, immutable)
-- ---------------------------------------------------------------------------
create or replace function cms.has_exact_keys(j jsonb, keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'object'
              then (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k)
                 = (select array_agg(k order by k) from unnest(keys) k)
              else false end;
$$;

/** Plain text: string, length bounds, no control characters or angle brackets. */
create or replace function cms.is_plain_text(j jsonb, min_len int, max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(j) = 'string'
     and char_length(j #>> '{}') between min_len and max_len
     and (j #>> '{}') !~ '[[:cntrl:]<>]'
     and (min_len = 0 or btrim(j #>> '{}') <> ''), false);
$$;

/** Internal links only: "/", "/path/to-page", optional "#anchor". No scheme, no host, no "//", no query. */
create or replace function cms.is_internal_href(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(t is not null and char_length(t) <= 120
     and t ~ '^/([a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*)?(#[a-z0-9][a-z0-9-]*)?$', false);
$$;

create or replace function cms.is_hex(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(j) = 'string' and (j #>> '{}') ~ '^#[0-9a-f]{6}$', false);
$$;

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
create or replace function cms.contrast(a text, b text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare la numeric; lb numeric;
begin
  select sum(w * case when c <= 0.03928 then c / 12.92 else power((c + 0.055) / 1.055, 2.4) end)
    into la
    from (values (0.2126, ('x' || substr(a, 2, 2))::bit(8)::int / 255.0),
                 (0.7152, ('x' || substr(a, 4, 2))::bit(8)::int / 255.0),
                 (0.0722, ('x' || substr(a, 6, 2))::bit(8)::int / 255.0)) v(w, c);
  select sum(w * case when c <= 0.03928 then c / 12.92 else power((c + 0.055) / 1.055, 2.4) end)
    into lb
    from (values (0.2126, ('x' || substr(b, 2, 2))::bit(8)::int / 255.0),
                 (0.7152, ('x' || substr(b, 4, 2))::bit(8)::int / 255.0),
                 (0.0722, ('x' || substr(b, 6, 2))::bit(8)::int / 255.0)) v(w, c);
  return (greatest(la, lb) + 0.05) / (least(la, lb) + 0.05);
end;
$$;

create or replace function cms.link_list_problem(arr jsonb, min_n int, max_n int, what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare e jsonb;
begin
  if jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) not between min_n and max_n then
    return what || ' must have ' || min_n || '–' || max_n || ' links';
  end if;
  for e in select * from jsonb_array_elements(arr) loop
    if not cms.has_exact_keys(e, array['label', 'href']) then return what || ': each link needs exactly label and href'; end if;
    if not cms.is_plain_text(e->'label', 1, 30) then return what || ': link labels are 1–30 plain characters'; end if;
    if jsonb_typeof(e->'href') <> 'string' or not cms.is_internal_href(e->>'href') then
      return what || ': links must be internal paths such as /poolx';
    end if;
  end loop;
  return null;
end;
$$;

/**
 * Returns null when the site-design document is valid, otherwise a short description of the first problem.
 * Every key and value is allowlisted; anything else is rejected (no raw CSS / HTML / JS / URLs).
 */
create or replace function cms.theme_config_problem(c jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  palette text[] := array['paper', 'surface', 'secondary', 'ink', 'inkMuted', 'rule', 'primary', 'primaryInk', 'accent',
                          'poolx', 'poolxInk', 'auction', 'auctionInk'];
  m text; k text; p jsonb; e jsonb; g jsonb; v_problem text; v_ids text[] := '{}';
  pairs text[][] := array[
    ['ink', 'paper', '4.5'], ['ink', 'surface', '4.5'], ['ink', 'secondary', '4.5'],
    ['inkMuted', 'paper', '4.5'], ['inkMuted', 'surface', '4.5'], ['inkMuted', 'secondary', '4.5'],
    ['primaryInk', 'primary', '4.5'], ['accent', 'paper', '4.5'],
    ['poolxInk', 'poolx', '4.5'], ['poolx', 'paper', '4.5'], ['poolx', 'surface', '4.5'],
    ['auctionInk', 'auction', '4.5'], ['auction', 'paper', '4.5'], ['auction', 'surface', '4.5']];
  i int;
begin
  if c is null or not cms.has_exact_keys(c, array['schema', 'template', 'colorScheme', 'colors', 'fonts', 'type', 'radius',
      'header', 'footer', 'nav', 'footerGroups', 'hero', 'modules', 'home', 'banners']) then
    return 'unknown or missing top-level settings';
  end if;
  if c->'schema' <> '1'::jsonb then return 'unsupported schema version'; end if;
  if jsonb_typeof(c->'template') <> 'string' or c->>'template' not in ('editorial', 'bold', 'minimal') then return 'unknown template'; end if;
  if jsonb_typeof(c->'colorScheme') <> 'string' or c->>'colorScheme' not in ('system', 'light', 'dark') then return 'unknown colour scheme'; end if;

  -- Colours: two complete palettes of lowercase #rrggbb values, with readable contrast.
  if not cms.has_exact_keys(c->'colors', array['light', 'dark']) then return 'colours need a light and a dark palette'; end if;
  foreach m in array array['light', 'dark'] loop
    p := c->'colors'->m;
    if not cms.has_exact_keys(p, palette) then return 'the ' || m || ' palette has unknown or missing colours'; end if;
    foreach k in array palette loop
      if not cms.is_hex(p->k) then return 'colours must be #rrggbb hex values (' || m || '.' || k || ')'; end if;
    end loop;
    for i in 1 .. array_length(pairs, 1) loop
      if cms.contrast(p->>pairs[i][1], p->>pairs[i][2]) < pairs[i][3]::numeric then
        return 'contrast too low in the ' || m || ' palette: ' || pairs[i][1] || ' on ' || pairs[i][2]
               || ' must be at least ' || pairs[i][3] || ':1';
      end if;
    end loop;
  end loop;

  if not cms.has_exact_keys(c->'fonts', array['display', 'text'])
     or jsonb_typeof(c->'fonts'->'display') <> 'string' or c->'fonts'->>'display' not in ('fraunces', 'plex-serif', 'plex-sans')
     or jsonb_typeof(c->'fonts'->'text') <> 'string' or c->'fonts'->>'text' not in ('plex-sans', 'plex-serif') then
    return 'fonts must be chosen from the list';
  end if;
  if not cms.has_exact_keys(c->'type', array['headingScale', 'bodyScale'])
     or jsonb_typeof(c->'type'->'headingScale') <> 'string' or c->'type'->>'headingScale' not in ('compact', 'standard', 'large')
     or jsonb_typeof(c->'type'->'bodyScale') <> 'string' or c->'type'->>'bodyScale' not in ('compact', 'standard', 'large') then
    return 'type sizes must be compact, standard or large';
  end if;
  if jsonb_typeof(c->'radius') <> 'number' or (c->>'radius')::numeric not in (0, 2, 4, 6, 8, 12) then
    return 'corner radius must be 0, 2, 4, 6, 8 or 12';
  end if;

  if not cms.has_exact_keys(c->'header', array['layout', 'sticky'])
     or jsonb_typeof(c->'header'->'layout') <> 'string' or c->'header'->>'layout' not in ('classic', 'centered', 'split')
     or jsonb_typeof(c->'header'->'sticky') <> 'boolean' then
    return 'header layout must be classic, centered or split';
  end if;
  if not cms.has_exact_keys(c->'footer', array['layout', 'tagline'])
     or jsonb_typeof(c->'footer'->'layout') <> 'string' or c->'footer'->>'layout' not in ('columns', 'compact')
     or not cms.is_plain_text(c->'footer'->'tagline', 0, 160) then
    return 'footer layout must be columns or compact, tagline up to 160 plain characters';
  end if;

  v_problem := cms.link_list_problem(c->'nav', 1, 8, 'Navigation');
  if v_problem is not null then return v_problem; end if;
  if jsonb_typeof(c->'footerGroups') <> 'array' or jsonb_array_length(c->'footerGroups') > 4 then
    return 'footer can have up to 4 link groups';
  end if;
  for g in select * from jsonb_array_elements(c->'footerGroups') loop
    if not cms.has_exact_keys(g, array['title', 'links']) or not cms.is_plain_text(g->'title', 1, 30) then
      return 'footer groups need a 1–30 character title and links';
    end if;
    v_problem := cms.link_list_problem(g->'links', 1, 6, 'Footer group "' || (g->>'title') || '"');
    if v_problem is not null then return v_problem; end if;
  end loop;

  if not cms.has_exact_keys(c->'hero', array['eyebrow', 'heading', 'subheading'])
     or not cms.is_plain_text(c->'hero'->'eyebrow', 0, 60)
     or not cms.is_plain_text(c->'hero'->'heading', 1, 120)
     or not cms.is_plain_text(c->'hero'->'subheading', 0, 300) then
    return 'hero text: eyebrow up to 60, heading 1–120, subheading up to 300 plain characters';
  end if;

  if not cms.has_exact_keys(c->'modules', array['poolx', 'auction']) then return 'module settings must cover poolx and auction'; end if;
  foreach m in array array['poolx', 'auction'] loop
    p := c->'modules'->m;
    if not cms.has_exact_keys(p, array['visible', 'heroStyle']) or jsonb_typeof(p->'visible') <> 'boolean'
       or jsonb_typeof(p->'heroStyle') <> 'string' or p->>'heroStyle' not in ('plain', 'tinted', 'solid') then
      return 'module settings: visible (true/false) and hero style plain, tinted or solid';
    end if;
  end loop;

  if not cms.has_exact_keys(c->'home', array['sections']) or jsonb_typeof(c->'home'->'sections') <> 'array'
     or jsonb_array_length(c->'home'->'sections') <> 6 then
    return 'homepage must list each of the 6 sections once';
  end if;
  for e in select * from jsonb_array_elements(c->'home'->'sections') loop
    if not cms.has_exact_keys(e, array['type', 'enabled']) or jsonb_typeof(e->'type') <> 'string'
       or e->>'type' not in ('hero', 'marketplaces', 'principles', 'how', 'faq', 'blog')
       or jsonb_typeof(e->'enabled') <> 'boolean' then
      return 'unknown homepage section';
    end if;
    if (e->>'type') = any (v_ids) then return 'each homepage section can appear only once'; end if;
    v_ids := v_ids || (e->>'type');
    if e->>'type' = 'hero' and e->'enabled' <> 'true'::jsonb then return 'the hero (page heading) section must stay enabled'; end if;
  end loop;

  v_ids := '{}';
  if jsonb_typeof(c->'banners') <> 'array' or jsonb_array_length(c->'banners') > 3 then return 'up to 3 banners'; end if;
  for e in select * from jsonb_array_elements(c->'banners') loop
    if not cms.has_exact_keys(e, array['id', 'message', 'linkLabel', 'href', 'tone', 'enabled'])
       or jsonb_typeof(e->'id') <> 'string' or (e->>'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$' or (e->>'id') = any (v_ids)
       or not cms.is_plain_text(e->'message', 1, 160) or not cms.is_plain_text(e->'linkLabel', 0, 40)
       or jsonb_typeof(e->'tone') <> 'string' or e->>'tone' not in ('info', 'success', 'warning')
       or jsonb_typeof(e->'enabled') <> 'boolean' then
      return 'banner: unique id, message 1–160 plain characters, tone info/success/warning';
    end if;
    if jsonb_typeof(e->'href') = 'null' then
      if (e->>'linkLabel') <> '' then return 'banner link text needs a link'; end if;
    elsif jsonb_typeof(e->'href') <> 'string' or not cms.is_internal_href(e->>'href') or (e->>'linkLabel') = '' then
      return 'banner links must be internal paths with link text';
    end if;
    v_ids := v_ids || (e->>'id');
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Theme versions: one working draft, one published, the rest archived. Never deleted.
-- ---------------------------------------------------------------------------
create table cms.theme_versions (
  id bigint generated always as identity primary key,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  label text not null check (char_length(btrim(label)) between 3 and 80 and label !~ '[[:cntrl:]<>]'),
  config jsonb not null constraint theme_config_valid check (cms.theme_config_problem(config) is null),
  based_on bigint references cms.theme_versions (id),
  created_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references core.profiles (id),
  updated_at timestamptz not null default now(),
  published_by uuid references core.profiles (id),
  published_at timestamptz,
  publish_note text,
  archived_at timestamptz,
  constraint theme_published_documented check (
    published_at is null or (published_by is not null and char_length(btrim(coalesce(publish_note, ''))) >= 10)),
  constraint theme_published_state check (status <> 'PUBLISHED' or published_at is not null),
  constraint theme_archived_state check ((status = 'ARCHIVED') = (archived_at is not null))
);
create unique index theme_versions_one_published on cms.theme_versions (status) where status = 'PUBLISHED';
create unique index theme_versions_one_draft on cms.theme_versions (status) where status = 'DRAFT';

create or replace function cms.guard_theme_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' and (new.config is distinct from old.config or new.label is distinct from old.label) then
    raise exception 'THEME_LOCKED: published and archived versions cannot be edited' using errcode = 'P0001';
  end if;
  if not ((old.status = new.status) or (old.status = 'DRAFT' and new.status in ('PUBLISHED', 'ARCHIVED'))
          or (old.status = 'PUBLISHED' and new.status = 'ARCHIVED')) then
    raise exception 'INVALID_TRANSITION: % → %', old.status, new.status using errcode = 'P0001';
  end if;
  if old.published_at is not null and (new.published_at, new.published_by, new.publish_note)
       is distinct from (old.published_at, old.published_by, old.publish_note) then
    raise exception 'THEME_LOCKED: publication record is immutable' using errcode = 'P0001';
  end if;
  if (new.created_by, new.created_at, new.based_on) is distinct from (old.created_by, old.created_at, old.based_on) then
    raise exception 'THEME_LOCKED: creation record is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger theme_versions_guard before update on cms.theme_versions for each row execute function cms.guard_theme_version();
create trigger theme_versions_no_delete before delete on cms.theme_versions for each row execute function core.forbid_delete();

-- ---------------------------------------------------------------------------
-- Documents (PAGE at /info/[slug], POST at /blog/[slug]) with append-only revisions
-- ---------------------------------------------------------------------------
create table cms.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('PAGE', 'POST')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  latest_revision int not null default 0 check (latest_revision >= 0),
  published_revision int check (published_revision >= 1),
  first_published_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references core.profiles (id),
  updated_at timestamptz not null default now(),
  unique (kind, slug),
  constraint documents_published_state check (
    (status = 'PUBLISHED') = (published_revision is not null)
    and (status <> 'PUBLISHED' or (published_at is not null and first_published_at is not null))),
  constraint documents_revision_order check (published_revision is null or published_revision <= latest_revision)
);
create trigger documents_no_delete before delete on cms.documents for each row execute function core.forbid_delete();

create table cms.document_revisions (
  id bigint generated always as identity primary key,
  document_id uuid not null references cms.documents (id),
  revision int not null check (revision >= 1),
  title text not null check (char_length(btrim(title)) between 3 and 120 and title !~ '[[:cntrl:]]'),
  summary text not null default '' check (char_length(summary) <= 300 and summary !~ '[[:cntrl:]]'),
  body text not null check (char_length(body) between 1 and 50000 and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  seo_title text check (seo_title is null or (char_length(seo_title) between 10 and 70 and seo_title !~ '[[:cntrl:]]')),
  seo_description text check (seo_description is null
    or (char_length(seo_description) between 50 and 160 and seo_description !~ '[[:cntrl:]]')),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now(),
  unique (document_id, revision)
);
create trigger document_revisions_append_only before update or delete on cms.document_revisions
  for each row execute function core.forbid_mutation();

-- ---------------------------------------------------------------------------
-- FAQs and SEO entries (every change audited with before/after so it can be reversed)
-- ---------------------------------------------------------------------------
create table cms.faqs (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('general', 'poolx', 'auction')),
  question text not null check (char_length(btrim(question)) between 5 and 200 and question !~ '[[:cntrl:]]'),
  answer text not null check (char_length(btrim(answer)) between 5 and 2000 and answer !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  sort int not null default 100 check (sort between 0 and 1000),
  status text not null default 'HIDDEN' check (status in ('PUBLISHED', 'HIDDEN')),
  created_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references core.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger faqs_no_delete before delete on cms.faqs for each row execute function core.forbid_delete();

create table cms.seo_entries (
  route_key text primary key check (route_key in ('home', 'poolx', 'auctions', 'how-it-works', 'about', 'contact', 'faq', 'blog')),
  title text check (title is null or (char_length(title) between 10 and 70 and title !~ '[[:cntrl:]]')),
  description text check (description is null or (char_length(description) between 50 and 160 and description !~ '[[:cntrl:]]')),
  updated_by uuid not null references core.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger seo_entries_no_delete before delete on cms.seo_entries for each row execute function core.forbid_delete();

-- ---------------------------------------------------------------------------
-- RLS: staff with the matching permission may read; nobody writes directly (functions only)
-- ---------------------------------------------------------------------------
alter table cms.theme_versions enable row level security;
alter table cms.documents enable row level security;
alter table cms.document_revisions enable row level security;
alter table cms.faqs enable row level security;
alter table cms.seo_entries enable row level security;
grant select on cms.theme_versions, cms.documents, cms.document_revisions, cms.faqs, cms.seo_entries to authenticated;

create policy theme_versions_select on cms.theme_versions for select to authenticated
  using (core.has_permission('cms.theme.edit') or core.has_permission('cms.theme.publish'));
create policy theme_versions_insert on cms.theme_versions for insert to authenticated with check (false);
create policy theme_versions_update on cms.theme_versions for update to authenticated using (false);
create policy theme_versions_delete on cms.theme_versions for delete to authenticated using (false);

create policy documents_select on cms.documents for select to authenticated using (core.has_permission('cms.content.manage'));
create policy documents_insert on cms.documents for insert to authenticated with check (false);
create policy documents_update on cms.documents for update to authenticated using (false);
create policy documents_delete on cms.documents for delete to authenticated using (false);

create policy revisions_select on cms.document_revisions for select to authenticated using (core.has_permission('cms.content.manage'));
create policy revisions_insert on cms.document_revisions for insert to authenticated with check (false);
create policy revisions_update on cms.document_revisions for update to authenticated using (false);
create policy revisions_delete on cms.document_revisions for delete to authenticated using (false);

create policy faqs_select on cms.faqs for select to authenticated using (core.has_permission('cms.content.manage'));
create policy faqs_insert on cms.faqs for insert to authenticated with check (false);
create policy faqs_update on cms.faqs for update to authenticated using (false);
create policy faqs_delete on cms.faqs for delete to authenticated using (false);

create policy seo_select on cms.seo_entries for select to authenticated using (core.has_permission('seo.manage'));
create policy seo_insert on cms.seo_entries for insert to authenticated with check (false);
create policy seo_update on cms.seo_entries for update to authenticated using (false);
create policy seo_delete on cms.seo_entries for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Public API (anon + authenticated): published data only
-- ---------------------------------------------------------------------------
create or replace function api.cms_public_site()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('version', v.id, 'publishedAt', v.published_at, 'config', v.config)
    from cms.theme_versions v where v.status = 'PUBLISHED';
$$;

create or replace function api.cms_public_faqs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'topic', f.topic, 'question', f.question, 'answer', f.answer)
                            order by array_position(array['general', 'poolx', 'auction'], f.topic), f.sort, f.created_at), '[]'::jsonb)
    from cms.faqs f where f.status = 'PUBLISHED';
$$;

create or replace function api.cms_public_documents(p_kind text, p_limit integer, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with docs as (
    select d.slug, r.title, r.summary, d.first_published_at, d.published_at
      from cms.documents d
      join cms.document_revisions r on r.document_id = d.id and r.revision = d.published_revision
     where d.kind = p_kind and d.status = 'PUBLISHED')
  select jsonb_build_object(
    'total', (select count(*) from docs),
    'items', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'title', x.title, 'summary', x.summary,
                                                           'firstPublishedAt', x.first_published_at, 'publishedAt', x.published_at)
                                        order by x.first_published_at desc)
                         from (select * from docs order by first_published_at desc
                               limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x),
                      '[]'::jsonb));
$$;

create or replace function api.cms_public_document(p_kind text, p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('slug', d.slug, 'title', r.title, 'summary', r.summary, 'body', r.body,
                            'seoTitle', r.seo_title, 'seoDescription', r.seo_description,
                            'firstPublishedAt', d.first_published_at, 'publishedAt', d.published_at)
    from cms.documents d
    join cms.document_revisions r on r.document_id = d.id and r.revision = d.published_revision
   where d.kind = p_kind and d.slug = p_slug and d.status = 'PUBLISHED';
$$;

create or replace function api.cms_public_seo()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.route_key, jsonb_build_object('title', s.title, 'description', s.description)), '{}'::jsonb)
    from cms.seo_entries s;
$$;

-- ---------------------------------------------------------------------------
-- Theme manager (cms.theme.edit: drafts; cms.theme.publish: publish / rollback)
-- ---------------------------------------------------------------------------
create or replace function cms.require_theme_access()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user();
begin
  if not (core.has_permission('cms.theme.edit') or core.has_permission('cms.theme.publish')) then
    raise exception 'FORBIDDEN: missing permission cms.theme.edit' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function cms.require_theme_access() from public;

create or replace function cms.theme_row_json(v cms.theme_versions, p_with_config boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', v.id, 'status', v.status, 'label', v.label, 'basedOn', v.based_on,
    'createdAt', v.created_at, 'createdBy', (select email from core.profiles where id = v.created_by),
    'updatedAt', v.updated_at, 'updatedBy', (select email from core.profiles where id = v.updated_by),
    'publishedAt', v.published_at, 'publishedBy', (select email from core.profiles where id = v.published_by),
    'publishNote', v.publish_note, 'archivedAt', v.archived_at)
    || case when p_with_config then jsonb_build_object('config', v.config) else '{}'::jsonb end;
$$;
revoke all on function cms.theme_row_json(cms.theme_versions, boolean) from public;

create or replace function api.cms_theme_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform cms.require_theme_access();
  return jsonb_build_object(
    'canPublish', core.has_permission('cms.theme.publish'),
    'canEdit', core.has_permission('cms.theme.edit'),
    'published', (select cms.theme_row_json(v, true) from cms.theme_versions v where v.status = 'PUBLISHED'),
    'draft', (select cms.theme_row_json(v, true) from cms.theme_versions v where v.status = 'DRAFT'),
    'versions', coalesce((select jsonb_agg(cms.theme_row_json(v, false) order by v.id desc) from cms.theme_versions v), '[]'::jsonb));
end;
$$;

/** Creates the working draft or updates it. Returns the draft id. */
create or replace function api.cms_theme_save_draft(p_config jsonb, p_label text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.theme.edit'); v_problem text := cms.theme_config_problem(p_config);
        v_id bigint; v_before jsonb;
begin
  if v_problem is not null then
    raise exception 'INVALID_THEME: %', v_problem using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_label)), 0) not between 3 and 80 or p_label ~ '[[:cntrl:]<>]' then
    raise exception 'INVALID_REQUEST: version name must be 3–80 plain characters' using errcode = 'P0001';
  end if;
  select id, config into v_id, v_before from cms.theme_versions where status = 'DRAFT' for update;
  if v_id is null then
    insert into cms.theme_versions (status, label, config, based_on, created_by, updated_by)
    values ('DRAFT', btrim(p_label), p_config, (select id from cms.theme_versions where status = 'PUBLISHED'), v_uid, v_uid)
    returning id into v_id;
    perform core.write_audit('cms.theme.draft_created', 'cms', 'theme_versions', v_id::text, null, p_config, null);
  else
    update cms.theme_versions set config = p_config, label = btrim(p_label), updated_by = v_uid, updated_at = now() where id = v_id;
    perform core.write_audit('cms.theme.draft_saved', 'cms', 'theme_versions', v_id::text, v_before, p_config, null);
  end if;
  return v_id;
end;
$$;

create or replace function api.cms_theme_discard_draft(p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.theme.edit'); v_id bigint;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  update cms.theme_versions set status = 'ARCHIVED', archived_at = now(), updated_by = v_uid, updated_at = now()
   where status = 'DRAFT' returning id into v_id;
  if v_id is null then
    raise exception 'NOT_FOUND: there is no draft' using errcode = 'P0001';
  end if;
  perform core.write_audit('cms.theme.draft_discarded', 'cms', 'theme_versions', v_id::text, null, null, btrim(p_reason));
end;
$$;

create or replace function api.cms_theme_publish(p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.theme.publish'); v_draft cms.theme_versions; v_prev bigint;
begin
  if coalesce(char_length(btrim(p_note)), 0) < 10 then
    raise exception 'REASON_REQUIRED: describe the change (at least 10 characters)' using errcode = 'P0001';
  end if;
  select * into v_draft from cms.theme_versions where status = 'DRAFT' for update;
  if v_draft.id is null then
    raise exception 'NOT_FOUND: there is no draft to publish' using errcode = 'P0001';
  end if;
  update cms.theme_versions set status = 'ARCHIVED', archived_at = now() where status = 'PUBLISHED' returning id into v_prev;
  update cms.theme_versions
     set status = 'PUBLISHED', published_by = v_uid, published_at = now(), publish_note = btrim(p_note),
         updated_by = v_uid, updated_at = now()
   where id = v_draft.id;
  perform core.write_audit('cms.theme.published', 'cms', 'theme_versions', v_draft.id::text,
    jsonb_build_object('previousVersion', v_prev), jsonb_build_object('version', v_draft.id, 'config', v_draft.config), btrim(p_note));
  return v_draft.id;
end;
$$;

/** Re-publishes an earlier published design as a new version (history is kept; any working draft is untouched). */
create or replace function api.cms_theme_rollback(p_version bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.theme.publish'); v_src cms.theme_versions; v_prev bigint; v_id bigint;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  select * into v_src from cms.theme_versions where id = p_version;
  if v_src.id is null or v_src.published_at is null then
    raise exception 'NOT_FOUND: only previously published versions can be restored' using errcode = 'P0001';
  end if;
  if v_src.status = 'PUBLISHED' then
    raise exception 'INVALID_REQUEST: that version is already live' using errcode = 'P0001';
  end if;
  perform 1 from cms.theme_versions where status = 'PUBLISHED' for update;
  update cms.theme_versions set status = 'ARCHIVED', archived_at = now() where status = 'PUBLISHED' returning id into v_prev;
  insert into cms.theme_versions (status, label, config, based_on, created_by, updated_by, published_by, published_at, publish_note)
  values ('PUBLISHED', left('Restored version ' || v_src.id || ': ' || v_src.label, 80), v_src.config, v_src.id,
          v_uid, v_uid, v_uid, now(), btrim(p_reason))
  returning id into v_id;
  perform core.write_audit('cms.theme.rolled_back', 'cms', 'theme_versions', v_id::text,
    jsonb_build_object('previousVersion', v_prev), jsonb_build_object('restoredFrom', v_src.id), btrim(p_reason));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content (cms.content.manage): pages, posts, FAQs
-- ---------------------------------------------------------------------------
create or replace function cms.document_json(d cms.documents, p_with_revisions boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', d.id, 'kind', d.kind, 'slug', d.slug, 'status', d.status,
    'latestRevision', d.latest_revision, 'publishedRevision', d.published_revision,
    'firstPublishedAt', d.first_published_at, 'publishedAt', d.published_at,
    'updatedAt', d.updated_at, 'updatedBy', (select email from core.profiles where id = d.updated_by),
    'latest', (select jsonb_build_object('title', r.title, 'summary', r.summary, 'body', r.body, 'seoTitle', r.seo_title,
                                         'seoDescription', r.seo_description)
                 from cms.document_revisions r where r.document_id = d.id and r.revision = d.latest_revision))
  || case when p_with_revisions then jsonb_build_object('revisions', coalesce((
       select jsonb_agg(jsonb_build_object('revision', r.revision, 'title', r.title, 'note', r.note, 'createdAt', r.created_at,
                                           'createdBy', (select email from core.profiles where id = r.created_by))
                        order by r.revision desc)
         from cms.document_revisions r where r.document_id = d.id), '[]'::jsonb))
     else '{}'::jsonb end;
$$;
revoke all on function cms.document_json(cms.documents, boolean) from public;

create or replace function api.cms_admin_list_documents(p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return coalesce((select jsonb_agg(cms.document_json(d, false) order by d.updated_at desc)
                     from cms.documents d where d.kind = p_kind), '[]'::jsonb);
end;
$$;

create or replace function api.cms_admin_get_document(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return (select cms.document_json(d, true) from cms.documents d where d.id = p_id);
end;
$$;

/** Creates a document (p_id null) or adds a new revision. Published content changes only when published again. */
create or replace function api.cms_admin_save_document(
  p_id uuid, p_kind text, p_slug text, p_title text, p_summary text, p_body text,
  p_seo_title text, p_seo_description text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_doc cms.documents; v_rev int;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) not between 3 and 80 then
    raise exception 'INVALID_SLUG: use 3–80 lowercase letters, numbers and single hyphens' using errcode = 'P0001';
  end if;
  if p_id is null then
    if p_kind not in ('PAGE', 'POST') then
      raise exception 'INVALID_REQUEST: unknown content type' using errcode = 'P0001';
    end if;
    if exists (select 1 from cms.documents where kind = p_kind and slug = p_slug) then
      raise exception 'SLUG_TAKEN: that web address is already used' using errcode = 'P0001';
    end if;
    insert into cms.documents (kind, slug, created_by, updated_by) values (p_kind, p_slug, v_uid, v_uid) returning * into v_doc;
  else
    select * into v_doc from cms.documents where id = p_id for update;
    if v_doc.id is null then
      raise exception 'NOT_FOUND: content not found' using errcode = 'P0001';
    end if;
    if p_slug is distinct from v_doc.slug then
      if v_doc.first_published_at is not null then
        raise exception 'SLUG_LOCKED: the web address cannot change after first publication' using errcode = 'P0001';
      end if;
      if exists (select 1 from cms.documents where kind = v_doc.kind and slug = p_slug and id <> v_doc.id) then
        raise exception 'SLUG_TAKEN: that web address is already used' using errcode = 'P0001';
      end if;
      update cms.documents set slug = p_slug where id = v_doc.id;
    end if;
  end if;
  v_rev := v_doc.latest_revision + 1;
  insert into cms.document_revisions (document_id, revision, title, summary, body, seo_title, seo_description, note, created_by)
  values (v_doc.id, v_rev, btrim(p_title), coalesce(btrim(p_summary), ''), p_body, nullif(btrim(p_seo_title), ''),
          nullif(btrim(p_seo_description), ''), nullif(btrim(p_note), ''), v_uid);
  update cms.documents set latest_revision = v_rev, updated_by = v_uid, updated_at = now() where id = v_doc.id;
  perform core.write_audit('cms.' || lower(v_doc.kind) || '.saved', 'cms', 'documents', v_doc.id::text, null,
    jsonb_build_object('revision', v_rev, 'slug', p_slug, 'title', btrim(p_title)), nullif(btrim(p_note), ''));
  return v_doc.id;
end;
$$;

/** p_action: PUBLISH (latest revision), UNPUBLISH, RESTORE (copy p_revision as a new latest revision). */
create or replace function api.cms_admin_document_action(p_id uuid, p_action text, p_revision integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_doc cms.documents; v_src cms.document_revisions;
begin
  select * into v_doc from cms.documents where id = p_id for update;
  if v_doc.id is null then
    raise exception 'NOT_FOUND: content not found' using errcode = 'P0001';
  end if;
  if p_action = 'PUBLISH' then
    if v_doc.latest_revision = 0 then
      raise exception 'INVALID_REQUEST: nothing to publish' using errcode = 'P0001';
    end if;
    update cms.documents set status = 'PUBLISHED', published_revision = v_doc.latest_revision, published_at = now(),
           first_published_at = coalesce(first_published_at, now()), updated_by = v_uid, updated_at = now()
     where id = p_id;
  elsif p_action = 'UNPUBLISH' then
    if v_doc.status <> 'PUBLISHED' then
      raise exception 'INVALID_REQUEST: it is not published' using errcode = 'P0001';
    end if;
    if coalesce(char_length(btrim(p_reason)), 0) < 10 then
      raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
    end if;
    update cms.documents set status = 'ARCHIVED', published_revision = null, updated_by = v_uid, updated_at = now() where id = p_id;
  elsif p_action = 'RESTORE' then
    select * into v_src from cms.document_revisions where document_id = p_id and revision = p_revision;
    if v_src.id is null then
      raise exception 'NOT_FOUND: revision not found' using errcode = 'P0001';
    end if;
    insert into cms.document_revisions (document_id, revision, title, summary, body, seo_title, seo_description, note, created_by)
    values (p_id, v_doc.latest_revision + 1, v_src.title, v_src.summary, v_src.body, v_src.seo_title, v_src.seo_description,
            'Restored from revision ' || p_revision, v_uid);
    update cms.documents set latest_revision = v_doc.latest_revision + 1, updated_by = v_uid, updated_at = now() where id = p_id;
  else
    raise exception 'INVALID_REQUEST: unknown action' using errcode = 'P0001';
  end if;
  perform core.write_audit('cms.' || lower(v_doc.kind) || '.' || lower(p_action), 'cms', 'documents', p_id::text,
    jsonb_build_object('status', v_doc.status, 'publishedRevision', v_doc.published_revision),
    jsonb_build_object('revision', coalesce(p_revision, v_doc.latest_revision)), nullif(btrim(p_reason), ''));
end;
$$;

create or replace function api.cms_admin_list_faqs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'topic', f.topic, 'question', f.question, 'answer', f.answer,
                                                       'sort', f.sort, 'status', f.status, 'updatedAt', f.updated_at)
                                    order by array_position(array['general', 'poolx', 'auction'], f.topic), f.sort, f.created_at)
                     from cms.faqs f), '[]'::jsonb);
end;
$$;

/** Creates (p_id null) or updates a FAQ. The audit row keeps the previous values so any change can be reversed. */
create or replace function api.cms_admin_save_faq(p_id uuid, p_topic text, p_question text, p_answer text, p_sort integer, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_before jsonb; v_id uuid := p_id;
begin
  if v_id is null then
    insert into cms.faqs (topic, question, answer, sort, status, created_by, updated_by)
    values (p_topic, btrim(p_question), btrim(p_answer), coalesce(p_sort, 100), coalesce(p_status, 'HIDDEN'), v_uid, v_uid)
    returning id into v_id;
  else
    select to_jsonb(f) - 'created_by' - 'updated_by' into v_before from cms.faqs f where f.id = v_id for update;
    if v_before is null then
      raise exception 'NOT_FOUND: FAQ not found' using errcode = 'P0001';
    end if;
    update cms.faqs set topic = p_topic, question = btrim(p_question), answer = btrim(p_answer), sort = coalesce(p_sort, 100),
           status = coalesce(p_status, status), updated_by = v_uid, updated_at = now()
     where id = v_id;
  end if;
  perform core.write_audit('cms.faq.saved', 'cms', 'faqs', v_id::text, v_before,
    (select to_jsonb(f) - 'created_by' - 'updated_by' from cms.faqs f where f.id = v_id), null);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- SEO (seo.manage)
-- ---------------------------------------------------------------------------
create or replace function api.cms_admin_list_seo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('seo.manage');
  return coalesce((select jsonb_object_agg(s.route_key, jsonb_build_object('title', s.title, 'description', s.description,
                    'updatedAt', s.updated_at, 'updatedBy', (select email from core.profiles where id = s.updated_by)))
                     from cms.seo_entries s), '{}'::jsonb);
end;
$$;

create or replace function api.cms_admin_save_seo(p_route text, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('seo.manage'); v_before jsonb;
begin
  select jsonb_build_object('title', title, 'description', description) into v_before from cms.seo_entries where route_key = p_route;
  insert into cms.seo_entries (route_key, title, description, updated_by)
  values (p_route, nullif(btrim(p_title), ''), nullif(btrim(p_description), ''), v_uid)
  on conflict (route_key) do update
    set title = excluded.title, description = excluded.description, updated_by = v_uid, updated_at = now();
  perform core.write_audit('cms.seo.saved', 'cms', 'seo_entries', p_route, v_before,
    jsonb_build_object('title', nullif(btrim(p_title), ''), 'description', nullif(btrim(p_description), '')), null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['cms.has_exact_keys(jsonb, text[])', 'cms.is_plain_text(jsonb, integer, integer)',
    'cms.is_internal_href(text)', 'cms.is_hex(jsonb)', 'cms.contrast(text, text)',
    'cms.link_list_problem(jsonb, integer, integer, text)', 'cms.theme_config_problem(jsonb)', 'cms.guard_theme_version()']
  loop
    execute format('revoke all on function %s from public, anon', f);
  end loop;
  -- Validators are pure; signed-in staff need them for the CHECK constraint evaluated inside API functions only.
  foreach f in array array['api.cms_public_site()', 'api.cms_public_faqs()', 'api.cms_public_documents(text, integer, integer)',
    'api.cms_public_document(text, text)', 'api.cms_public_seo()']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
  foreach f in array array['api.cms_theme_overview()', 'api.cms_theme_save_draft(jsonb, text)', 'api.cms_theme_discard_draft(text)',
    'api.cms_theme_publish(text)', 'api.cms_theme_rollback(bigint, text)', 'api.cms_admin_list_documents(text)',
    'api.cms_admin_get_document(uuid)',
    'api.cms_admin_save_document(uuid, text, text, text, text, text, text, text, text)',
    'api.cms_admin_document_action(uuid, text, integer, text)', 'api.cms_admin_list_faqs()',
    'api.cms_admin_save_faq(uuid, text, text, text, integer, text)', 'api.cms_admin_list_seo()',
    'api.cms_admin_save_seo(text, text, text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
