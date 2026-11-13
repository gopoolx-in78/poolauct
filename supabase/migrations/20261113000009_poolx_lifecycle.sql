-- 0009 — PoolX lifecycle after joining closes: negotiation → seller confirmation → lock (final price, price-adjustment
-- refunds, per-member orders, seller payable) → shipment → delivery → completion; disputes with audited resolution.

alter table poolx.pools
  add column final_unit_price_paise bigint check (final_unit_price_paise is null or final_unit_price_paise > 0),
  add column locked_at timestamptz,
  add constraint pools_locked_consistent check (
    (status in ('LOCKED', 'ORDERING', 'COMPLETED')) = (locked_at is not null and final_unit_price_paise is not null)
    or (status = 'CANCELLED' and locked_at is null));

-- ---------------------------------------------------------------------------
-- Negotiation log (append-only record of seller offers / confirmations)
-- ---------------------------------------------------------------------------
create table poolx.negotiations (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references poolx.pools (id),
  seller_id uuid references poolx.sellers (id),
  offered_unit_price_paise bigint check (offered_unit_price_paise is null or offered_unit_price_paise > 0),
  terms text not null check (char_length(terms) between 5 and 2000),
  outcome text not null check (outcome in ('PROPOSED', 'ACCEPTED', 'REJECTED')),
  recorded_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now()
);
create index negotiations_pool_idx on poolx.negotiations (pool_id, created_at);
create trigger negotiations_append_only before update or delete on poolx.negotiations
  for each row execute function core.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Orders (one per member at lock), shipments, disputes
-- ---------------------------------------------------------------------------
create table poolx.orders (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references poolx.pools (id),
  member_id uuid not null unique references poolx.members (id),
  contribution_id uuid not null unique references poolx.contributions (id),
  user_id uuid not null references core.profiles (id),
  quantity integer not null check (quantity >= 1),
  unit_price_paise bigint not null check (unit_price_paise > 0),
  fee_paise bigint not null check (fee_paise >= 0),
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'CREATED' check (status in ('CREATED', 'SHIPPED', 'DELIVERED', 'DISPUTED', 'REFUNDED', 'CANCELLED')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_amount_formula check (amount_paise = quantity * unit_price_paise + fee_paise),
  constraint orders_delivered_has_time check (status <> 'DELIVERED' or delivered_at is not null)
);
create index orders_pool_status_idx on poolx.orders (pool_id, status);
create index orders_user_idx on poolx.orders (user_id);
create trigger orders_set_updated_at before update on poolx.orders for each row execute function core.set_updated_at();
create trigger orders_no_delete before delete on poolx.orders for each row execute function core.forbid_delete();

create table poolx.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references poolx.orders (id),
  carrier text not null check (char_length(carrier) between 2 and 80),
  tracking_number text not null check (char_length(tracking_number) between 3 and 80),
  -- Postgres regex repetition counts max out at 255, so length is checked separately.
  tracking_url text check (tracking_url is null or (char_length(tracking_url) between 12 and 300 and tracking_url ~ '^https://[^[:space:]<>"]+$')),
  shipped_by uuid not null references core.profiles (id),
  created_at timestamptz not null default now()
);

create table poolx.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references poolx.orders (id),
  user_id uuid not null references core.profiles (id),
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION')),
  previous_order_status text not null,
  resolution_note text check (char_length(resolution_note) <= 2000),
  refund_id uuid references poolx.refunds (id),
  resolved_by uuid references core.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint disputes_resolution_consistent check ((status = 'OPEN') = (resolved_at is null))
);
create unique index disputes_one_open_per_order on poolx.disputes (order_id) where status = 'OPEN';
create trigger disputes_set_updated_at before update on poolx.disputes for each row execute function core.set_updated_at();
create trigger disputes_no_delete before delete on poolx.disputes for each row execute function core.forbid_delete();

alter table poolx.negotiations enable row level security;
alter table poolx.orders enable row level security;
alter table poolx.shipments enable row level security;
alter table poolx.disputes enable row level security;
grant select on poolx.negotiations, poolx.orders, poolx.shipments, poolx.disputes to authenticated;
create policy negotiations_select_staff on poolx.negotiations for select to authenticated using (core.has_permission('poolx.pools.manage'));
create policy orders_select_own_or_staff on poolx.orders for select to authenticated
  using (user_id = auth.uid() or core.has_permission('poolx.orders.read') or core.has_permission('poolx.orders.manage'));
