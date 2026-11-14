-- Phase 8 — Notifications (master prompt §15).
--
-- One central service in `core`: an event catalogue, per-user preferences, in-app notifications and a delivery queue
-- per external channel. PoolX and Auction tables raise events through `core.notify` from AFTER triggers in their own
-- schemas; core never reads module tables, and the two modules never reference each other.
--
-- A notification failure must never block a business transaction: every module trigger catches its own errors and
-- records them in `core.notification_errors` (TD-60).

-- ---------------------------------------------------------------------------
-- Event catalogue
-- ---------------------------------------------------------------------------
create table core.notification_events (
  key text primary key check (key ~ '^(poolx|auction)\.[a-z_]+$'),
  domain text not null check (domain in ('poolx', 'auction')),
  label text not null check (char_length(label) between 3 and 80),
  description text not null check (char_length(description) between 10 and 200),
  audience text not null check (audience in ('PARTICIPANT', 'SUBSCRIBER')),
  essential boolean not null default false,          -- financial / contractual: in-app and email always on
  in_app_default boolean not null,
  email_default boolean not null,
  sort integer not null,
  constraint notification_events_domain_prefix check (key like domain || '.%'),
  constraint notification_events_essential_defaults check (not essential or (in_app_default and email_default)),
  constraint notification_events_subscriber_opt_in check (audience = 'PARTICIPANT' or not (in_app_default or email_default or essential))
);

insert into core.notification_events (key, domain, label, description, audience, essential, in_app_default, email_default, sort) values
  ('poolx.pool_created',           'poolx',   'New pools',                 'A new public pool opens for joining (announcement, opt-in).',                 'SUBSCRIBER',  false, false, false, 10),
  ('poolx.pool_approved',          'poolx',   'Pool request approved',     'A pool you requested has been approved.',                                     'PARTICIPANT', false, true,  true,  20),
  ('poolx.pool_joined',            'poolx',   'Pool joined',               'Your membership in a pool is active.',                                        'PARTICIPANT', false, true,  false, 30),
  ('poolx.contribution_confirmed', 'poolx',   'Contribution confirmed',    'Your payment for a pool has been confirmed.',                                 'PARTICIPANT', true,  true,  true,  40),
  ('poolx.discount_milestone',     'poolx',   'Discount milestone',        'A pool you joined reached a new discount level.',                             'PARTICIPANT', false, true,  false, 50),
  ('poolx.target_achieved',        'poolx',   'Pool target reached',       'A pool you joined reached its member target.',                                'PARTICIPANT', false, true,  true,  60),
  ('poolx.pool_completed',         'poolx',   'Pool completed',            'A pool you joined has been completed.',                                       'PARTICIPANT', false, true,  true,  70),
  ('poolx.order_dispatched',       'poolx',   'Order dispatched',          'Your pool order has been shipped.',                                           'PARTICIPANT', false, true,  true,  80),
  ('poolx.delivery_update',        'poolx',   'Delivery update',           'Your pool order has been delivered.',                                         'PARTICIPANT', false, true,  true,  90),
  ('poolx.refund_initiated',       'poolx',   'Refund started',            'A refund of your pool contribution has been started.',                        'PARTICIPANT', false, true,  true,  100),
  ('poolx.refund_completed',       'poolx',   'Refund completed',          'The payment provider confirmed your pool refund.',                            'PARTICIPANT', true,  true,  true,  110),
  ('auction.auction_approved',     'auction', 'Listing approved',          'Your auction listing has been approved and published.',                       'PARTICIPANT', false, true,  true,  10),
  ('auction.auction_published',    'auction', 'New auctions',              'A new auction has been published (announcement, opt-in).',                    'SUBSCRIBER',  false, false, false, 20),
  ('auction.auction_starting',     'auction', 'Auction starting soon',     'An auction you registered for starts within the hour.',                       'PARTICIPANT', false, true,  true,  30),
  ('auction.deposit_confirmed',    'auction', 'Deposit confirmed',         'Your refundable participation deposit has been confirmed.',                   'PARTICIPANT', true,  true,  true,  40),
  ('auction.bidding_activated',    'auction', 'Bidding activated',         'You can now bid in an auction you registered for.',                           'PARTICIPANT', false, true,  true,  50),
  ('auction.bid_accepted',         'auction', 'Bid accepted',              'Your bid was accepted as valid.',                                             'PARTICIPANT', false, true,  false, 60),
  ('auction.ending_soon',          'auction', 'Auction ending soon',       'An auction you are bidding in ends within 15 minutes.',                       'PARTICIPANT', false, true,  true,  70),
  ('auction.outbid',               'auction', 'Outbid',                    'Someone placed a higher bid than yours.',                                     'PARTICIPANT', false, true,  true,  80),
  ('auction.auction_closed',       'auction', 'Auction closed',            'An auction you registered for has closed without a win for you.',             'PARTICIPANT', false, true,  true,  90),
  ('auction.auction_won',          'auction', 'Auction won',               'You won an auction; your invoice is ready.',                                  'PARTICIPANT', true,  true,  true,  100),
  ('auction.auction_lost',         'auction', 'Auction lost',              'An auction you bid in was won by another bidder.',                            'PARTICIPANT', false, true,  true,  110),
  ('auction.refund_eligible',      'auction', 'Deposit refund due',        'Your deposit qualifies for a full refund.',                                   'PARTICIPANT', false, true,  false, 120),
  ('auction.refund_initiated',     'auction', 'Deposit refund started',    'The refund of your deposit has been started with the payment provider.',      'PARTICIPANT', false, true,  true,  130),
  ('auction.refund_completed',     'auction', 'Deposit refunded',          'The payment provider confirmed your deposit refund.',                         'PARTICIPANT', true,  true,  true,  140),
  ('auction.refund_failed',        'auction', 'Deposit refund delayed',    'A deposit refund attempt failed; it is retried automatically.',               'PARTICIPANT', true,  true,  true,  150),
  ('auction.deposit_adjusted',     'auction', 'Deposit credited',          'Your winning deposit was credited against your invoice.',                     'PARTICIPANT', true,  true,  true,  160),
  ('auction.payment_overdue',      'auction', 'Payment overdue',           'Your auction invoice is past its payment deadline.',                          'PARTICIPANT', true,  true,  true,  170);

