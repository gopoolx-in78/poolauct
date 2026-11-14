-- 0018 — Cover images for CMS pages and blog posts (7.8, TD-75), on the media pipeline of 0017 (TD-74).
-- One cover per document. Unlike listing photos, a cover can change at any time (posts are edited after publishing
-- through new revisions too); every change is audited. The public document functions now include the cover.

create table cms.document_covers (
  document_id uuid primary key references cms.documents (id),
  media_id uuid not null unique references core.media_assets (id),
  created_at timestamptz not null default now()
);

alter table cms.document_covers enable row level security;
create policy document_covers_select on cms.document_covers for select to authenticated using (false);
create policy document_covers_insert on cms.document_covers for insert to authenticated with check (false);
create policy document_covers_update on cms.document_covers for update to authenticated using (false);
create policy document_covers_delete on cms.document_covers for delete to authenticated using (false);

/** Sets or replaces a document's cover. Returns { media, replacedId } so the server can delete the old files. */
create or replace function api.cms_admin_cover_set(p_document uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_old uuid; m core.media_assets;
begin
  perform 1 from cms.documents where id = p_document for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND: page or post not found' using errcode = 'P0001';
  end if;
  select media_id into v_old from cms.document_covers where document_id = p_document;
  m := core.media_insert(p, v_uid);
  if v_old is not null then
    update cms.document_covers set media_id = m.id, created_at = now() where document_id = p_document;
    perform core.media_mark_removed(v_old, v_uid);
  else
    insert into cms.document_covers (document_id, media_id) values (p_document, m.id);
  end if;
  perform core.write_audit('cms.cover.set', 'cms', 'documents', p_document::text,
    case when v_old is null then null else jsonb_build_object('mediaId', v_old) end, jsonb_build_object('mediaId', m.id));
  return jsonb_build_object('media', core.media_json(m), 'replacedId', v_old);
end;
$$;

/** Removes a document's cover; returns the removed media id (null when there was none). */
create or replace function api.cms_admin_cover_remove(p_document uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_old uuid;
begin
  delete from cms.document_covers where document_id = p_document returning media_id into v_old;
  if v_old is not null then
    perform core.media_mark_removed(v_old, v_uid);
    perform core.write_audit('cms.cover.remove', 'cms', 'documents', p_document::text,
      jsonb_build_object('mediaId', v_old), null);
  end if;
  return v_old;
end;
$$;

create or replace function api.cms_admin_cover_get(p_document uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return (select core.media_json(m) from cms.document_covers c join core.media_assets m on m.id = c.media_id
          where c.document_id = p_document);
end;
$$;

create or replace function cms.cover_json(p_document uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select core.media_json(m) from cms.document_covers c join core.media_assets m on m.id = c.media_id and m.status = 'ACTIVE'
  where c.document_id = p_document;
$$;

-- Public document functions: same results as 0013 plus `cover` (null when there is none).
create or replace function api.cms_public_documents(p_kind text, p_limit integer, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with docs as (
    select d.id, d.slug, r.title, r.summary, d.first_published_at, d.published_at
      from cms.documents d
      join cms.document_revisions r on r.document_id = d.id and r.revision = d.published_revision
     where d.kind = p_kind and d.status = 'PUBLISHED')
  select jsonb_build_object(
    'total', (select count(*) from docs),
    'items', coalesce((select jsonb_agg(jsonb_build_object('slug', x.slug, 'title', x.title, 'summary', x.summary,
                                                           'firstPublishedAt', x.first_published_at, 'publishedAt', x.published_at,
                                                           'cover', cms.cover_json(x.id))
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
                            'firstPublishedAt', d.first_published_at, 'publishedAt', d.published_at,
                            'cover', cms.cover_json(d.id))
    from cms.documents d
    join cms.document_revisions r on r.document_id = d.id and r.revision = d.published_revision
   where d.kind = p_kind and d.slug = p_slug and d.status = 'PUBLISHED';
$$;

revoke all on function cms.cover_json(uuid) from public, anon, authenticated;
revoke all on function api.cms_admin_cover_set(uuid, jsonb) from public, anon;
revoke all on function api.cms_admin_cover_remove(uuid) from public, anon;
revoke all on function api.cms_admin_cover_get(uuid) from public, anon;
grant execute on function api.cms_admin_cover_set(uuid, jsonb) to authenticated;
grant execute on function api.cms_admin_cover_remove(uuid) to authenticated;
grant execute on function api.cms_admin_cover_get(uuid) to authenticated;