create policy shipments_select_own_or_staff on poolx.shipments for select to authenticated
  using (exists (select 1 from poolx.orders o where o.id = order_id and o.user_id = auth.uid())
         or core.has_permission('poolx.orders.read') or core.has_permission('poolx.orders.manage'));
create policy disputes_select_own_or_staff on poolx.disputes for select to authenticated
  using (user_id = auth.uid() or core.has_permission('poolx.orders.manage') or core.has_permission('poolx.refunds.manual'));
-- No end-user write policies: writes go through api.* functions.

-- ---------------------------------------------------------------------------
-- Refund ledger: once an order exists the money sits in seller_payable, so a dispute refund reduces what the seller is
-- owed instead of the (already cleared) contribution liability.
-- ---------------------------------------------------------------------------
create or replace function poolx.apply_refund_result(
  p_refund uuid, p_status text, p_provider_refund_id text, p_error text, p_retryable boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare r poolx.refunds; v_backoff interval; v_account text;
begin
  select * into r from poolx.refunds where id = p_refund for update;
  if r.id is null then
    return 'UNKNOWN_REFUND';
  end if;
  if r.status = 'REFUNDED' then
    return 'ALREADY_REFUNDED';
  end if;

  if p_status = 'PROCESSED' then
    update poolx.refunds
       set status = 'REFUNDED', refunded_at = now(), provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
           last_error = null, next_retry_at = null
     where id = r.id;
    if r.reason not in ('PRICE_ADJUSTMENT', 'MANUAL') then
      update poolx.contributions set status = 'REFUNDED' where id = r.contribution_id;
    end if;
    v_account := case when exists (select 1 from poolx.orders o where o.contribution_id = r.contribution_id)
                           and r.reason = 'MANUAL'
                      then 'poolx:seller_payable' else 'poolx:contribution_liability' end;
    perform ledger.post_journal('poolx', 'CONTRIBUTION_REFUNDED', 'poolx.refunds', r.id, 'poolx:refund:' || r.id::text,
      jsonb_build_array(
        jsonb_build_object('account', v_account, 'debit', r.amount_paise, 'user_id', r.user_id),
        jsonb_build_object('account', 'poolx:gateway_clearing', 'credit', r.amount_paise, 'user_id', r.user_id)));
    return 'REFUNDED';
  elsif p_status = 'PROCESSING' then
    update poolx.refunds set status = 'REFUND_PROCESSING', provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id)
     where id = r.id;
    return 'REFUND_PROCESSING';
  elsif p_status = 'FAILED' then
    v_backoff := case least(r.attempts, 5) when 1 then interval '1 minute' when 2 then interval '5 minutes'
                 when 3 then interval '30 minutes' when 4 then interval '2 hours' else interval '12 hours' end;
    update poolx.refunds
       set status = 'REFUND_FAILED', last_error = left(p_error, 500),
           retryable = coalesce(p_retryable, false) and r.attempts < 5,
           next_retry_at = case when coalesce(p_retryable, false) and r.attempts < 5 then now() + v_backoff end
     where id = r.id;
    perform core.write_audit('poolx.refund.failed', 'poolx', 'refunds', r.id::text, null,
      jsonb_build_object('attempts', r.attempts, 'retryable', coalesce(p_retryable, false)), left(p_error, 500));
    return 'REFUND_FAILED';
  end if;
  raise exception 'INVALID_STATUS: %', p_status using errcode = 'P0001';
end;
$$;

-- Completes the pool once every order is finished.
create or replace function poolx.maybe_complete_pool(p_pool uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from poolx.orders where pool_id = p_pool)
     and not exists (select 1 from poolx.orders where pool_id = p_pool and status not in ('DELIVERED', 'REFUNDED', 'CANCELLED')) then
    update poolx.pools set status = 'COMPLETED', closed_at = now() where id = p_pool and status = 'LOCKED';
    return found;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: close joining early, negotiate, lock
