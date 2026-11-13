-- 0008 — PoolX business logic, payment-event orchestration and the PoolX HTTP API.
-- Errors raised for callers use errcode P0001 and a message 'CODE: human text' that the server maps to UI copy.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function core.require_permission(p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user();
begin
  if not core.has_permission(p_permission) then
    raise exception 'FORBIDDEN: missing permission %', p_permission using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke all on function core.require_permission(text) from public;

-- ---------------------------------------------------------------------------
-- Pricing (mirrored exactly by src/modules/poolx/pricing.ts)
-- ---------------------------------------------------------------------------
-- unit price after a basis-point discount, rounding the discount half-up to the paisa
create or replace function poolx.discounted_price(p_base bigint, p_bps integer)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$ select p_base - ((p_base * p_bps + 5000) / 10000); $$;

-- fee on a subtotal, half-up to the paisa
create or replace function poolx.fee_for(p_subtotal bigint, p_bps integer)
returns bigint
language sql
immutable
strict
set search_path = ''
as $$ select (p_subtotal * p_bps + 5000) / 10000; $$;

-- live counts from ACTIVE memberships only (i.e. confirmed contributions)
create or replace function poolx.pool_stats(p_pool uuid, out active_members integer, out active_quantity integer)
language sql
stable
set search_path = ''
as $$
  select count(*)::int, coalesce(sum(quantity), 0)::int
  from poolx.members where pool_id = p_pool and status = 'ACTIVE';
$$;

create or replace function poolx.discount_bps_at(p_pool uuid, p_basis_value integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(max(discount_bps), 0) from poolx.discount_tiers where pool_id = p_pool and threshold <= p_basis_value;
$$;

create or replace function poolx.current_discount_bps(p_pool uuid)
returns integer
language plpgsql
stable
set search_path = ''
as $$
declare v_basis text; v_members int; v_qty int;
begin
  select tier_basis into v_basis from poolx.pools where id = p_pool;
  select active_members, active_quantity into v_members, v_qty from poolx.pool_stats(p_pool);
  return poolx.discount_bps_at(p_pool, case when v_basis = 'QUANTITY' then v_qty else v_members end);
end;
$$;

create or replace function poolx.is_joinable(p poolx.pools, p_active_members integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.status = 'ACTIVE' and now() >= p.starts_at and now() < p.deadline_at
     and (p.max_members is null or p_active_members < p.max_members);
$$;

-- Public representation of a pool. Money as strings (bigint-safe for JS).
create or replace function poolx.pool_json(p poolx.pools, p_detail boolean)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_members int; v_qty int; v_bps int; v_basis_value int; v_next record; v_result jsonb;
begin
  select active_members, active_quantity into v_members, v_qty from poolx.pool_stats(p.id);
  v_basis_value := case when p.tier_basis = 'QUANTITY' then v_qty else v_members end;
  v_bps := poolx.discount_bps_at(p.id, v_basis_value);
  select threshold, discount_bps into v_next
    from poolx.discount_tiers where pool_id = p.id and threshold > v_basis_value order by threshold limit 1;

  v_result := jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'title', p.title,
    'summary', p.summary,
    'productName', p.product_name,
    'status', p.status,
    'kind', p.kind,
    'category', (select jsonb_build_object('slug', c.slug, 'name', c.name) from poolx.categories c where c.id = p.category_id),
    'seller', (select jsonb_build_object('name', s.display_name, 'verified', s.verification_status = 'VERIFIED')
               from poolx.sellers s where s.id = p.seller_id),
    'unitLabel', p.unit_label,
    'baseUnitPricePaise', p.base_unit_price_paise::text,
    'currentUnitPricePaise', poolx.discounted_price(p.base_unit_price_paise, v_bps)::text,
    'currentDiscountBps', v_bps,
    'referencePricePaise', p.reference_price_paise::text,
    'referencePriceSource', p.reference_price_source,
    'tierBasis', p.tier_basis,
    'activeMembers', v_members,
    'activeQuantity', v_qty,
    'minMembers', p.min_members,
    'targetMembers', p.target_members,
    'maxMembers', p.max_members,
    'minQtyPerMember', p.min_qty_per_member,
    'maxQtyPerMember', p.max_qty_per_member,
    'platformFeeBps', p.platform_fee_bps,
    'startsAt', p.starts_at,
    'deadlineAt', p.deadline_at,
    'isJoinable', poolx.is_joinable(p, v_members),
    'nextTier', case when v_next.threshold is null then null else jsonb_build_object(
      'threshold', v_next.threshold, 'discountBps', v_next.discount_bps,
      'unitPricePaise', poolx.discounted_price(p.base_unit_price_paise, v_next.discount_bps)::text) end
  );
  if p_detail then
    v_result := v_result || jsonb_build_object(
      'description', p.description,
      'specs', p.specs,
      'withdrawalPolicy', p.withdrawal_policy,
      'terms', p.terms,
      'deliveryNote', p.delivery_note,
      'tiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'threshold', t.threshold, 'discountBps', t.discount_bps,
          'unitPricePaise', poolx.discounted_price(p.base_unit_price_paise, t.discount_bps)::text) order by t.threshold)
        from poolx.discount_tiers t where t.pool_id = p.id), '[]'::jsonb)
    );
  end if;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Domain reactions to payment events (called only by api.payments_process_event)
