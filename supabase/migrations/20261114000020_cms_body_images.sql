-- 0020 — Images inside CMS page / post bodies (7.8b, TD-77), on the media pipeline of 0017 (TD-74).
-- Authors upload an image to a document and place it in the Markdown body as ![alt](media:<id>). The renderer shows only
-- ACTIVE images registered to that same document, with their stored size and alt text; any other image reference
-- (external URL, another document's image, a removed one) renders as nothing.

create table cms.document_images (
  media_id uuid primary key references core.media_assets (id),
  document_id uuid not null references cms.documents (id),
  created_at timestamptz not null default now()
);
create index document_images_document_idx on cms.document_images (document_id);

alter table cms.document_images enable row level security;
create policy document_images_select on cms.document_images for select to authenticated using (false);
create policy document_images_insert on cms.document_images for insert to authenticated with check (false);
create policy document_images_update on cms.document_images for update to authenticated using (false);
create policy document_images_delete on cms.document_images for delete to authenticated using (false);

/** ACTIVE images of a document as { id: media } (internal). */
create or replace function cms.images_json(p_document uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(m.id::text, core.media_json(m)), '{}'::jsonb)
    from cms.document_images i join core.media_assets m on m.id = i.media_id and m.status = 'ACTIVE'
   where i.document_id = p_document;
$$;

/** Registers an uploaded image for a document's body (max 30 active). Images can change at any time; audited. */
create or replace function api.cms_admin_image_add(p_document uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); m core.media_assets;
begin
  perform 1 from cms.documents where id = p_document for update;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND: page or post not found' using errcode = 'P0001';
  end if;
  if (select count(*) from cms.document_images i join core.media_assets a on a.id = i.media_id and a.status = 'ACTIVE'
       where i.document_id = p_document) >= 30 then
    raise exception 'TOO_MANY_IMAGES: a page or post can have at most 30 images' using errcode = 'P0001';
  end if;
  m := core.media_insert(p, v_uid);
  insert into cms.document_images (media_id, document_id) values (m.id, p_document);
  perform core.write_audit('cms.image.add', 'cms', 'documents', p_document::text, null, jsonb_build_object('mediaId', m.id));
  return core.media_json(m);
end;
$$;

/** Removes a body image (marked REMOVED; the server deletes the files). Returns the document id. */
create or replace function api.cms_admin_image_remove(p_media uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); v_doc uuid;
begin
  select i.document_id into v_doc from cms.document_images i join core.media_assets a on a.id = i.media_id
   where i.media_id = p_media and a.status = 'ACTIVE';
  if v_doc is null then
    raise exception 'NOT_FOUND: image not found' using errcode = 'P0001';
  end if;
  perform core.media_mark_removed(p_media, v_uid);
  perform core.write_audit('cms.image.remove', 'cms', 'documents', v_doc::text, jsonb_build_object('mediaId', p_media), null);
  return v_doc;
end;
$$;

create or replace function api.cms_admin_image_list(p_document uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return coalesce((select jsonb_agg(core.media_json(m) order by i.created_at)
                     from cms.document_images i join core.media_assets m on m.id = i.media_id and m.status = 'ACTIVE'
                    where i.document_id = p_document), '[]'::jsonb);
end;
$$;

-- Public document: same as 0018 plus `images` ({ id: media }, ACTIVE images of this document only).
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
                            'cover', cms.cover_json(d.id), 'images', cms.images_json(d.id))
    from cms.documents d
    join cms.document_revisions r on r.document_id = d.id and r.revision = d.published_revision
   where d.kind = p_kind and d.slug = p_slug and d.status = 'PUBLISHED';
$$;

revoke all on function cms.images_json(uuid) from public, anon, authenticated;
revoke all on function api.cms_admin_image_add(uuid, jsonb) from public, anon;
revoke all on function api.cms_admin_image_remove(uuid) from public, anon;
revoke all on function api.cms_admin_image_list(uuid) from public, anon;
grant execute on function api.cms_admin_image_add(uuid, jsonb) to authenticated;
grant execute on function api.cms_admin_image_remove(uuid) to authenticated;
grant execute on function api.cms_admin_image_list(uuid) to authenticated;