-- ---------------------------------------------------------------------------
create or replace function api.poolx_admin_close_joining(p_pool uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); p poolx.pools; v_members int;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null or p.status <> 'ACTIVE' then
    raise exception 'INVALID_STATE: only open pools can be closed to new members' using errcode = 'P0001';
  end if;
  select active_members into v_members from poolx.pool_stats(p.id);
  if v_members < p.min_members then
    raise exception 'MIN_NOT_REACHED: % of % minimum members', v_members, p.min_members using errcode = 'P0001';
  end if;
  update poolx.pools set status = 'THRESHOLD_MET' where id = p.id;
  perform core.write_audit('poolx.pool.close_joining', 'poolx', 'pools', p.id::text, null, jsonb_build_object('members', v_members), null);
  return jsonb_build_object('status', 'THRESHOLD_MET', 'members', v_members);
end;
$$;

create or replace function api.poolx_admin_record_negotiation(p_pool uuid, p_offered_unit_price_paise bigint, p_terms text, p_outcome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); p poolx.pools; v_id uuid;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null or p.status not in ('THRESHOLD_MET', 'NEGOTIATING') then
    raise exception 'INVALID_STATE: negotiation is recorded after joining closes' using errcode = 'P0001';
  end if;
  if p.seller_id is null then
    raise exception 'NO_SELLER: assign a seller before recording negotiation' using errcode = 'P0001';
  end if;
  insert into poolx.negotiations (pool_id, seller_id, offered_unit_price_paise, terms, outcome, recorded_by)
  values (p.id, p.seller_id, p_offered_unit_price_paise, btrim(p_terms), p_outcome, v_uid)
  returning id into v_id;
  update poolx.pools set status = 'NEGOTIATING' where id = p.id and status = 'THRESHOLD_MET';
  perform core.write_audit('poolx.negotiation.record', 'poolx', 'pools', p.id::text, null,
    jsonb_build_object('outcome', p_outcome, 'offeredUnitPricePaise', p_offered_unit_price_paise), btrim(p_terms));
  return v_id;
end;
$$;

/**
 * Locks the deal. Final unit price = the tier price for the final confirmed membership, lowered further by an accepted
 * seller offer if that is cheaper (never higher). Each member's order uses least(final price, price they paid). Members who paid more get a PRICE_ADJUSTMENT refund; each confirmed
 * member gets one order; the ledger moves the money from contribution liability to seller payable (+ disclosed fee).
 * Idempotent: locking an already locked pool changes nothing.
 */