-- ---------------------------------------------------------------------------
create or replace function poolx.create_full_refund(p_contribution uuid, p_reason text, p_actor uuid, p_note text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare c poolx.contributions; v_id uuid;
begin
  select * into c from poolx.contributions where id = p_contribution for update;
  insert into poolx.refunds (contribution_id, pool_id, user_id, amount_paise, reason, initiated_by, note)
  values (c.id, c.pool_id, c.user_id, c.amount_paise, p_reason, p_actor, p_note)
  on conflict (contribution_id) where reason <> 'PRICE_ADJUSTMENT' do nothing
  returning id into v_id;
  update poolx.contributions set status = 'REFUND_PENDING' where id = c.id and status = 'CONFIRMED';
  return v_id;
end;
$$;

create or replace function poolx.on_contribution_captured(p_attempt uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare c poolx.contributions; m poolx.members; p poolx.pools; v_members int;
begin
  select * into c from poolx.contributions where payment_attempt_id = p_attempt for update;
  if c.id is null then
    return 'NO_CONTRIBUTION';
  end if;
  if c.status in ('CONFIRMED', 'REFUND_PENDING', 'REFUNDED') then
    return 'ALREADY_APPLIED';
  end if;
  select * into m from poolx.members where id = c.member_id for update;
  select * into p from poolx.pools where id = c.pool_id for update;
  select active_members into v_members from poolx.pool_stats(p.id);

  perform ledger.post_journal('poolx', 'CONTRIBUTION_CAPTURED', 'poolx.contributions', c.id, 'poolx:capture:' || p_attempt::text,
    jsonb_build_array(
      jsonb_build_object('account', 'poolx:gateway_clearing', 'debit', c.amount_paise, 'user_id', c.user_id),
      jsonb_build_object('account', 'poolx:contribution_liability', 'credit', c.amount_paise, 'user_id', c.user_id)));

  if c.status = 'PENDING' and m.status = 'PENDING_PAYMENT' and p.status = 'ACTIVE' and now() < p.deadline_at
     and (p.max_members is null or v_members < p.max_members) then
    update poolx.contributions set status = 'CONFIRMED', confirmed_at = now() where id = c.id;
    update poolx.members set status = 'ACTIVE', activated_at = now(), quantity = c.quantity where id = m.id;
    return 'CONTRIBUTION_CONFIRMED';
  end if;

  -- Captured after the member withdrew, the attempt expired, or the pool closed/filled: money must go back.
  update poolx.contributions set status = 'REFUND_PENDING', confirmed_at = coalesce(confirmed_at, now()) where id = c.id;
  insert into poolx.refunds (contribution_id, pool_id, user_id, amount_paise, reason, note)
  values (c.id, c.pool_id, c.user_id, c.amount_paise, 'LATE_CAPTURE', 'Payment confirmed after it could be applied to the pool')
  on conflict (contribution_id) where reason <> 'PRICE_ADJUSTMENT' do nothing;
  return 'LATE_CAPTURE_REFUND';
end;
$$;

create or replace function poolx.on_contribution_failed(p_attempt uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  update poolx.contributions set status = 'FAILED' where payment_attempt_id = p_attempt and status = 'PENDING';
  return case when found then 'CONTRIBUTION_FAILED' else 'NO_CHANGE' end;
end;
$$;

-- Applies a provider refund outcome to a PoolX refund row (idempotent).
create or replace function poolx.apply_refund_result(
  p_refund uuid, p_status text, p_provider_refund_id text, p_error text, p_retryable boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare r poolx.refunds; v_backoff interval;
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
    if r.reason <> 'PRICE_ADJUSTMENT' then
      update poolx.contributions set status = 'REFUNDED' where id = r.contribution_id;
    end if;
    perform ledger.post_journal('poolx', 'CONTRIBUTION_REFUNDED', 'poolx.refunds', r.id, 'poolx:refund:' || r.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'poolx:contribution_liability', 'debit', r.amount_paise, 'user_id', r.user_id),
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

-- ---------------------------------------------------------------------------
-- Payments orchestration (service role only)
-- ---------------------------------------------------------------------------
create or replace function api.payments_attach_order(p_attempt uuid, p_provider text, p_provider_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a core.payment_attempts;
begin
  select * into a from core.payment_attempts where id = p_attempt for update;
  if a.id is null then
    raise exception 'NOT_FOUND: payment attempt' using errcode = 'P0001';
  end if;
  if a.status = 'PENDING' and a.provider = p_provider and a.provider_order_id = p_provider_order_id then
    return jsonb_build_object('status', a.status);                              -- idempotent repeat
  end if;
  if a.status <> 'CREATED' then
    raise exception 'INVALID_STATE: attempt is %', a.status using errcode = 'P0001';
  end if;
  update core.payment_attempts set provider = p_provider, provider_order_id = p_provider_order_id, status = 'PENDING'
   where id = a.id;
  return jsonb_build_object('status', 'PENDING');
end;
$$;

/**
 * Single entry point for verified provider webhooks. The caller (server) has already verified the signature.
 * Idempotent: a repeated provider event id is recorded once and returns 'DUPLICATE' with no state change.
 */
create or replace function api.payments_process_event(
  p_provider text, p_event_id text, p_type text, p_order_id text, p_payment_id text,
  p_amount_paise bigint, p_currency text, p_refund_id text, p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_event_id bigint; a core.payment_attempts; v_result text; v_refund uuid;
begin
  insert into core.payment_webhook_events (provider, provider_event_id, event_type, provider_order_id, provider_payment_id, payload)
  values (p_provider, p_event_id, p_type, p_order_id, p_payment_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return 'DUPLICATE';
  end if;

  if p_type in ('payment.captured', 'payment.failed') then
    select * into a from core.payment_attempts where provider = p_provider and provider_order_id = p_order_id for update;
    if a.id is null then
      v_result := 'UNKNOWN_ORDER';
    elsif p_type = 'payment.captured' then
      if p_amount_paise is distinct from a.amount_paise or upper(coalesce(p_currency, '')) <> a.currency then
        v_result := 'AMOUNT_MISMATCH';                     -- never apply; flagged for finance review
        perform core.write_audit('payment.amount_mismatch', 'core', 'payment_attempts', a.id::text, null,
          jsonb_build_object('expected', a.amount_paise, 'received', p_amount_paise, 'currency', p_currency), null);
      elsif a.status = 'CAPTURED' then
        v_result := 'ALREADY_CAPTURED';
      elsif a.status = 'REVERSED' then
        v_result := 'IGNORED_REVERSED';
      else
        update core.payment_attempts
           set status = 'CAPTURED', captured_at = now(), provider_payment_id = p_payment_id, failure_code = null
         where id = a.id;
        v_result := case a.purpose
          when 'POOL_CONTRIBUTION' then poolx.on_contribution_captured(a.id)
          else 'NO_HANDLER_' || a.purpose end;
      end if;
    else -- payment.failed
      if a.status in ('CREATED', 'PENDING') then
        update core.payment_attempts set status = 'FAILED', failure_code = left(p_payload ->> 'failure_code', 100) where id = a.id;
        v_result := case a.purpose when 'POOL_CONTRIBUTION' then poolx.on_contribution_failed(a.id) else 'NO_HANDLER' end;
      else
        v_result := 'IGNORED_' || a.status;
      end if;
    end if;
  elsif p_type in ('refund.processed', 'refund.failed') then
    select id into v_refund from poolx.refunds where provider_refund_id = p_refund_id;
    if v_refund is null then
      v_result := 'UNKNOWN_REFUND';
    else
      v_result := poolx.apply_refund_result(v_refund, case p_type when 'refund.processed' then 'PROCESSED' else 'FAILED' end,
                                             p_refund_id, p_payload ->> 'error', true);
    end if;
  else
    v_result := 'IGNORED_TYPE';
  end if;

  update core.payment_webhook_events set processed_at = now(), result = v_result where id = v_event_id;
  return v_result;
end;
$$;

-- Refund worker: claims refunds to send to the provider (marks REFUND_INITIATED before any provider call).
create or replace function api.poolx_claim_refunds(p_limit integer)
returns table (refund_id uuid, amount_paise bigint, provider text, provider_payment_id text, idempotency_key text, attempt_no integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select r.id from poolx.refunds r
    where r.status = 'REFUND_ELIGIBLE' or (r.status = 'REFUND_FAILED' and r.retryable and r.next_retry_at <= now())
    order by r.created_at
    limit least(greatest(p_limit, 1), 50)
    for update skip locked
  ), upd as (
    update poolx.refunds r set status = 'REFUND_INITIATED', attempts = r.attempts + 1
    from picked where r.id = picked.id
    returning r.id, r.amount_paise, r.contribution_id, r.attempts
  )
  select upd.id, upd.amount_paise, a.provider, a.provider_payment_id, 'poolx-refund:' || upd.id::text, upd.attempts
  from upd
  join poolx.contributions c on c.id = upd.contribution_id
  join core.payment_attempts a on a.id = c.payment_attempt_id;
end;
$$;

create or replace function api.poolx_record_refund_result(
  p_refund uuid, p_status text, p_provider_refund_id text, p_error text, p_retryable boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_result text; r poolx.refunds;
begin
  select * into r from poolx.refunds where id = p_refund;
  v_result := poolx.apply_refund_result(p_refund, p_status, p_provider_refund_id, p_error, p_retryable);
  if r.id is not null then
    insert into core.provider_refunds (payment_attempt_id, domain, domain_refund_id, idempotency_key, amount_paise,
                                       provider_refund_id, status, last_error)
    select c.payment_attempt_id, 'poolx', r.id, 'poolx-refund:' || r.id::text, r.amount_paise, p_provider_refund_id,
           case p_status when 'PROCESSED' then 'PROCESSED' when 'PROCESSING' then 'PROCESSING' else 'FAILED' end, left(p_error, 500)
    from poolx.contributions c where c.id = r.contribution_id
    on conflict (idempotency_key) do update
      set provider_refund_id = coalesce(excluded.provider_refund_id, core.provider_refunds.provider_refund_id),
          status = excluded.status, last_error = excluded.last_error;
  end if;
  return v_result;
end;
$$;

-- Deadline processing: pools past their deadline either reach THRESHOLD_MET or EXPIRE with full refunds.
create or replace function api.poolx_close_due_pools()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare p poolx.pools; v_members int; v_count int := 0; c record;
begin
  for p in select * from poolx.pools where status = 'ACTIVE' and deadline_at <= now() for update skip locked loop
    select active_members into v_members from poolx.pool_stats(p.id);
    if v_members >= p.min_members then
      update poolx.pools set status = 'THRESHOLD_MET' where id = p.id;
    else
      update poolx.pools set status = 'EXPIRED', closed_at = now(), close_reason = 'Minimum members not reached by the deadline'
       where id = p.id;
      for c in select ct.id from poolx.contributions ct where ct.pool_id = p.id and ct.status = 'CONFIRMED' loop
        perform poolx.create_full_refund(c.id, 'POOL_EXPIRED', null);
      end loop;
      update poolx.contributions set status = 'EXPIRED' where pool_id = p.id and status = 'PENDING';
      update core.payment_attempts a set status = 'EXPIRED'
        from poolx.contributions ct where ct.pool_id = p.id and ct.payment_attempt_id = a.id and a.status in ('CREATED', 'PENDING');
    end if;
    perform core.write_audit('poolx.pool.deadline', 'poolx', 'pools', p.id::text, null, jsonb_build_object('members', v_members), null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API (anon + authenticated)
-- ---------------------------------------------------------------------------
create or replace function api.poolx_list_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'description', description) order by sort, name), '[]'::jsonb)
  from poolx.categories where is_active;
$$;

create or replace function api.poolx_list_pools(p_search text, p_category text, p_sort text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 12), 1), 48);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(left(p_search, 100)), '');
  v_sort text := coalesce(p_sort, 'ending');
  v_total int;
  v_items jsonb;
begin
  with f as (
    select p.id, p.status = 'ACTIVE' as is_open, p.deadline_at, p.published_at,
           (select count(*)::int from poolx.members m where m.pool_id = p.id and m.status = 'ACTIVE') as n
    from poolx.pools p
    join poolx.categories c on c.id = p.category_id
    where p.kind = 'PUBLIC'
      and p.status in ('ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED')
      and (p_category is null or c.slug = p_category)
      and (v_search is null
           or to_tsvector('simple', coalesce(p.title, '') || ' ' || coalesce(p.product_name, '') || ' ' || coalesce(p.summary, ''))
              @@ plainto_tsquery('simple', v_search)
           or strpos(lower(p.title), lower(v_search)) > 0
           or strpos(lower(p.product_name), lower(v_search)) > 0)
  ), s as (
    select f.id, row_number() over (order by
             (not f.is_open),
             case when v_sort = 'ending' then f.deadline_at end asc,
             case when v_sort = 'popular' then f.n end desc,
             case when v_sort = 'newest' then f.published_at end desc,
             f.deadline_at asc, f.id) as rn
    from f
  )
  select (select count(*)::int from f),
         coalesce((select jsonb_agg(poolx.pool_json(p, false) order by s.rn)
                   from s join poolx.pools p on p.id = s.id
                   where s.rn > v_offset and s.rn <= v_offset + v_limit), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
end;
$$;

-- Live public counters for the PoolX home page (real data only).
create or replace function api.poolx_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'openPools', (select count(*) from poolx.pools p where p.kind = 'PUBLIC' and p.status = 'ACTIVE' and p.deadline_at > now()),
    'activeMembers', (select count(*) from poolx.members m join poolx.pools p on p.id = m.pool_id
                        where m.status = 'ACTIVE' and p.kind = 'PUBLIC' and p.status = 'ACTIVE'));
$$;

create or replace function api.poolx_get_pool(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select poolx.pool_json(p, true)
  from poolx.pools p
  where p.slug = p_slug and p.kind = 'PUBLIC'
    and p.status in ('ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED', 'CANCELLED', 'EXPIRED');
$$;

-- ---------------------------------------------------------------------------
-- Member API (authenticated)
-- ---------------------------------------------------------------------------
create or replace function api.poolx_start_contribution(p_pool uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_active_user();
  p poolx.pools; m poolx.members; c poolx.contributions; a core.payment_attempts;
  v_members int; v_bps int; v_unit bigint; v_fee bigint; v_amount bigint; v_contribution uuid; v_attempt uuid;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null or p.kind <> 'PUBLIC' then
    raise exception 'POOL_NOT_FOUND: pool not found' using errcode = 'P0001';
  end if;
  select active_members into v_members from poolx.pool_stats(p.id);
  if not poolx.is_joinable(p, v_members) then
    raise exception 'POOL_NOT_JOINABLE: this pool is not open for new members' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < p.min_qty_per_member or p_quantity > p.max_qty_per_member then
    raise exception 'INVALID_QUANTITY: choose between % and %', p.min_qty_per_member, p.max_qty_per_member using errcode = 'P0001';
  end if;
  if exists (select 1 from poolx.sellers s where s.id = p.seller_id and s.profile_id = v_uid) then
    raise exception 'SELLER_CANNOT_JOIN: sellers cannot join their own pool' using errcode = 'P0001';
  end if;

  select * into m from poolx.members where pool_id = p.id and user_id = v_uid for update;
  if m.id is not null then
    if m.status = 'ACTIVE' then
      return jsonb_build_object('status', 'ALREADY_MEMBER');
    elsif m.status in ('REMOVED', 'FULFILLED') then
      raise exception 'NOT_ALLOWED: you cannot rejoin this pool' using errcode = 'P0001';
    end if;
    -- PENDING_PAYMENT: reuse a still-valid attempt for the same quantity (no duplicate charge)
    select * into c from poolx.contributions where member_id = m.id and status = 'PENDING' for update;
    if c.id is not null then
      select * into a from core.payment_attempts where id = c.payment_attempt_id for update;
      if a.status in ('CREATED', 'PENDING') and a.expires_at > now() and c.quantity = p_quantity then
        return jsonb_build_object('status', 'PENDING', 'attemptId', a.id, 'amountPaise', a.amount_paise::text,
                                  'hasOrder', a.provider_order_id is not null);
      end if;
      update poolx.contributions set status = 'EXPIRED' where id = c.id;
      update core.payment_attempts set status = 'EXPIRED' where id = a.id and status in ('CREATED', 'PENDING');
    end if;
    update poolx.members set status = 'PENDING_PAYMENT', quantity = p_quantity, withdrawn_at = null where id = m.id;
  else
    insert into poolx.members (pool_id, user_id, quantity) values (p.id, v_uid, p_quantity) returning * into m;
  end if;

  -- price is computed here, server-side, from confirmed membership only
  v_bps := poolx.current_discount_bps(p.id);
  v_unit := poolx.discounted_price(p.base_unit_price_paise, v_bps);
  v_fee := poolx.fee_for(v_unit * p_quantity, p.platform_fee_bps);
  v_amount := v_unit * p_quantity + v_fee;

  v_contribution := gen_random_uuid();
  insert into core.payment_attempts (domain, purpose, reference_id, user_id, amount_paise)
  values ('poolx', 'POOL_CONTRIBUTION', v_contribution, v_uid, v_amount)
  returning id into v_attempt;
  insert into poolx.contributions (id, member_id, pool_id, user_id, quantity, unit_price_paise, fee_paise, amount_paise,
                                   discount_bps_at_join, payment_attempt_id)
  values (v_contribution, m.id, p.id, v_uid, p_quantity, v_unit, v_fee, v_amount, v_bps, v_attempt);

  return jsonb_build_object('status', 'NEW', 'attemptId', v_attempt, 'amountPaise', v_amount::text, 'hasOrder', false);
end;
$$;

create or replace function api.poolx_withdraw(p_pool uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); p poolx.pools; m poolx.members; c poolx.contributions; v_refund uuid;
begin
  select * into p from poolx.pools where id = p_pool for update;
  select * into m from poolx.members where pool_id = p_pool and user_id = v_uid for update;
  if m.id is null or m.status not in ('ACTIVE', 'PENDING_PAYMENT') then
    raise exception 'NOT_A_MEMBER: you are not in this pool' using errcode = 'P0001';
  end if;
  if m.status = 'ACTIVE' then
    if p.status <> 'ACTIVE' then
      raise exception 'WITHDRAWAL_CLOSED: withdrawals close when the pool stops accepting members' using errcode = 'P0001';
    end if;
    select * into c from poolx.contributions where member_id = m.id and status = 'CONFIRMED' for update;
    v_refund := poolx.create_full_refund(c.id, 'MEMBER_WITHDRAWAL', v_uid);
  else
    update core.payment_attempts a set status = 'EXPIRED'
      from poolx.contributions ct
     where ct.member_id = m.id and ct.status = 'PENDING' and a.id = ct.payment_attempt_id and a.status in ('CREATED', 'PENDING');
    update poolx.contributions set status = 'EXPIRED' where member_id = m.id and status = 'PENDING';
  end if;
  update poolx.members set status = 'WITHDRAWN', withdrawn_at = now() where id = m.id;
  perform core.write_audit('poolx.member.withdraw', 'poolx', 'members', m.id::text, null, null, null);
  return jsonb_build_object('status', 'WITHDRAWN', 'refundId', v_refund);
end;
$$;

create or replace function api.poolx_my_membership(p_pool uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', m.status, 'quantity', m.quantity,
    'contribution', (select jsonb_build_object('status', c.status, 'amountPaise', c.amount_paise::text,
                                               'unitPricePaise', c.unit_price_paise::text, 'attemptId', c.payment_attempt_id)
                     from poolx.contributions c where c.member_id = m.id order by c.created_at desc limit 1))
  from poolx.members m where m.pool_id = p_pool and m.user_id = auth.uid();
$$;

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
        'contributions', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'status', c.status, 'amountPaise', c.amount_paise::text, 'unitPricePaise', c.unit_price_paise::text,
            'feePaise', c.fee_paise::text, 'quantity', c.quantity, 'createdAt', c.created_at, 'confirmedAt', c.confirmed_at,
            'attemptId', c.payment_attempt_id) order by c.created_at desc)
          from poolx.contributions c where c.member_id = m.id), '[]'::jsonb)
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

-- The signed-in user's own payment attempt (for the checkout page). Never another user's.
create or replace function api.payments_get_my_attempt(p_attempt uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'domain', a.domain, 'purpose', a.purpose, 'amountPaise', a.amount_paise::text, 'currency', a.currency,
    'status', a.status, 'provider', a.provider, 'providerOrderId', a.provider_order_id, 'expiresAt', a.expires_at,
    'pool', case when a.purpose = 'POOL_CONTRIBUTION' then (
      select jsonb_build_object('slug', p.slug, 'title', p.title, 'quantity', c.quantity, 'unitLabel', p.unit_label)
      from poolx.contributions c join poolx.pools p on p.id = c.pool_id where c.id = a.reference_id) end)
  from core.payment_attempts a
  where a.id = p_attempt and a.user_id = auth.uid();
$$;

create or replace function api.poolx_submit_request(
  p_title text, p_product text, p_description text, p_category_slug text, p_estimated_quantity integer,
  p_target_participants integer, p_expected_unit_price_paise bigint, p_specifications text, p_preferred_seller text,
  p_delivery_location text, p_needed_by date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); v_id uuid; v_open int;
begin
  select count(*) into v_open from poolx.requests where requester_id = v_uid and status in ('SUBMITTED', 'UNDER_REVIEW');
  if v_open >= 5 then
    raise exception 'TOO_MANY_OPEN_REQUESTS: you already have 5 requests under review' using errcode = 'P0001';
  end if;
  insert into poolx.requests (requester_id, title, product, description, category_id, estimated_quantity, target_participants,
                              expected_unit_price_paise, specifications, preferred_seller, delivery_location, needed_by)
  values (v_uid, btrim(p_title), btrim(p_product), btrim(p_description),
          (select id from poolx.categories where slug = p_category_slug and is_active),
          p_estimated_quantity, p_target_participants, p_expected_unit_price_paise, nullif(btrim(p_specifications), ''),
          nullif(btrim(p_preferred_seller), ''), btrim(p_delivery_location), p_needed_by)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff API (permission-checked inside; staff permissions require aal2)
-- ---------------------------------------------------------------------------
create or replace function api.poolx_admin_list_pools()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('poolx.pools.manage');
  return coalesce((select jsonb_agg(poolx.pool_json(p, false) || jsonb_build_object('updatedAt', p.updated_at)
                                    order by p.updated_at desc) from poolx.pools p), '[]'::jsonb);
end;
$$;

create or replace function api.poolx_admin_get_pool(p_pool uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform core.require_permission('poolx.pools.manage');
  select poolx.pool_json(p, true) || jsonb_build_object(
      'categoryId', p.category_id, 'sellerId', p.seller_id, 'closeReason', p.close_reason,
      'pendingMembers', (select count(*) from poolx.members m where m.pool_id = p.id and m.status = 'PENDING_PAYMENT'),
      'refundsOpen', (select count(*) from poolx.refunds r where r.pool_id = p.id and r.status <> 'REFUNDED'))
    into v
  from poolx.pools p where p.id = p_pool;
  return v;
end;
$$;

create or replace function api.poolx_admin_save_pool(p_pool uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); v_id uuid; v_status text; v_before jsonb;
begin
  if p_pool is null then
    insert into poolx.pools (slug, title, summary, description, product_name, specs, category_id, seller_id, unit_label,
      base_unit_price_paise, reference_price_paise, reference_price_source, tier_basis, min_qty_per_member, max_qty_per_member,
      min_members, target_members, max_members, platform_fee_bps, withdrawal_policy, terms, delivery_note, starts_at, deadline_at,
      created_by)
    values (p ->> 'slug', p ->> 'title', p ->> 'summary', coalesce(p ->> 'description', ''), p ->> 'productName',
      coalesce(p -> 'specs', '[]'::jsonb), (select id from poolx.categories where slug = p ->> 'categorySlug'), nullif(p ->> 'sellerId', '')::uuid,
      coalesce(nullif(p ->> 'unitLabel', ''), 'unit'), (p ->> 'baseUnitPricePaise')::bigint,
      nullif(p ->> 'referencePricePaise', '')::bigint, nullif(p ->> 'referencePriceSource', ''),
      coalesce(p ->> 'tierBasis', 'MEMBERS'), (p ->> 'minQtyPerMember')::int, (p ->> 'maxQtyPerMember')::int,
      (p ->> 'minMembers')::int, (p ->> 'targetMembers')::int, nullif(p ->> 'maxMembers', '')::int,
      coalesce((p ->> 'platformFeeBps')::int, 0),
      coalesce(nullif(p ->> 'withdrawalPolicy', ''), 'You can withdraw while the pool is open; your full contribution is refunded.'),
      coalesce(p ->> 'terms', ''), nullif(p ->> 'deliveryNote', ''),
      coalesce((p ->> 'startsAt')::timestamptz, now()), (p ->> 'deadlineAt')::timestamptz, v_uid)
    returning id into v_id;
    perform core.write_audit('poolx.pool.create', 'poolx', 'pools', v_id::text, null, p, null);
    return v_id;
  end if;

  select status, to_jsonb(x) into v_status, v_before from poolx.pools x where id = p_pool for update;
  if v_status is null then
    raise exception 'POOL_NOT_FOUND: pool not found' using errcode = 'P0001';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'NOT_EDITABLE: only draft pools can be edited' using errcode = 'P0001';
  end if;
  update poolx.pools set
    slug = p ->> 'slug', title = p ->> 'title', summary = p ->> 'summary', description = coalesce(p ->> 'description', ''),
    product_name = p ->> 'productName', specs = coalesce(p -> 'specs', '[]'::jsonb), category_id = (select id from poolx.categories where slug = p ->> 'categorySlug'),
    seller_id = nullif(p ->> 'sellerId', '')::uuid, unit_label = coalesce(nullif(p ->> 'unitLabel', ''), 'unit'),
    base_unit_price_paise = (p ->> 'baseUnitPricePaise')::bigint,
    reference_price_paise = nullif(p ->> 'referencePricePaise', '')::bigint,
    reference_price_source = nullif(p ->> 'referencePriceSource', ''), tier_basis = coalesce(p ->> 'tierBasis', 'MEMBERS'),
    min_qty_per_member = (p ->> 'minQtyPerMember')::int, max_qty_per_member = (p ->> 'maxQtyPerMember')::int,
    min_members = (p ->> 'minMembers')::int, target_members = (p ->> 'targetMembers')::int,
    max_members = nullif(p ->> 'maxMembers', '')::int, platform_fee_bps = coalesce((p ->> 'platformFeeBps')::int, 0),
    withdrawal_policy = coalesce(nullif(p ->> 'withdrawalPolicy', ''), withdrawal_policy), terms = coalesce(p ->> 'terms', ''),
    delivery_note = nullif(p ->> 'deliveryNote', ''), starts_at = coalesce((p ->> 'startsAt')::timestamptz, starts_at),
    deadline_at = (p ->> 'deadlineAt')::timestamptz
  where id = p_pool;
  perform core.write_audit('poolx.pool.update', 'poolx', 'pools', p_pool::text, v_before, p, null);
  return p_pool;
end;
$$;

create or replace function api.poolx_admin_set_tiers(p_pool uuid, p_tiers jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.tiers.manage'); v_status text; v_n int;
begin
  select status into v_status from poolx.pools where id = p_pool for update;
  if v_status is distinct from 'DRAFT' then
    raise exception 'NOT_EDITABLE: tiers can only change while the pool is a draft' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) > 10 then
    raise exception 'INVALID_TIERS: provide up to 10 tiers' using errcode = 'P0001';
  end if;
  delete from poolx.discount_tiers where pool_id = p_pool;
  insert into poolx.discount_tiers (pool_id, threshold, discount_bps)
  select p_pool, (t ->> 'threshold')::int, (t ->> 'discountBps')::int from jsonb_array_elements(p_tiers) t;
  get diagnostics v_n = row_count;
  perform core.write_audit('poolx.tiers.set', 'poolx', 'pools', p_pool::text, null, p_tiers, null);
  return v_n;
end;
$$;

create or replace function api.poolx_admin_publish(p_pool uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); p poolx.pools;
begin
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null or p.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: only draft pools can be published' using errcode = 'P0001';
  end if;
  if p.deadline_at <= now() + interval '1 hour' then
    raise exception 'DEADLINE_TOO_SOON: the deadline must be at least an hour away' using errcode = 'P0001';
  end if;
  update poolx.pools set status = 'ACTIVE', published_at = now() where id = p.id;
  perform core.write_audit('poolx.pool.publish', 'poolx', 'pools', p.id::text, null, null, null);
  return jsonb_build_object('status', 'ACTIVE');
end;
$$;

create or replace function api.poolx_admin_cancel(p_pool uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); p poolx.pools; c record; v_refunds int := 0;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED: give a reason (at least 5 characters)' using errcode = 'P0001';
  end if;
  select * into p from poolx.pools where id = p_pool for update;
  if p.id is null or p.status not in ('DRAFT', 'ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING') then
    raise exception 'INVALID_STATE: this pool can no longer be cancelled' using errcode = 'P0001';
  end if;
  update poolx.pools set status = 'CANCELLED', closed_at = now(), close_reason = btrim(p_reason),
                         published_at = coalesce(published_at, now())
   where id = p.id;
  for c in select id from poolx.contributions where pool_id = p.id and status = 'CONFIRMED' for update loop
    perform poolx.create_full_refund(c.id, 'POOL_CANCELLED', v_uid, btrim(p_reason));
    v_refunds := v_refunds + 1;
  end loop;
  update core.payment_attempts a set status = 'EXPIRED'
    from poolx.contributions ct where ct.pool_id = p.id and ct.status = 'PENDING' and a.id = ct.payment_attempt_id
     and a.status in ('CREATED', 'PENDING');
  update poolx.contributions set status = 'EXPIRED' where pool_id = p.id and status = 'PENDING';
  perform core.write_audit('poolx.pool.cancel', 'poolx', 'pools', p.id::text, null, jsonb_build_object('refunds', v_refunds), btrim(p_reason));
  return jsonb_build_object('status', 'CANCELLED', 'refunds', v_refunds);
end;
$$;

create or replace function api.poolx_admin_list_sellers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (core.has_permission('poolx.pools.manage') or core.has_permission('sellers.manage')) then
    raise exception 'FORBIDDEN: missing permission' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'verificationStatus', verification_status,
                                                       'verifiedAt', verified_at) order by display_name)
                   from poolx.sellers), '[]'::jsonb);