create trigger notification_events_no_delete before delete on core.notification_events for each row execute function core.forbid_delete();

-- ---------------------------------------------------------------------------
-- Preferences (a row only when the user changed a default)
-- ---------------------------------------------------------------------------
create table core.notification_preferences (
  user_id uuid not null references core.profiles (id),
  event_key text not null references core.notification_events (key),
  in_app boolean not null,
  email boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
create index notification_preferences_event_idx on core.notification_preferences (event_key) where in_app or email;
create trigger notification_preferences_set_updated_at before update on core.notification_preferences
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications (one per user per event occurrence) and channel deliveries
-- ---------------------------------------------------------------------------
create table core.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.profiles (id),
  event_key text not null references core.notification_events (key),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 4000),
  link text check (link is null or (char_length(link) <= 200 and link ~ '^/[a-z0-9][a-z0-9/_-]*$')),
  dedupe_key text not null check (char_length(dedupe_key) between 3 and 200),
  in_app boolean not null,                           -- false: e-mail only (user turned the in-app copy off)
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)                       -- the same occurrence is never notified twice
);
create index notifications_inbox_idx on core.notifications (user_id, created_at desc) where in_app;
create index notifications_unread_idx on core.notifications (user_id) where in_app and read_at is null;

-- only read_at may change, and only once
create or replace function core.guard_notification_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.event_key <> old.event_key or new.data <> old.data
     or new.link is distinct from old.link or new.dedupe_key <> old.dedupe_key or new.in_app <> old.in_app
     or new.created_at <> old.created_at or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'IMMUTABLE: notifications can only be marked as read' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger notifications_guard_update before update on core.notifications
  for each row execute function core.guard_notification_update();
create trigger notifications_no_delete before delete on core.notifications for each row execute function core.forbid_delete();

create table core.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references core.notifications (id),
  channel text not null check (channel in ('EMAIL', 'SMS', 'WHATSAPP')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider text check (provider is null or provider ~ '^[a-z0-9_-]{2,30}$'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel),
  constraint deliveries_sent_consistent check ((status = 'SENT') = (sent_at is not null)),
  constraint deliveries_sending_claimed check (status <> 'SENDING' or claimed_at is not null)
);
create index notification_deliveries_due_idx on core.notification_deliveries (next_attempt_at) where status in ('QUEUED', 'SENDING');
create index notification_deliveries_status_idx on core.notification_deliveries (status, created_at desc);
create trigger notification_deliveries_set_updated_at before update on core.notification_deliveries
  for each row execute function core.set_updated_at();
create trigger notification_deliveries_no_delete before delete on core.notification_deliveries
  for each row execute function core.forbid_delete();