create or replace function api.poolx_admin_lock(p_pool uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_permission('poolx.pools.manage');
  p poolx.pools; v_offer bigint; v_tier_price bigint; v_final bigint; c record;
  v_unit bigint; v_fee bigint; v_amount bigint; v_order uuid; v_orders int := 0; v_adjustments int := 0;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null then
    raise exception 'POOL_NOT_FOUND: pool not found' using errcode = 'P0001';
  end if;
  if p.status in ('LOCKED', 'COMPLETED') then
    return jsonb_build_object('status', p.status, 'finalUnitPricePaise', p.final_unit_price_paise::text, 'alreadyLocked', true);
  end if;
  if p.status not in ('THRESHOLD_MET', 'NEGOTIATING') then
    raise exception 'INVALID_STATE: close joining before locking' using errcode = 'P0001';
  end if;
  select n.offered_unit_price_paise into v_offer from poolx.negotiations n
   where n.pool_id = p.id and n.outcome = 'ACCEPTED' order by n.created_at desc limit 1;
  if not found then
    raise exception 'SELLER_NOT_CONFIRMED: record the seller''s accepted offer first' using errcode = 'P0001';
  end if;

  v_tier_price := poolx.discounted_price(p.base_unit_price_paise, poolx.current_discount_bps(p.id));
  v_final := least(v_tier_price, coalesce(v_offer, v_tier_price));

  -- pending payments can no longer join: expire them (a late capture is refunded automatically)
  update core.payment_attempts a set status = 'EXPIRED'
    from poolx.contributions ct where ct.pool_id = p.id and ct.status = 'PENDING' and a.id = ct.payment_attempt_id
     and a.status in ('CREATED', 'PENDING');
  update poolx.contributions set status = 'EXPIRED' where pool_id = p.id and status = 'PENDING';
  update poolx.members set status = 'WITHDRAWN', withdrawn_at = now() where pool_id = p.id and status = 'PENDING_PAYMENT';

  for c in
    select ct.*, m.id as m_id from poolx.contributions ct join poolx.members m on m.id = ct.member_id
    where ct.pool_id = p.id and ct.status = 'CONFIRMED' and m.status = 'ACTIVE' for update of ct
  loop
    -- a member never pays more than they already paid (e.g. if withdrawals pushed membership back below a tier)
    v_unit := least(v_final, c.unit_price_paise);
    v_fee := poolx.fee_for(v_unit * c.quantity, p.platform_fee_bps);
    v_amount := v_unit * c.quantity + v_fee;
    if c.amount_paise > v_amount then
      insert into poolx.refunds (contribution_id, pool_id, user_id, amount_paise, reason, initiated_by, note)
      values (c.id, p.id, c.user_id, c.amount_paise - v_amount, 'PRICE_ADJUSTMENT', v_uid,
              'Final price was lower than the price paid at joining');
      v_adjustments := v_adjustments + 1;
    end if;
    insert into poolx.orders (pool_id, member_id, contribution_id, user_id, quantity, unit_price_paise, fee_paise, amount_paise)
    values (p.id, c.m_id, c.id, c.user_id, c.quantity, v_unit, v_fee, v_amount)
    returning id into v_order;
    perform ledger.post_journal('poolx', 'ORDER_CREATED', 'poolx.orders', v_order, 'poolx:order:' || v_order::text,
      jsonb_build_array(
        jsonb_build_object('account', 'poolx:contribution_liability', 'debit', v_amount, 'user_id', c.user_id),
        jsonb_build_object('account', 'poolx:seller_payable', 'credit', v_unit * c.quantity, 'user_id', c.user_id))
      || case when v_fee > 0 then jsonb_build_array(
        jsonb_build_object('account', 'poolx:platform_fee_revenue', 'credit', v_fee, 'user_id', c.user_id)) else '[]'::jsonb end);
    v_orders := v_orders + 1;
  end loop;

  if v_orders = 0 then
    raise exception 'NO_MEMBERS: no confirmed members to create orders for' using errcode = 'P0001';
  end if;
  update poolx.pools set status = 'LOCKED', locked_at = now(), final_unit_price_paise = v_final where id = p.id;
  perform core.write_audit('poolx.pool.lock', 'poolx', 'pools', p.id::text, null,
    jsonb_build_object('finalUnitPricePaise', v_final, 'orders', v_orders, 'priceAdjustments', v_adjustments), null);
  return jsonb_build_object('status', 'LOCKED', 'finalUnitPricePaise', v_final::text, 'orders', v_orders, 'priceAdjustments', v_adjustments);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fulfilment
-- ---------------------------------------------------------------------------
create or replace function api.poolx_admin_ship_order(p_order uuid, p_carrier text, p_tracking text, p_tracking_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.orders.manage'); o poolx.orders;
begin
  select * into o from poolx.orders where id = p_order for update;
  if o.id is null or o.status <> 'CREATED' then
    raise exception 'INVALID_STATE: only new orders can be shipped' using errcode = 'P0001';
  end if;
  insert into poolx.shipments (order_id, carrier, tracking_number, tracking_url, shipped_by)
  values (o.id, btrim(p_carrier), btrim(p_tracking), nullif(btrim(p_tracking_url), ''), v_uid);
  update poolx.orders set status = 'SHIPPED', shipped_at = now() where id = o.id;
  perform core.write_audit('poolx.order.ship', 'poolx', 'orders', o.id::text, null,
    jsonb_build_object('carrier', btrim(p_carrier)), null);
end;
$$;

create or replace function poolx.mark_delivered(o poolx.orders)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update poolx.orders set status = 'DELIVERED', delivered_at = now() where id = o.id;
  update poolx.members set status = 'FULFILLED' where id = o.member_id;
  perform poolx.maybe_complete_pool(o.pool_id);
end;
$$;

create or replace function api.poolx_confirm_delivery(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); o poolx.orders;
begin
  select * into o from poolx.orders where id = p_order and user_id = v_uid for update;
  if o.id is null then
    raise exception 'ORDER_NOT_FOUND: order not found' using errcode = 'P0001';
  end if;
  if o.status <> 'SHIPPED' then
    raise exception 'INVALID_STATE: only shipped orders can be confirmed' using errcode = 'P0001';
  end if;
  perform poolx.mark_delivered(o);
  perform core.write_audit('poolx.order.delivered_by_member', 'poolx', 'orders', o.id::text, null, null, null);
end;
$$;

create or replace function api.poolx_admin_mark_delivered(p_order uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.orders.manage'); o poolx.orders;
begin
  if coalesce(char_length(btrim(p_note)), 0) < 5 then
    raise exception 'NOTE_REQUIRED: record the delivery evidence (at least 5 characters)' using errcode = 'P0001';
  end if;
  select * into o from poolx.orders where id = p_order for update;
  if o.id is null or o.status <> 'SHIPPED' then
    raise exception 'INVALID_STATE: only shipped orders can be marked delivered' using errcode = 'P0001';
  end if;
  perform poolx.mark_delivered(o);
  perform core.write_audit('poolx.order.delivered_by_staff', 'poolx', 'orders', o.id::text, null, null, btrim(p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Disputes
-- ---------------------------------------------------------------------------
create or replace function api.poolx_open_dispute(p_order uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); o poolx.orders; v_id uuid;
begin
  select * into o from poolx.orders where id = p_order and user_id = v_uid for update;
  if o.id is null then
    raise exception 'ORDER_NOT_FOUND: order not found' using errcode = 'P0001';
  end if;
  if o.status not in ('CREATED', 'SHIPPED', 'DELIVERED') then
    raise exception 'INVALID_STATE: this order cannot be disputed' using errcode = 'P0001';
  end if;
  insert into poolx.disputes (order_id, user_id, reason, previous_order_status)
  values (o.id, v_uid, btrim(p_reason), o.status) returning id into v_id;
  update poolx.orders set status = 'DISPUTED' where id = o.id;
  perform core.write_audit('poolx.dispute.open', 'poolx', 'disputes', v_id::text, null, null, null);
  return v_id;
end;
$$;

/**
 * Resolve a dispute. NO_ACTION needs poolx.orders.manage and restores the previous order status. REFUND needs
 * poolx.refunds.manual, an amount (≤ what remains refundable on the contribution) and a note; it queues a MANUAL refund
 * that the worker sends to the provider.
 */
create or replace function api.poolx_admin_resolve_dispute(p_dispute uuid, p_decision text, p_refund_paise bigint, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_active_user(); d poolx.disputes; o poolx.orders; c poolx.contributions;
  v_refunded bigint; v_refund uuid;
begin
  if p_decision = 'REFUND' then
    perform core.require_permission('poolx.refunds.manual');
  elsif p_decision = 'NO_ACTION' then
    perform core.require_permission('poolx.orders.manage');
  else
    raise exception 'INVALID_DECISION: %', p_decision using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_note)), 0) < 10 then
    raise exception 'NOTE_REQUIRED: explain the decision (at least 10 characters)' using errcode = 'P0001';
  end if;
  select * into d from poolx.disputes where id = p_dispute for update;
  if d.id is null or d.status <> 'OPEN' then
    raise exception 'INVALID_STATE: dispute is not open' using errcode = 'P0001';
  end if;
  select * into o from poolx.orders where id = d.order_id for update;

  if p_decision = 'REFUND' then
    select * into c from poolx.contributions where id = o.contribution_id for update;
    select coalesce(sum(amount_paise), 0) into v_refunded from poolx.refunds where contribution_id = c.id;
    if p_refund_paise is null or p_refund_paise <= 0 or p_refund_paise > c.amount_paise - v_refunded then
      raise exception 'INVALID_AMOUNT: refund must be between 1 paisa and the % paise still refundable', c.amount_paise - v_refunded
        using errcode = 'P0001';
    end if;
    insert into poolx.refunds (contribution_id, pool_id, user_id, amount_paise, reason, initiated_by, note)
    values (c.id, o.pool_id, o.user_id, p_refund_paise, 'MANUAL', v_uid, btrim(p_note))
    returning id into v_refund;
    update poolx.disputes set status = 'RESOLVED_REFUND', refund_id = v_refund, resolution_note = btrim(p_note),
                              resolved_by = v_uid, resolved_at = now() where id = d.id;
    update poolx.orders set status = case when p_refund_paise = o.amount_paise then 'REFUNDED' else d.previous_order_status end
     where id = o.id;
  else
    update poolx.disputes set status = 'RESOLVED_NO_ACTION', resolution_note = btrim(p_note), resolved_by = v_uid, resolved_at = now()
     where id = d.id;
    update poolx.orders set status = d.previous_order_status where id = o.id;
  end if;
  perform poolx.maybe_complete_pool(o.pool_id);
  perform core.write_audit('poolx.dispute.resolve', 'poolx', 'disputes', d.id::text, null,
    jsonb_build_object('decision', p_decision, 'refundPaise', p_refund_paise), btrim(p_note));
  return jsonb_build_object('status', case when p_decision = 'REFUND' then 'RESOLVED_REFUND' else 'RESOLVED_NO_ACTION' end, 'refundId', v_refund);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
create or replace function api.poolx_admin_lifecycle(p_pool uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('poolx.pools.manage');
  return jsonb_build_object(
    'negotiations', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'offeredUnitPricePaise', n.offered_unit_price_paise::text, 'terms', n.terms, 'outcome', n.outcome,
        'createdAt', n.created_at, 'recordedBy', (select coalesce(display_name, email::text) from core.profiles where id = n.recorded_by))
        order by n.created_at) from poolx.negotiations n where n.pool_id = p_pool), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'member', coalesce(pr.display_name, 'Member ' || left(o.user_id::text, 8)), 'quantity', o.quantity,
        'unitPricePaise', o.unit_price_paise::text, 'amountPaise', o.amount_paise::text, 'status', o.status,
        'shipment', (select jsonb_build_object('carrier', s.carrier, 'trackingNumber', s.tracking_number) from poolx.shipments s where s.order_id = o.id))
        order by o.created_at) from poolx.orders o join core.profiles pr on pr.id = o.user_id where o.pool_id = p_pool), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'status', r.status, 'amountPaise', r.amount_paise::text))
        from poolx.refunds r where r.pool_id = p_pool), '[]'::jsonb)
  );
