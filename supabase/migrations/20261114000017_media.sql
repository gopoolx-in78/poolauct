-- 0017 — Media pipeline (Phase 10, TD-74): listing images for auctions and pools.
--
-- Flow: a staff member uploads an image to the app server (POST /api/media); the server checks the file's magic bytes,
-- re-encodes it with sharp to WebP (metadata stripped, two sizes), writes both files to the public `public-media`
-- bucket with the service role under `<media id>/display.webp` and `<media id>/thumb.webp`, then registers it here with
-- the staff member's own session. Clients can never write to Storage (no storage.objects policies for this bucket) and
-- never choose a path: paths are derived from the media id.
--
-- Images can be added, re-ordered, re-captioned or removed only while the listing is a DRAFT, like the listing itself,
-- so bidders and members always see the photos that were published. Alt text is required (WCAG 1.1.1).

-- ---------------------------------------------------------------------------
-- Storage bucket (public read through the CDN URL; writes only by the service role)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-media', 'public-media', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Media assets (shared, owned by core)
-- ---------------------------------------------------------------------------
create table core.media_assets (
  id uuid primary key,
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  thumb_width integer not null check (thumb_width between 1 and 1000),
  thumb_height integer not null check (thumb_height between 1 and 1000),
  bytes integer not null check (bytes between 1 and 2097152),
  alt_text text not null check (char_length(btrim(alt_text)) between 3 and 200),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REMOVED')),
  uploaded_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references core.profiles (id),
  constraint media_assets_removed_consistent check ((status = 'REMOVED') = (removed_at is not null))
);
create trigger media_assets_no_delete before delete on core.media_assets for each row execute function core.forbid_delete();

create table auction.asset_media (
  media_id uuid primary key references core.media_assets (id),
  asset_id uuid not null references auction.assets (id),
  position integer not null check (position between 0 and 999),
  created_at timestamptz not null default now()
);
create index asset_media_asset_idx on auction.asset_media (asset_id, position);

create table poolx.pool_media (
  media_id uuid primary key references core.media_assets (id),
  pool_id uuid not null references poolx.pools (id),
  position integer not null check (position between 0 and 999),
  created_at timestamptz not null default now()
);
create index pool_media_pool_idx on poolx.pool_media (pool_id, position);

-- Reads and writes go through the api functions below; direct table access is denied to every client role.
alter table core.media_assets enable row level security;
alter table auction.asset_media enable row level security;
alter table poolx.pool_media enable row level security;

create policy media_assets_select on core.media_assets for select to authenticated using (false);
create policy media_assets_insert on core.media_assets for insert to authenticated with check (false);
create policy media_assets_update on core.media_assets for update to authenticated using (false);
create policy media_assets_delete on core.media_assets for delete to authenticated using (false);

create policy asset_media_select on auction.asset_media for select to authenticated using (false);
create policy asset_media_insert on auction.asset_media for insert to authenticated with check (false);
create policy asset_media_update on auction.asset_media for update to authenticated using (false);
create policy asset_media_delete on auction.asset_media for delete to authenticated using (false);

create policy pool_media_select on poolx.pool_media for select to authenticated using (false);
create policy pool_media_insert on poolx.pool_media for insert to authenticated with check (false);
create policy pool_media_update on poolx.pool_media for update to authenticated using (false);
create policy pool_media_delete on poolx.pool_media for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function core.media_json(m core.media_assets)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'alt', m.alt_text,
    'display', jsonb_build_object('path', m.id::text || '/display.webp', 'width', m.width, 'height', m.height),
    'thumb', jsonb_build_object('path', m.id::text || '/thumb.webp', 'width', m.thumb_width, 'height', m.thumb_height));
$$;

