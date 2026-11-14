-- 0019 — Featured pools / auctions on the homepage (7.7, R-B5, TD-76).
-- The CMS keeps only (module, slug, position): no foreign key into poolx or auction, so the modules stay independent.
-- Each module exposes a public "cards by slug" function that returns only listings that are open right now, so a featured
-- listing that ends, closes or is unpublished disappears from the homepage by itself.

create table cms.featured_listings (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module in ('poolx', 'auction')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 90),
  position integer not null check (position between 1 and 1000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (module, slug)
);

alter table cms.featured_listings enable row level security;
create policy featured_listings_select on cms.featured_listings for select to authenticated using (false);
create policy featured_listings_insert on cms.featured_listings for insert to authenticated with check (false);
create policy featured_listings_update on cms.featured_listings for update to authenticated using (false);
create policy featured_listings_delete on cms.featured_listings for delete to authenticated using (false);

create or replace function cms.featured_row_json(f cms.featured_listings)
returns jsonb
language sql
immutable
set search_path = ''
as $$ select jsonb_build_object('id', f.id, 'module', f.module, 'slug', f.slug, 'position', f.position); $$;

create or replace function api.cms_admin_featured_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('cms.content.manage');
  return coalesce((select jsonb_agg(cms.featured_row_json(f) order by f.module, f.position) from cms.featured_listings f),
                  '[]'::jsonb);
end;
$$;

/** Adds a listing at the end of its module's list (max 6 per module). The slug is checked by the server first. */
create or replace function api.cms_admin_featured_add(p_module text, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); f cms.featured_listings; v_slug text := lower(btrim(p_slug));
begin
  if p_module is null or p_module not in ('poolx', 'auction') then
    raise exception 'INVALID_MODULE: choose PoolX or Auctions' using errcode = 'P0001';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 90 then
    raise exception 'INVALID_SLUG: enter the listing''s web address name, e.g. used-honda-city-2019' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('cms.featured_listings'));
  if exists (select 1 from cms.featured_listings where module = p_module and slug = v_slug) then
    raise exception 'ALREADY_FEATURED: that listing is already featured' using errcode = 'P0001';
  end if;
  if (select count(*) from cms.featured_listings where module = p_module) >= 6 then
    raise exception 'TOO_MANY_FEATURED: feature up to 6 listings per marketplace' using errcode = 'P0001';
  end if;
  insert into cms.featured_listings (module, slug, position, created_by)
  values (p_module, v_slug, coalesce((select max(position) from cms.featured_listings where module = p_module), 0) + 1, v_uid)
  returning * into f;
  perform core.write_audit('cms.featured.add', 'cms', 'featured_listings', f.id::text, null, cms.featured_row_json(f));
  return cms.featured_row_json(f);
end;
$$;

create or replace function api.cms_admin_featured_move(p_id uuid, p_move text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); f cms.featured_listings; o cms.featured_listings;
begin
  if p_move is null or p_move not in ('up', 'down') then
    raise exception 'INVALID_MOVE: move up or down' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('cms.featured_listings'));
  select * into f from cms.featured_listings where id = p_id;
  if f.id is null then
    raise exception 'NOT_FOUND: featured listing not found' using errcode = 'P0001';
  end if;
  select * into o from cms.featured_listings
   where module = f.module and case when p_move = 'up' then position < f.position else position > f.position end
   order by case when p_move = 'up' then -position else position end limit 1;
  if o.id is null then
    return; -- already first / last
  end if;
  update cms.featured_listings set position = o.position where id = f.id;
  update cms.featured_listings set position = f.position where id = o.id;
  perform core.write_audit('cms.featured.move', 'cms', 'featured_listings', f.id::text,
    jsonb_build_object('position', f.position), jsonb_build_object('position', o.position));
end;
$$;

create or replace function api.cms_admin_featured_remove(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('cms.content.manage'); f cms.featured_listings;
begin
  delete from cms.featured_listings where id = p_id returning * into f;
  if f.id is null then
    raise exception 'NOT_FOUND: featured listing not found' using errcode = 'P0001';
  end if;
  perform core.write_audit('cms.featured.remove', 'cms', 'featured_listings', f.id::text, cms.featured_row_json(f), null);
end;
$$;

/** Public: featured slugs per module, in order. Whether each listing is open is decided by its own module. */
create or replace function api.cms_featured()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'poolx', coalesce((select jsonb_agg(slug order by position) from cms.featured_listings where module = 'poolx'), '[]'::jsonb),
    'auction', coalesce((select jsonb_agg(slug order by position) from cms.featured_listings where module = 'auction'), '[]'::jsonb));
$$;

-- Module "cards by slug": open listings only, in the order given (≤ 12 slugs).
create or replace function api.poolx_pools_by_slugs(p_slugs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(poolx.pool_json(p, false) order by s.ord), '[]'::jsonb)
    from unnest(p_slugs[1:12]) with ordinality as s(slug, ord)
    join poolx.pools p on p.slug = s.slug
   where p.kind = 'PUBLIC' and p.status = 'ACTIVE' and p.deadline_at > now();
$$;

create or replace function api.auction_by_slugs(p_slugs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(auction.auction_json(a, false) order by s.ord), '[]'::jsonb)
    from unnest(p_slugs[1:12]) with ordinality as s(slug, ord)
    join auction.auctions a on a.slug = s.slug
   where a.status <> 'DRAFT' and auction.effective_status(a) in ('LIVE', 'SCHEDULED');
$$;

revoke all on function cms.featured_row_json(cms.featured_listings) from public, anon, authenticated;
revoke all on function api.cms_admin_featured_list() from public, anon;
revoke all on function api.cms_admin_featured_add(text, text) from public, anon;
revoke all on function api.cms_admin_featured_move(uuid, text) from public, anon;
revoke all on function api.cms_admin_featured_remove(uuid) from public, anon;
grant execute on function api.cms_admin_featured_list() to authenticated;
grant execute on function api.cms_admin_featured_add(text, text) to authenticated;
grant execute on function api.cms_admin_featured_move(uuid, text) to authenticated;
grant execute on function api.cms_admin_featured_remove(uuid) to authenticated;

revoke all on function api.cms_featured() from public;
revoke all on function api.poolx_pools_by_slugs(text[]) from public;
revoke all on function api.auction_by_slugs(text[]) from public;
grant execute on function api.cms_featured() to anon, authenticated;
grant execute on function api.poolx_pools_by_slugs(text[]) to anon, authenticated;
grant execute on function api.auction_by_slugs(text[]) to anon, authenticated;