end;
$$;

create or replace function api.poolx_admin_list_disputes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (core.has_permission('poolx.orders.manage') or core.has_permission('poolx.refunds.manual')) then
    raise exception 'FORBIDDEN: missing permission' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'status', d.status, 'reason', d.reason, 'createdAt', d.created_at, 'resolutionNote', d.resolution_note,
      'orderId', o.id, 'orderStatus', o.status, 'orderAmountPaise', o.amount_paise::text, 'poolTitle', p.title, 'poolId', p.id,
      'refundablePaise', (c.amount_paise - coalesce((select sum(amount_paise) from poolx.refunds r where r.contribution_id = c.id), 0))::text)
      order by (d.status = 'OPEN') desc, d.created_at desc)
    from poolx.disputes d join poolx.orders o on o.id = d.order_id join poolx.pools p on p.id = o.pool_id
    join poolx.contributions c on c.id = o.contribution_id), '[]'::jsonb);
end;
$$;

-- Member activity now includes the order, shipment and any dispute for each membership.
create or replace function api.poolx_my_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user();
begin
  return jsonb_build_object(
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'poolId', p.id, 'slug', p.slug, 'title', p.title, 'poolStatus', p.status, 'deadlineAt', p.deadline_at,
        'memberStatus', m.status, 'quantity', m.quantity, 'unitLabel', p.unit_label,
        'currentUnitPricePaise', poolx.discounted_price(p.base_unit_price_paise, poolx.current_discount_bps(p.id))::text,
        'finalUnitPricePaise', p.final_unit_price_paise::text,
        'contributions', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'status', c.status, 'amountPaise', c.amount_paise::text, 'unitPricePaise', c.unit_price_paise::text,
            'feePaise', c.fee_paise::text, 'quantity', c.quantity, 'createdAt', c.created_at, 'confirmedAt', c.confirmed_at,
            'attemptId', c.payment_attempt_id) order by c.created_at desc)
          from poolx.contributions c where c.member_id = m.id), '[]'::jsonb),
        'order', (select jsonb_build_object(
            'id', o.id, 'status', o.status, 'amountPaise', o.amount_paise::text, 'unitPricePaise', o.unit_price_paise::text,
            'shippedAt', o.shipped_at, 'deliveredAt', o.delivered_at,
            'shipment', (select jsonb_build_object('carrier', s.carrier, 'trackingNumber', s.tracking_number, 'trackingUrl', s.tracking_url)
                         from poolx.shipments s where s.order_id = o.id),
            'dispute', (select jsonb_build_object('status', d.status, 'reason', d.reason, 'resolutionNote', d.resolution_note)
                        from poolx.disputes d where d.order_id = o.id order by d.created_at desc limit 1))
          from poolx.orders o where o.member_id = m.id)
      ) order by m.created_at desc)
      from poolx.members m join poolx.pools p on p.id = m.pool_id
      where m.user_id = v_uid), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'poolTitle', p.title, 'poolSlug', p.slug, 'amountPaise', r.amount_paise::text, 'reason', r.reason,
        'status', r.status, 'createdAt', r.created_at, 'refundedAt', r.refunded_at) order by r.created_at desc)
      from poolx.refunds r join poolx.pools p on p.id = r.pool_id
      where r.user_id = v_uid), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'status', q.status, 'createdAt', q.created_at,
                                          'reviewNote', q.review_note) order by q.created_at desc)
      from poolx.requests q where q.requester_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- Public pool JSON also exposes the locked final price.