create or replace function core.media_clean_alt(p_alt text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text := btrim(regexp_replace(coalesce(p_alt, ''), '\s+', ' ', 'g'));
begin
  if char_length(v) < 3 or char_length(v) > 200 then
    raise exception 'INVALID_ALT: describe the image in 3 to 200 characters' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

/** Inserts a media row from the server's processing result (p: id, width, height, thumbWidth, thumbHeight, bytes, alt). */
create or replace function core.media_insert(p jsonb, p_uid uuid)
returns core.media_assets
language plpgsql
security definer
set search_path = ''
as $$
declare m core.media_assets;
begin
  if p is null or jsonb_typeof(p) <> 'object' or (p ->> 'id') is null then
    raise exception 'INVALID_MEDIA: media details are missing' using errcode = 'P0001';
  end if;
  insert into core.media_assets (id, width, height, thumb_width, thumb_height, bytes, alt_text, uploaded_by)
  values ((p ->> 'id')::uuid, (p ->> 'width')::int, (p ->> 'height')::int, (p ->> 'thumbWidth')::int,
          (p ->> 'thumbHeight')::int, (p ->> 'bytes')::int, core.media_clean_alt(p ->> 'alt'), p_uid)
  returning * into m;
  return m;
exception
  when unique_violation then
    raise exception 'INVALID_MEDIA: this image is already registered' using errcode = 'P0001';
  when check_violation or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_MEDIA: image details are out of range' using errcode = 'P0001';
end;
$$;

create or replace function core.media_mark_removed(p_media uuid, p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update core.media_assets set status = 'REMOVED', removed_at = now(), removed_by = p_uid
  where id = p_media and status = 'ACTIVE';
$$;

revoke all on function core.media_json(core.media_assets) from public, anon, authenticated;
revoke all on function core.media_clean_alt(text) from public, anon, authenticated;
revoke all on function core.media_insert(jsonb, uuid) from public, anon, authenticated;
revoke all on function core.media_mark_removed(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auction listing images
-- ---------------------------------------------------------------------------
create or replace function auction.media_draft_asset(p_auction uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a auction.auctions;
begin
  select * into a from auction.auctions where id = p_auction for update;
  if a.id is null then
    raise exception 'AUCTION_NOT_FOUND: auction not found' using errcode = 'P0001';
  end if;
  if a.status <> 'DRAFT' then
    raise exception 'NOT_EDITABLE: photos can only change while the auction is a draft' using errcode = 'P0001';
  end if;
  return a.asset_id;
end;
$$;

create or replace function api.auction_admin_media_add(p_auction uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.listings.manage'); v_asset uuid; v_pos int; m core.media_assets;
begin
  v_asset := auction.media_draft_asset(p_auction);
  if (select count(*) from auction.asset_media where asset_id = v_asset) >= 12 then
    raise exception 'TOO_MANY_IMAGES: a listing can have at most 12 photos' using errcode = 'P0001';
  end if;
  select coalesce(max(position) + 1, 0) into v_pos from auction.asset_media where asset_id = v_asset;
  m := core.media_insert(p, v_uid);
  insert into auction.asset_media (media_id, asset_id, position) values (m.id, v_asset, v_pos);
  perform core.write_audit('auction.media.add', 'auction', 'auctions', p_auction::text, null,
    jsonb_build_object('mediaId', m.id, 'position', v_pos));
  return core.media_json(m);
end;
$$;

create or replace function api.auction_admin_media_update(p_media uuid, p_alt text, p_move text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.listings.manage'); l auction.asset_media; o auction.asset_media;
        v_auction uuid;
begin
  select * into l from auction.asset_media where media_id = p_media;
  if l.media_id is null then
    raise exception 'MEDIA_NOT_FOUND: photo not found' using errcode = 'P0001';
  end if;
  select id into v_auction from auction.auctions where asset_id = l.asset_id;
  perform auction.media_draft_asset(v_auction);
  if p_alt is not null then
    update core.media_assets set alt_text = core.media_clean_alt(p_alt) where id = p_media;
  end if;
  if p_move in ('up', 'down') then
    select * into o from auction.asset_media
    where asset_id = l.asset_id
      and case when p_move = 'up' then position < l.position else position > l.position end
    order by case when p_move = 'up' then -position else position end
    limit 1;
    if o.media_id is not null then
      update auction.asset_media set position = o.position where media_id = l.media_id;
      update auction.asset_media set position = l.position where media_id = o.media_id;
    end if;
  elsif p_move is not null then
    raise exception 'INVALID_MOVE: move must be up or down' using errcode = 'P0001';
  end if;
  perform core.write_audit('auction.media.update', 'auction', 'auctions', v_auction::text, null,
    jsonb_build_object('mediaId', p_media, 'altChanged', p_alt is not null, 'move', p_move));
end;
$$;

/** Unlinks a photo and marks it REMOVED; the server then deletes the two files from Storage. */
create or replace function api.auction_admin_media_remove(p_media uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.listings.manage'); l auction.asset_media; v_auction uuid;
begin
  select * into l from auction.asset_media where media_id = p_media;
  if l.media_id is null then
    raise exception 'MEDIA_NOT_FOUND: photo not found' using errcode = 'P0001';
  end if;
  select id into v_auction from auction.auctions where asset_id = l.asset_id;
  perform auction.media_draft_asset(v_auction);
  delete from auction.asset_media where media_id = p_media;
  perform core.media_mark_removed(p_media, v_uid);
  perform core.write_audit('auction.media.remove', 'auction', 'auctions', v_auction::text, null,
    jsonb_build_object('mediaId', p_media));
end;
$$;

create or replace function api.auction_admin_media_list(p_auction uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('auction.listings.manage');
  return (
    select coalesce(jsonb_agg(core.media_json(m) order by l.position), '[]'::jsonb)
    from auction.auctions a
    join auction.asset_media l on l.asset_id = a.asset_id
    join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
    where a.id = p_auction);
end;
$$;

-- Public: photos of any published (non-draft) auction, in order.
create or replace function api.auction_media(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(core.media_json(m) order by l.position), '[]'::jsonb)
  from auction.auctions a
  join auction.asset_media l on l.asset_id = a.asset_id
  join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
  where a.slug = p_slug and a.status <> 'DRAFT';
$$;

-- Public: first photo per auction for list cards ({slug: media}); at most 60 slugs per call.
create or replace function api.auction_media_covers(p_slugs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.slug, c.media), '{}'::jsonb)
  from (
    select distinct on (a.slug) a.slug, core.media_json(m) as media
    from auction.auctions a
    join auction.asset_media l on l.asset_id = a.asset_id
    join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
    where a.slug = any (p_slugs[1:60]) and a.status <> 'DRAFT'
    order by a.slug, l.position
  ) c;
$$;

-- ---------------------------------------------------------------------------
-- Pool images
-- ---------------------------------------------------------------------------
create or replace function poolx.media_draft_pool(p_pool uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare p poolx.pools;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null then
    raise exception 'POOL_NOT_FOUND: pool not found' using errcode = 'P0001';
  end if;
  if p.status <> 'DRAFT' then
    raise exception 'NOT_EDITABLE: photos can only change while the pool is a draft' using errcode = 'P0001';
  end if;
  return p.id;
end;
$$;

create or replace function api.poolx_admin_media_add(p_pool uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); v_pos int; m core.media_assets;
begin
  perform poolx.media_draft_pool(p_pool);
  if (select count(*) from poolx.pool_media where pool_id = p_pool) >= 12 then
    raise exception 'TOO_MANY_IMAGES: a pool can have at most 12 photos' using errcode = 'P0001';
  end if;
  select coalesce(max(position) + 1, 0) into v_pos from poolx.pool_media where pool_id = p_pool;
  m := core.media_insert(p, v_uid);
  insert into poolx.pool_media (media_id, pool_id, position) values (m.id, p_pool, v_pos);
  perform core.write_audit('poolx.media.add', 'poolx', 'pools', p_pool::text, null,
    jsonb_build_object('mediaId', m.id, 'position', v_pos));
  return core.media_json(m);
end;
$$;

create or replace function api.poolx_admin_media_update(p_media uuid, p_alt text, p_move text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); l poolx.pool_media; o poolx.pool_media;
begin
  select * into l from poolx.pool_media where media_id = p_media;
  if l.media_id is null then
    raise exception 'MEDIA_NOT_FOUND: photo not found' using errcode = 'P0001';
  end if;
  perform poolx.media_draft_pool(l.pool_id);
  if p_alt is not null then
    update core.media_assets set alt_text = core.media_clean_alt(p_alt) where id = p_media;
  end if;
  if p_move in ('up', 'down') then
    select * into o from poolx.pool_media
    where pool_id = l.pool_id
      and case when p_move = 'up' then position < l.position else position > l.position end
    order by case when p_move = 'up' then -position else position end
    limit 1;
    if o.media_id is not null then
      update poolx.pool_media set position = o.position where media_id = l.media_id;
      update poolx.pool_media set position = l.position where media_id = o.media_id;
    end if;
  elsif p_move is not null then
    raise exception 'INVALID_MOVE: move must be up or down' using errcode = 'P0001';
  end if;
  perform core.write_audit('poolx.media.update', 'poolx', 'pools', l.pool_id::text, null,
    jsonb_build_object('mediaId', p_media, 'altChanged', p_alt is not null, 'move', p_move));
end;
$$;

create or replace function api.poolx_admin_media_remove(p_media uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); l poolx.pool_media;
begin
  select * into l from poolx.pool_media where media_id = p_media;
  if l.media_id is null then
    raise exception 'MEDIA_NOT_FOUND: photo not found' using errcode = 'P0001';
  end if;
  perform poolx.media_draft_pool(l.pool_id);
  delete from poolx.pool_media where media_id = p_media;
  perform core.media_mark_removed(p_media, v_uid);
  perform core.write_audit('poolx.media.remove', 'poolx', 'pools', l.pool_id::text, null,
    jsonb_build_object('mediaId', p_media));
end;
$$;

create or replace function api.poolx_admin_media_list(p_pool uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('poolx.pools.manage');
  return (
    select coalesce(jsonb_agg(core.media_json(m) order by l.position), '[]'::jsonb)
    from poolx.pool_media l
    join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
    where l.pool_id = p_pool);
end;
$$;

-- Public: photos of a pool that is publicly visible (same rule as api.poolx_get_pool).
create or replace function api.poolx_pool_media(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(core.media_json(m) order by l.position), '[]'::jsonb)
  from poolx.pools p
  join poolx.pool_media l on l.pool_id = p.id
  join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
  where p.slug = p_slug and p.kind = 'PUBLIC'
    and p.status in ('ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED', 'CANCELLED', 'EXPIRED');
$$;

create or replace function api.poolx_media_covers(p_slugs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.slug, c.media), '{}'::jsonb)
  from (
    select distinct on (p.slug) p.slug, core.media_json(m) as media
    from poolx.pools p
    join poolx.pool_media l on l.pool_id = p.id
    join core.media_assets m on m.id = l.media_id and m.status = 'ACTIVE'
    where p.slug = any (p_slugs[1:60]) and p.kind = 'PUBLIC'
      and p.status in ('ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED', 'CANCELLED', 'EXPIRED')
    order by p.slug, l.position
  ) c;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on function auction.media_draft_asset(uuid) from public, anon, authenticated;
revoke all on function poolx.media_draft_pool(uuid) from public, anon, authenticated;

revoke all on function api.auction_admin_media_add(uuid, jsonb) from public, anon;
revoke all on function api.auction_admin_media_update(uuid, text, text) from public, anon;
revoke all on function api.auction_admin_media_remove(uuid) from public, anon;
revoke all on function api.auction_admin_media_list(uuid) from public, anon;
revoke all on function api.poolx_admin_media_add(uuid, jsonb) from public, anon;
revoke all on function api.poolx_admin_media_update(uuid, text, text) from public, anon;
revoke all on function api.poolx_admin_media_remove(uuid) from public, anon;
revoke all on function api.poolx_admin_media_list(uuid) from public, anon;
grant execute on function api.auction_admin_media_add(uuid, jsonb) to authenticated;
grant execute on function api.auction_admin_media_update(uuid, text, text) to authenticated;
grant execute on function api.auction_admin_media_remove(uuid) to authenticated;
grant execute on function api.auction_admin_media_list(uuid) to authenticated;
grant execute on function api.poolx_admin_media_add(uuid, jsonb) to authenticated;
grant execute on function api.poolx_admin_media_update(uuid, text, text) to authenticated;
grant execute on function api.poolx_admin_media_remove(uuid) to authenticated;
grant execute on function api.poolx_admin_media_list(uuid) to authenticated;

revoke all on function api.auction_media(text) from public;
revoke all on function api.auction_media_covers(text[]) from public;
revoke all on function api.poolx_pool_media(text) from public;
revoke all on function api.poolx_media_covers(text[]) from public;
grant execute on function api.auction_media(text) to anon, authenticated;
grant execute on function api.auction_media_covers(text[]) to anon, authenticated;
grant execute on function api.poolx_pool_media(text) to anon, authenticated;
grant execute on function api.poolx_media_covers(text[]) to anon, authenticated;