-- errors swallowed by module triggers (so ops can see them; TD-60)
create table core.notification_errors (
  id bigint generated always as identity primary key,
  source text not null check (char_length(source) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);
create trigger notification_errors_append_only before update or delete on core.notification_errors
  for each row execute function core.forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table core.notification_events enable row level security;
alter table core.notification_preferences enable row level security;
alter table core.notifications enable row level security;
alter table core.notification_deliveries enable row level security;
alter table core.notification_errors enable row level security;

grant select on core.notification_events, core.notification_preferences, core.notifications,
  core.notification_deliveries, core.notification_errors to authenticated;

create policy notification_events_select on core.notification_events for select to authenticated using (true);
create policy notification_events_insert on core.notification_events for insert to authenticated with check (false);
create policy notification_events_update on core.notification_events for update to authenticated using (false);
create policy notification_events_delete on core.notification_events for delete to authenticated using (false);

create policy notification_preferences_select_own on core.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_insert on core.notification_preferences for insert to authenticated with check (false);
create policy notification_preferences_update on core.notification_preferences for update to authenticated using (false);
create policy notification_preferences_delete on core.notification_preferences for delete to authenticated using (false);

create policy notifications_select_own on core.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_insert on core.notifications for insert to authenticated with check (false);
create policy notifications_update on core.notifications for update to authenticated using (false);
create policy notifications_delete on core.notifications for delete to authenticated using (false);

create policy notification_deliveries_select_staff on core.notification_deliveries for select to authenticated
  using (core.has_permission('support.tickets'));
create policy notification_deliveries_insert on core.notification_deliveries for insert to authenticated with check (false);
create policy notification_deliveries_update on core.notification_deliveries for update to authenticated using (false);
create policy notification_deliveries_delete on core.notification_deliveries for delete to authenticated using (false);

create policy notification_errors_select_staff on core.notification_errors for select to authenticated
  using (core.has_permission('support.tickets'));
create policy notification_errors_insert on core.notification_errors for insert to authenticated with check (false);
create policy notification_errors_update on core.notification_errors for update to authenticated using (false);
create policy notification_errors_delete on core.notification_errors for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Core service
-- ---------------------------------------------------------------------------

-- Raise one event for one user. Idempotent per (user, event, reference). Returns the notification id, or null when
-- nothing was created (already notified, user opted out, account deleted).
create or replace function core.notify(p_user uuid, p_event text, p_ref text, p_data jsonb, p_link text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e core.notification_events;
  v_status text;
  v_pref core.notification_preferences;
  v_in_app boolean;
  v_email boolean;
  v_id uuid;
begin
  select * into e from core.notification_events where key = p_event;
  if e.key is null then
    raise exception 'UNKNOWN_EVENT: %', p_event using errcode = 'P0001';
  end if;
  if p_user is null then
    return null;
  end if;
  select status into v_status from core.profiles where id = p_user;
  if v_status is null or v_status = 'DELETED' then
    return null;
  end if;
  select * into v_pref from core.notification_preferences where user_id = p_user and event_key = p_event;
  v_in_app := e.essential or coalesce(v_pref.in_app, e.in_app_default);
  v_email := e.essential or coalesce(v_pref.email, e.email_default);
  if not (v_in_app or v_email) then
    return null;
  end if;
  insert into core.notifications (user_id, event_key, data, link, dedupe_key, in_app)
  values (p_user, p_event, coalesce(p_data, '{}'::jsonb), p_link, p_event || ':' || p_ref, v_in_app)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  if v_id is not null and v_email then
    insert into core.notification_deliveries (notification_id, channel) values (v_id, 'EMAIL');
  end if;
  return v_id;
end;
$$;
revoke all on function core.notify(uuid, text, text, jsonb, text) from public;

-- Announcement events go only to users who opted in.
create or replace function core.notify_subscribers(p_event text, p_ref text, p_data jsonb, p_link text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_count integer := 0;
begin
  for r in
    select p.user_id from core.notification_preferences p
      join core.profiles pr on pr.id = p.user_id
     where p.event_key = p_event and (p.in_app or p.email) and pr.status = 'ACTIVE'
  loop
    if core.notify(r.user_id, p_event, p_ref, p_data, p_link) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function core.notify_subscribers(text, text, jsonb, text) from public;

create or replace function core.record_notification_error(p_source text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into core.notification_errors (source, message)
  values (left(coalesce(nullif(p_source, ''), 'unknown'), 120), left(coalesce(nullif(p_message, ''), 'unknown error'), 500));
end;
$$;
revoke all on function core.record_notification_error(text, text) from public;

-- "••••1234" — never more than the last four characters of a provider reference
create or replace function core.mask_reference(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_value is null or p_value = '' then null else '••••' || right(p_value, 4) end;
$$;

-- ---------------------------------------------------------------------------
-- PoolX triggers
-- ---------------------------------------------------------------------------
create or replace function poolx.pool_notice(p_pool uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('poolTitle', title, 'poolSlug', slug) from poolx.pools where id = p_pool;
$$;

create or replace function poolx.notify_pool_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_data jsonb := jsonb_build_object('poolTitle', new.title, 'poolSlug', new.slug);
begin
  begin
    if old.status = 'DRAFT' and new.status = 'ACTIVE' and new.kind = 'PUBLIC' then
      perform core.notify_subscribers('poolx.pool_created', new.id::text, v_data, '/poolx/pools/' || new.slug);
    end if;
    if new.status = 'COMPLETED' and old.status <> 'COMPLETED' then
      for r in select user_id from poolx.members where pool_id = new.id and status in ('ACTIVE', 'FULFILLED') loop
        perform core.notify(r.user_id, 'poolx.pool_completed', new.id::text, v_data, '/account/poolx');
      end loop;
    end if;
  exception when others then
    perform core.record_notification_error('poolx.notify_pool_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger pools_notify after update of status on poolx.pools
  for each row when (old.status is distinct from new.status) execute function poolx.notify_pool_status();

create or replace function poolx.notify_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_pool jsonb;
begin
  begin
    if new.status = 'APPROVED' then
      v_pool := case when new.resulting_pool_id is not null then poolx.pool_notice(new.resulting_pool_id) end;
      perform core.notify(new.requester_id, 'poolx.pool_approved', new.id::text,
        jsonb_build_object('requestTitle', new.title) || coalesce(v_pool, '{}'::jsonb),
        case when v_pool is not null then '/poolx/pools/' || (v_pool ->> 'poolSlug') else '/account/poolx' end);
    end if;
  exception when others then
    perform core.record_notification_error('poolx.notify_request_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger requests_notify after update of status on poolx.requests
  for each row when (old.status is distinct from new.status) execute function poolx.notify_request_status();

create or replace function poolx.notify_member_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p poolx.pools;
  r record;
  v_members integer;
  v_qty integer;
  v_now integer;
  v_before integer;
  v_bps_now integer;
  v_bps_before integer;
  v_data jsonb;
begin
  begin
    if new.status <> 'ACTIVE' or (tg_op = 'UPDATE' and old.status = 'ACTIVE') then
      return null;
    end if;
    select * into p from poolx.pools where id = new.pool_id;
    v_data := jsonb_build_object('poolTitle', p.title, 'poolSlug', p.slug);
    perform core.notify(new.user_id, 'poolx.pool_joined', new.id::text, v_data || jsonb_build_object('quantity', new.quantity),
      '/poolx/pools/' || p.slug);

    select active_members, active_quantity into v_members, v_qty from poolx.pool_stats(p.id);
    v_now := case when p.tier_basis = 'QUANTITY' then v_qty else v_members end;
    v_before := v_now - case when p.tier_basis = 'QUANTITY' then new.quantity else 1 end;
    v_bps_now := poolx.discount_bps_at(p.id, v_now);
    v_bps_before := poolx.discount_bps_at(p.id, v_before);
    if v_bps_now > v_bps_before then
      for r in select user_id from poolx.members where pool_id = p.id and status = 'ACTIVE' loop
        perform core.notify(r.user_id, 'poolx.discount_milestone', p.id || ':' || v_bps_now,
          v_data || jsonb_build_object('discountBps', v_bps_now), '/poolx/pools/' || p.slug);
      end loop;
    end if;
    if v_members >= p.target_members and v_members - 1 < p.target_members then
      for r in select user_id from poolx.members where pool_id = p.id and status = 'ACTIVE' loop
        perform core.notify(r.user_id, 'poolx.target_achieved', p.id::text,
          v_data || jsonb_build_object('members', v_members), '/poolx/pools/' || p.slug);
      end loop;
    end if;
  exception when others then
    perform core.record_notification_error('poolx.notify_member_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger members_notify_insert after insert on poolx.members
  for each row when (new.status = 'ACTIVE') execute function poolx.notify_member_status();
create trigger members_notify_update after update of status on poolx.members
  for each row when (old.status is distinct from new.status and new.status = 'ACTIVE') execute function poolx.notify_member_status();

create or replace function poolx.notify_contribution_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform core.notify(new.user_id, 'poolx.contribution_confirmed', new.id::text,
      coalesce(poolx.pool_notice(new.pool_id), '{}'::jsonb) || jsonb_build_object('amountPaise', new.amount_paise::text),
      '/account/poolx');
  exception when others then
    perform core.record_notification_error('poolx.notify_contribution_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger contributions_notify after update of status on poolx.contributions
  for each row when (old.status is distinct from new.status and new.status = 'CONFIRMED')
  execute function poolx.notify_contribution_status();

create or replace function poolx.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare s poolx.shipments; v_data jsonb := coalesce(poolx.pool_notice(new.pool_id), '{}'::jsonb);
begin
  begin
    if new.status = 'SHIPPED' then
      select * into s from poolx.shipments where order_id = new.id;
      perform core.notify(new.user_id, 'poolx.order_dispatched', new.id::text,
        v_data || jsonb_strip_nulls(jsonb_build_object('carrier', s.carrier, 'trackingNumber', s.tracking_number)), '/account/poolx');
    elsif new.status = 'DELIVERED' then
      perform core.notify(new.user_id, 'poolx.delivery_update', new.id || ':DELIVERED',
        v_data || jsonb_build_object('status', 'DELIVERED'), '/account/poolx');
    end if;
  exception when others then
    perform core.record_notification_error('poolx.notify_order_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger orders_notify after update of status on poolx.orders
  for each row when (old.status is distinct from new.status and new.status in ('SHIPPED', 'DELIVERED'))
  execute function poolx.notify_order_status();

create or replace function poolx.notify_refund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_data jsonb;
begin
  begin
    v_data := coalesce(poolx.pool_notice(new.pool_id), '{}'::jsonb)
      || jsonb_build_object('amountPaise', new.amount_paise::text, 'reason', new.reason);
    if new.status in ('REFUND_INITIATED', 'REFUND_PROCESSING') then
      perform core.notify(new.user_id, 'poolx.refund_initiated', new.id::text, v_data, '/account/poolx');
    elsif new.status = 'REFUNDED' then
      perform core.notify(new.user_id, 'poolx.refund_completed', new.id::text,
        v_data || jsonb_strip_nulls(jsonb_build_object('reference', core.mask_reference(new.provider_refund_id))), '/account/poolx');
    end if;
  exception when others then
    perform core.record_notification_error('poolx.notify_refund_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger refunds_notify after update of status on poolx.refunds
  for each row when (old.status is distinct from new.status) execute function poolx.notify_refund_status();

-- ---------------------------------------------------------------------------
-- Auction triggers
-- ---------------------------------------------------------------------------
create or replace function auction.auction_notice(p_auction uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('auctionTitle', s.title, 'auctionSlug', a.slug)
    from auction.auctions a join auction.assets s on s.id = a.asset_id where a.id = p_auction;
$$;

create or replace function auction.notify_auction_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_seller uuid; v_data jsonb := coalesce(auction.auction_notice(new.id), '{}'::jsonb);
begin
  begin
    if old.status = 'DRAFT' and new.status in ('SCHEDULED', 'LIVE') then
      select s.profile_id into v_seller
        from auction.assets x join auction.sellers s on s.id = x.seller_id where x.id = new.asset_id;
      perform core.notify(v_seller, 'auction.auction_approved', new.id::text,
        v_data || jsonb_build_object('startsAt', new.starts_at), '/auctions/' || new.slug);
      perform core.notify_subscribers('auction.auction_published', new.id::text,
        v_data || jsonb_build_object('startsAt', new.starts_at), '/auctions/' || new.slug);
    end if;
    if new.status = 'LIVE' and old.status <> 'LIVE' then
      for r in select id, user_id from auction.deposits where auction_id = new.id and status = 'PAID' loop
        perform core.notify(r.user_id, 'auction.bidding_activated', r.id::text,
          v_data || jsonb_build_object('endsAt', new.ends_at), '/auctions/' || new.slug);
      end loop;
    end if;
  exception when others then
    perform core.record_notification_error('auction.notify_auction_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger auctions_notify_status after update of status on auction.auctions
  for each row when (old.status is distinct from new.status) execute function auction.notify_auction_status();

create or replace function auction.notify_leader_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_prev uuid; v_new uuid;
begin
  begin
    select user_id into v_prev from auction.bids where id = old.leader_bid_id;
    select user_id into v_new from auction.bids where id = new.leader_bid_id;
    if v_prev is not null and v_prev is distinct from v_new then
      perform core.notify(v_prev, 'auction.outbid', new.leader_bid_id::text,
        coalesce(auction.auction_notice(new.id), '{}'::jsonb)
          || jsonb_build_object('currentBidPaise', new.current_bid_paise::text, 'endsAt', new.ends_at),
        '/auctions/' || new.slug);
    end if;
  exception when others then
    perform core.record_notification_error('auction.notify_leader_change', sqlerrm);
  end;
  return null;
end;
$$;
create trigger auctions_notify_leader after update of leader_bid_id on auction.auctions
  for each row when (old.leader_bid_id is not null and old.leader_bid_id is distinct from new.leader_bid_id)
  execute function auction.notify_leader_change();

create or replace function auction.notify_bid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_data jsonb := coalesce(auction.auction_notice(new.auction_id), '{}'::jsonb);
begin
  begin
    perform core.notify(new.user_id, 'auction.bid_accepted', new.id::text,
      v_data || jsonb_build_object('amountPaise', new.amount_paise::text), '/auctions/' || (v_data ->> 'auctionSlug'));
  exception when others then
    perform core.record_notification_error('auction.notify_bid', sqlerrm);
  end;
  return null;
end;
$$;
create trigger bids_notify after insert on auction.bids
  for each row when (new.status = 'ACCEPTED') execute function auction.notify_bid();

create or replace function auction.notify_deposit_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a auction.auctions; v_data jsonb;
begin
  begin
    select * into a from auction.auctions where id = new.auction_id;
    v_data := coalesce(auction.auction_notice(a.id), '{}'::jsonb);
    perform core.notify(new.user_id, 'auction.deposit_confirmed', new.id::text,
      v_data || jsonb_build_object('amountPaise', new.amount_paise::text), '/account/auctions');
    if a.status = 'LIVE' and now() < a.ends_at then
      perform core.notify(new.user_id, 'auction.bidding_activated', new.id::text,
        v_data || jsonb_build_object('endsAt', a.ends_at), '/auctions/' || a.slug);
    end if;
  exception when others then
    perform core.record_notification_error('auction.notify_deposit_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger deposits_notify after update of status on auction.deposits
  for each row when (old.status is distinct from new.status and new.status = 'PAID')
  execute function auction.notify_deposit_status();

create or replace function auction.notify_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_data jsonb := coalesce(auction.auction_notice(new.auction_id), '{}'::jsonb);
begin
  begin
    if new.outcome = 'WON' then
      perform core.notify(new.winner_user_id, 'auction.auction_won', new.auction_id::text,
        v_data || jsonb_build_object('finalPricePaise', new.final_price_paise::text), '/account/auctions');
    end if;
    -- everyone else who paid a deposit: "lost" if they bid against a winner, otherwise "closed"
    for r in
      select d.user_id,
             exists (select 1 from auction.bids b where b.auction_id = d.auction_id and b.user_id = d.user_id
                      and b.status = 'ACCEPTED') as did_bid
        from auction.deposits d
       where d.auction_id = new.auction_id
         and d.status not in ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED')
         and d.user_id is distinct from new.winner_user_id
    loop
      if new.outcome = 'WON' and r.did_bid then
        perform core.notify(r.user_id, 'auction.auction_lost', new.auction_id::text,
          v_data || jsonb_build_object('finalPricePaise', new.final_price_paise::text), '/account/auctions');
      else
        perform core.notify(r.user_id, 'auction.auction_closed', new.auction_id::text,
          v_data || jsonb_build_object('outcome', new.outcome), '/account/auctions');
      end if;
    end loop;
  exception when others then
    perform core.record_notification_error('auction.notify_result', sqlerrm);
  end;
  return null;
end;
$$;
create trigger results_notify after insert on auction.results for each row execute function auction.notify_result();

create or replace function auction.notify_refund_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_data jsonb;
begin
  begin
    v_data := coalesce(auction.auction_notice(new.auction_id), '{}'::jsonb)
      || jsonb_build_object('amountPaise', new.amount_paise::text, 'reason', new.reason);
    if tg_op = 'INSERT' then
      perform core.notify(new.user_id, 'auction.refund_eligible', new.id::text, v_data, '/account/auctions');
      return null;
    end if;
    if new.status in ('REFUND_INITIATED', 'REFUND_PROCESSING') then
      perform core.notify(new.user_id, 'auction.refund_initiated', new.id::text, v_data, '/account/auctions');
    elsif new.status = 'REFUNDED' then
      perform core.notify(new.user_id, 'auction.refund_completed', new.id::text,
        v_data || jsonb_strip_nulls(jsonb_build_object('reference', core.mask_reference(new.provider_refund_id))), '/account/auctions');
    elsif new.status = 'REFUND_FAILED' then
      -- first failure only; retries are automatic and the completion is notified separately
      perform core.notify(new.user_id, 'auction.refund_failed', new.id::text, v_data, '/account/auctions');
    end if;
  exception when others then
    perform core.record_notification_error('auction.notify_refund_status', sqlerrm);
  end;
  return null;
end;
$$;
create trigger refunds_notify_insert after insert on auction.refunds
  for each row execute function auction.notify_refund_status();
create trigger refunds_notify_update after update of status on auction.refunds
  for each row when (old.status is distinct from new.status) execute function auction.notify_refund_status();

create or replace function auction.notify_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare d auction.deposits;
begin
  begin
    select * into d from auction.deposits where id = new.deposit_id;
    perform core.notify(d.user_id, 'auction.deposit_adjusted', new.id::text,
      coalesce(auction.auction_notice(d.auction_id), '{}'::jsonb) || jsonb_build_object('amountPaise', new.amount_paise::text),
      '/account/auctions');
  exception when others then
    perform core.record_notification_error('auction.notify_adjustment', sqlerrm);
  end;
  return null;
end;
$$;
create trigger deposit_adjustments_notify after insert on auction.deposit_adjustments
  for each row execute function auction.notify_adjustment();

create or replace function auction.notify_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform core.notify(new.winner_user_id, 'auction.payment_overdue', new.id::text,
      coalesce(auction.auction_notice(new.auction_id), '{}'::jsonb)
        || jsonb_build_object('amountDuePaise', (new.total_payable_paise - new.amount_paid_paise)::text, 'dueAt', new.due_at),
      '/account/auctions');
  exception when others then
    perform core.record_notification_error('auction.notify_invoice_status', sqlerrm);
  end;
  return null;
end;
$$;
-- the closing job moves unpaid invoices past their deadline from ISSUED to DEFAULT_REVIEW (OVERDUE is reserved)
create trigger invoices_notify after update of status on auction.invoices
  for each row when (old.status = 'ISSUED' and new.status in ('OVERDUE', 'DEFAULT_REVIEW'))
  execute function auction.notify_invoice_status();

-- Time-based reminders (run by the auction job every minute): starting within 60 minutes, ending within 15 minutes.
create or replace function api.auction_notify_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_count integer := 0;
begin
  for r in
    select a.id as auction_id, a.slug, a.starts_at, d.user_id
      from auction.auctions a join auction.deposits d on d.auction_id = a.id and d.status = 'PAID'
     where a.status = 'SCHEDULED' and a.starts_at > now() and a.starts_at <= now() + interval '60 minutes'
  loop
    if core.notify(r.user_id, 'auction.auction_starting', r.auction_id::text,
         coalesce(auction.auction_notice(r.auction_id), '{}'::jsonb) || jsonb_build_object('startsAt', r.starts_at),
         '/auctions/' || r.slug) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  for r in
    select a.id as auction_id, a.slug, a.ends_at, d.user_id
      from auction.auctions a join auction.deposits d on d.auction_id = a.id and d.status = 'PAID'
     where a.status = 'LIVE' and a.ends_at > now() and a.ends_at <= now() + interval '15 minutes'
  loop
    if core.notify(r.user_id, 'auction.ending_soon', r.auction_id::text,
         coalesce(auction.auction_notice(r.auction_id), '{}'::jsonb) || jsonb_build_object('endsAt', r.ends_at),
         '/auctions/' || r.slug) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function api.auction_notify_due() from public, anon, authenticated;
grant execute on function api.auction_notify_due() to service_role;

-- ---------------------------------------------------------------------------
-- Member API
-- ---------------------------------------------------------------------------
create or replace function api.notifications_list(p_unread_only boolean, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from core.notifications n
               where n.user_id = v_uid and n.in_app and (not coalesce(p_unread_only, false) or n.read_at is null)),
    'unread', (select count(*) from core.notifications n where n.user_id = v_uid and n.in_app and n.read_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'event', x.event_key, 'domain', e.domain, 'data', x.data,
               'link', x.link, 'readAt', x.read_at, 'createdAt', x.created_at) order by x.created_at desc, x.id)
        from (select * from core.notifications n
               where n.user_id = v_uid and n.in_app and (not coalesce(p_unread_only, false) or n.read_at is null)
               order by n.created_at desc, n.id limit v_limit offset greatest(coalesce(p_offset, 0), 0)) x
        join core.notification_events e on e.key = x.event_key), '[]'::jsonb));
end;
$$;

create or replace function api.notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from core.notifications where user_id = auth.uid() and in_app and read_at is null;
$$;

-- p_id null marks everything as read. Returns the number of notifications changed.
create or replace function api.notifications_mark_read(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update core.notifications set read_at = now()
   where user_id = v_uid and read_at is null and in_app and (p_id is null or id = p_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function api.notifications_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'event', e.key, 'domain', e.domain, 'label', e.label, 'description', e.description,
             'audience', e.audience, 'essential', e.essential,
             'inApp', e.essential or coalesce(p.in_app, e.in_app_default),
             'email', e.essential or coalesce(p.email, e.email_default))
           order by e.domain desc, e.sort)
      from core.notification_events e
      left join core.notification_preferences p on p.event_key = e.key and p.user_id = v_uid), '[]'::jsonb);
end;
$$;

create or replace function api.notifications_set_preference(p_event text, p_in_app boolean, p_email boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); e core.notification_events;
begin
  select * into e from core.notification_events where key = p_event;
  if e.key is null then
    raise exception 'NOT_FOUND: unknown notification' using errcode = 'P0001';
  end if;
  if p_in_app is null or p_email is null then
    raise exception 'INVALID_REQUEST: choose on or off for each channel' using errcode = 'P0001';
  end if;
  if e.essential and not (p_in_app and p_email) then
    raise exception 'ESSENTIAL: payment and refund notices cannot be turned off' using errcode = 'P0001';
  end if;
  if p_in_app = e.in_app_default and p_email = e.email_default then
    delete from core.notification_preferences where user_id = v_uid and event_key = p_event;
  else
    insert into core.notification_preferences (user_id, event_key, in_app, email)
    values (v_uid, p_event, p_in_app, p_email)
    on conflict (user_id, event_key) do update set in_app = excluded.in_app, email = excluded.email;
  end if;
end;
$$;

revoke all on function api.notifications_list(boolean, integer, integer), api.notifications_unread_count(),
  api.notifications_mark_read(uuid), api.notifications_preferences(),
  api.notifications_set_preference(text, boolean, boolean) from public, anon;
grant execute on function api.notifications_list(boolean, integer, integer), api.notifications_unread_count(),
  api.notifications_mark_read(uuid), api.notifications_preferences(),
  api.notifications_set_preference(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Delivery worker API (service role only)
-- ---------------------------------------------------------------------------
-- Claims due deliveries (and SENDING rows abandoned for 10 minutes). Each claim counts as an attempt.
create or replace function api.notifications_claim_deliveries(p_limit integer)
returns table (delivery_id uuid, channel text, attempt_no integer, event_key text, data jsonb, link text,
               created_at timestamptz, email text, display_name text, profile_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select d.id from core.notification_deliveries d
     where (d.status = 'QUEUED' and d.next_attempt_at <= now())
        or (d.status = 'SENDING' and d.claimed_at < now() - interval '10 minutes')
     order by d.next_attempt_at, d.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked
  ), claimed as (
    update core.notification_deliveries d
       set status = 'SENDING', attempts = d.attempts + 1, claimed_at = now()
      from due where d.id = due.id
    returning d.id, d.channel, d.attempts, d.notification_id
  )
  select c.id, c.channel, c.attempts, n.event_key, n.data, n.link, n.created_at, pr.email::text, pr.display_name, pr.status
    from claimed c
    join core.notifications n on n.id = c.notification_id
    join core.profiles pr on pr.id = n.user_id;
end;
$$;

-- p_status: SENT | FAILED | SKIPPED. Retryable failures back off (1 min, 5 min, 30 min, 2 h) and stop after 5 attempts.
create or replace function api.notifications_record_delivery(p_delivery uuid, p_status text, p_provider text,
  p_message_id text, p_error text, p_retryable boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare d core.notification_deliveries; v_backoff interval;
begin
  select * into d from core.notification_deliveries where id = p_delivery for update;
  if d.id is null then
    raise exception 'NOT_FOUND: delivery' using errcode = 'P0001';
  end if;
  if d.status <> 'SENDING' then
    return 'IGNORED';                                  -- already recorded (or reclaimed); never double-record
  end if;
  if p_status = 'SENT' then
    update core.notification_deliveries
       set status = 'SENT', sent_at = now(), provider = p_provider, provider_message_id = left(p_message_id, 200), last_error = null
     where id = d.id;
    return 'SENT';
  elsif p_status = 'SKIPPED' then
    update core.notification_deliveries
       set status = 'SKIPPED', provider = p_provider, last_error = left(coalesce(p_error, 'skipped'), 500)
     where id = d.id;
    return 'SKIPPED';
  elsif p_status = 'FAILED' then
    if coalesce(p_retryable, false) and d.attempts < 5 then
      v_backoff := case d.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes'
                   when 3 then interval '30 minutes' else interval '2 hours' end;
      update core.notification_deliveries
         set status = 'QUEUED', next_attempt_at = now() + v_backoff, provider = p_provider,
             last_error = left(coalesce(p_error, 'delivery failed'), 500)
       where id = d.id;
      return 'RETRY';
    end if;
    update core.notification_deliveries
       set status = 'FAILED', provider = p_provider, last_error = left(coalesce(p_error, 'delivery failed'), 500)
     where id = d.id;
    return 'FAILED';
  end if;
  raise exception 'INVALID_STATUS: %', p_status using errcode = 'P0001';
end;
$$;

revoke all on function api.notifications_claim_deliveries(integer),
  api.notifications_record_delivery(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function api.notifications_claim_deliveries(integer),
  api.notifications_record_delivery(uuid, text, text, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Staff API (support.tickets)
-- ---------------------------------------------------------------------------
create or replace function api.admin_notification_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('support.tickets');
  return jsonb_build_object(
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) as n from core.notification_deliveries
         where created_at > now() - interval '7 days' group by status) s), '{}'::jsonb),
    'notifications7d', (select count(*) from core.notifications where created_at > now() - interval '7 days'),
    'errors7d', (select count(*) from core.notification_errors where created_at > now() - interval '7 days'),
    'recentErrors', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'message', message, 'createdAt', created_at)
        order by created_at desc) from (select * from core.notification_errors order by created_at desc limit 10) x), '[]'::jsonb),
    'events', (select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'domain', domain) order by domain desc, sort)
                 from core.notification_events));
end;
$$;

create or replace function api.admin_list_notification_deliveries(p_status text, p_event text, p_search text,
  p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100); v_search text := nullif(trim(p_search), '');
begin
  perform core.require_permission('support.tickets');
  return (
    with rows as (
      select d.*, n.event_key, n.user_id, pr.email::text as user_email
        from core.notification_deliveries d
        join core.notifications n on n.id = d.notification_id
        join core.profiles pr on pr.id = n.user_id
       where (p_status is null or d.status = p_status)
         and (p_event is null or n.event_key = p_event)
         and (v_search is null or pr.email::text ilike '%' || replace(replace(v_search, '%', ''), '_', '') || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from rows),
      'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'channel', r.channel, 'status', r.status, 'attempts', r.attempts, 'event', r.event_key,
          'userEmail', r.user_email, 'provider', r.provider, 'lastError', r.last_error, 'sentAt', r.sent_at,
          'nextAttemptAt', r.next_attempt_at, 'createdAt', r.created_at) order by r.created_at desc, r.id)
        from (select * from rows order by created_at desc, id limit v_limit offset greatest(coalesce(p_offset, 0), 0)) r),
        '[]'::jsonb)));