end;
$$;

create or replace function api.poolx_admin_create_seller(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.pools.manage'); v_id uuid;
begin
  insert into poolx.sellers (display_name, created_by) values (btrim(p_name), v_uid) returning id into v_id;
  perform core.write_audit('poolx.seller.create', 'poolx', 'sellers', v_id::text, null, jsonb_build_object('name', btrim(p_name)), null);
  return v_id;
end;
$$;

-- Verification is a documented manual decision by someone with sellers.manage (never automatic).
create or replace function api.poolx_admin_verify_seller(p_seller uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('sellers.manage');
begin
  if coalesce(char_length(btrim(p_note)), 0) < 10 then
    raise exception 'NOTE_REQUIRED: record how the seller was verified (at least 10 characters)' using errcode = 'P0001';
  end if;
  update poolx.sellers set verification_status = 'VERIFIED', verified_by = v_uid, verified_at = now(),
                           verification_note = btrim(p_note)
   where id = p_seller;
  perform core.write_audit('poolx.seller.verify', 'poolx', 'sellers', p_seller::text, null, null, btrim(p_note));
end;
$$;

create or replace function api.poolx_admin_list_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('poolx.requests.review');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'title', q.title, 'product', q.product, 'description', q.description, 'status', q.status,
      'category', (select name from poolx.categories c where c.id = q.category_id),
      'estimatedQuantity', q.estimated_quantity, 'targetParticipants', q.target_participants,
      'expectedUnitPricePaise', q.expected_unit_price_paise::text, 'deliveryLocation', q.delivery_location,
      'neededBy', q.needed_by, 'createdAt', q.created_at, 'reviewNote', q.review_note) order by q.created_at desc)
    from poolx.requests q), '[]'::jsonb);