create or replace function api.poolx_get_pool(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select poolx.pool_json(p, true) || jsonb_build_object('finalUnitPricePaise', p.final_unit_price_paise::text)
  from poolx.pools p
  where p.slug = p_slug and p.kind = 'PUBLIC'
    and p.status in ('ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED', 'CANCELLED', 'EXPIRED');
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function api.poolx_admin_close_joining(uuid) from public, anon;
revoke all on function api.poolx_admin_record_negotiation(uuid, bigint, text, text) from public, anon;
revoke all on function api.poolx_admin_lock(uuid) from public, anon;
revoke all on function api.poolx_admin_ship_order(uuid, text, text, text) from public, anon;
revoke all on function api.poolx_confirm_delivery(uuid) from public, anon;
revoke all on function api.poolx_admin_mark_delivered(uuid, text) from public, anon;
revoke all on function api.poolx_open_dispute(uuid, text) from public, anon;
revoke all on function api.poolx_admin_resolve_dispute(uuid, text, bigint, text) from public, anon;
revoke all on function api.poolx_admin_lifecycle(uuid) from public, anon;
revoke all on function api.poolx_admin_list_disputes() from public, anon;

grant execute on function api.poolx_admin_close_joining(uuid) to authenticated;
grant execute on function api.poolx_admin_record_negotiation(uuid, bigint, text, text) to authenticated;
grant execute on function api.poolx_admin_lock(uuid) to authenticated;
grant execute on function api.poolx_admin_ship_order(uuid, text, text, text) to authenticated;
grant execute on function api.poolx_confirm_delivery(uuid) to authenticated;
grant execute on function api.poolx_admin_mark_delivered(uuid, text) to authenticated;
grant execute on function api.poolx_open_dispute(uuid, text) to authenticated;
grant execute on function api.poolx_admin_resolve_dispute(uuid, text, bigint, text) to authenticated;
grant execute on function api.poolx_admin_lifecycle(uuid) to authenticated;
grant execute on function api.poolx_admin_list_disputes() to authenticated;
-- poolx_my_activity / poolx_get_pool keep their existing grants (create or replace preserves privileges).

-- ---------------------------------------------------------------------------
-- Integrity triggers must see every row. Deferred constraint triggers fire at COMMIT, outside the security-definer
-- function that wrote the rows, i.e. as the calling user — where RLS would hide ledger entries (false "unbalanced") or
-- other users' refunds (false "within paid"). Run them with definer rights.
-- ---------------------------------------------------------------------------
alter function ledger.check_journal_balanced() security definer;
alter function ledger.check_entry_domain() security definer;
alter function poolx.check_refund_total() security definer;
alter function poolx.check_tiers_monotonic() security definer;
revoke all on function ledger.check_journal_balanced() from public;
revoke all on function ledger.check_entry_domain() from public;
revoke all on function poolx.check_refund_total() from public;
revoke all on function poolx.check_tiers_monotonic() from public;