end;
$$;

create or replace function api.admin_retry_notification_delivery(p_delivery uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare d core.notification_deliveries;
begin
  perform core.require_permission('support.tickets');
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'REASON_REQUIRED: give a reason of at least 10 characters' using errcode = 'P0001';
  end if;
  select * into d from core.notification_deliveries where id = p_delivery for update;
  if d.id is null then
    raise exception 'NOT_FOUND: delivery' using errcode = 'P0001';
  end if;
  if d.status not in ('FAILED', 'SKIPPED') then
    raise exception 'INVALID_REQUEST: only failed or skipped deliveries can be retried' using errcode = 'P0001';
  end if;
  update core.notification_deliveries
     set status = 'QUEUED', attempts = 0, next_attempt_at = now(), claimed_at = null
   where id = d.id;
  perform core.write_audit('notification.delivery.retried', 'core', 'notification_deliveries', d.id::text,
    jsonb_build_object('status', d.status, 'attempts', d.attempts, 'lastError', d.last_error),
    jsonb_build_object('status', 'QUEUED'), trim(p_reason));
end;
$$;

revoke all on function api.admin_notification_overview(),
  api.admin_list_notification_deliveries(text, text, text, integer, integer),
  api.admin_retry_notification_delivery(uuid, text) from public, anon;
grant execute on function api.admin_notification_overview(),
  api.admin_list_notification_deliveries(text, text, text, integer, integer),
  api.admin_retry_notification_delivery(uuid, text) to authenticated;