end;
$$;

create or replace function api.poolx_admin_review_request(p_request uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('poolx.requests.review');
begin
  if p_decision not in ('UNDER_REVIEW', 'APPROVED', 'REJECTED') then
    raise exception 'INVALID_DECISION: %', p_decision using errcode = 'P0001';
  end if;
  update poolx.requests set status = p_decision, review_note = nullif(btrim(p_note), ''), reviewed_by = v_uid, reviewed_at = now()
   where id = p_request and status in ('SUBMITTED', 'UNDER_REVIEW');
  if not found then
    raise exception 'INVALID_STATE: request already decided' using errcode = 'P0001';
  end if;
  perform core.write_audit('poolx.request.review', 'poolx', 'requests', p_request::text, null,
                           jsonb_build_object('decision', p_decision), nullif(btrim(p_note), ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  -- everything in api starts closed
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'api' and p.proname like any (array['poolx_%', 'payments_%']) loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end$$;

grant execute on function api.poolx_list_categories() to anon, authenticated;
grant execute on function api.poolx_list_pools(text, text, text, integer, integer) to anon, authenticated;
grant execute on function api.poolx_get_pool(text) to anon, authenticated;
grant execute on function api.poolx_public_stats() to anon, authenticated;

grant execute on function api.poolx_start_contribution(uuid, integer) to authenticated;
grant execute on function api.poolx_withdraw(uuid) to authenticated;
grant execute on function api.poolx_my_membership(uuid) to authenticated;
grant execute on function api.poolx_my_activity() to authenticated;
grant execute on function api.payments_get_my_attempt(uuid) to authenticated;
grant execute on function api.poolx_submit_request(text, text, text, text, integer, integer, bigint, text, text, text, date) to authenticated;

grant execute on function api.poolx_admin_list_pools() to authenticated;
grant execute on function api.poolx_admin_get_pool(uuid) to authenticated;
grant execute on function api.poolx_admin_save_pool(uuid, jsonb) to authenticated;
grant execute on function api.poolx_admin_set_tiers(uuid, jsonb) to authenticated;
grant execute on function api.poolx_admin_publish(uuid) to authenticated;
grant execute on function api.poolx_admin_cancel(uuid, text) to authenticated;
grant execute on function api.poolx_admin_list_sellers() to authenticated;
grant execute on function api.poolx_admin_create_seller(text) to authenticated;
grant execute on function api.poolx_admin_verify_seller(uuid, text) to authenticated;
grant execute on function api.poolx_admin_list_requests() to authenticated;
grant execute on function api.poolx_admin_review_request(uuid, text, text) to authenticated;

grant execute on function api.payments_attach_order(uuid, text, text) to service_role;
grant execute on function api.payments_process_event(text, text, text, text, text, bigint, text, text, jsonb) to service_role;
grant execute on function api.poolx_claim_refunds(integer) to service_role;
grant execute on function api.poolx_record_refund_result(uuid, text, text, text, boolean) to service_role;
grant execute on function api.poolx_close_due_pools() to service_role;
