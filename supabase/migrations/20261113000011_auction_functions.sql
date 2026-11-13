-- 0011 — Auction business logic: deposits, bidding, closing, refunds, invoices, default review, and the HTTP API.
-- Errors for callers: errcode P0001, message 'CODE: text'.

-- ---------------------------------------------------------------------------
-- Deposit amount (§7.1): FIXED paise or PERCENT_OF_STARTING (bps, rounded UP to the whole rupee), clamped to the
-- configured global minimum (required, > 0) and optional maximum. Never zero.
-- ---------------------------------------------------------------------------
create or replace function auction.compute_deposit(p_mode text, p_value bigint, p_starting bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_min bigint; v_max bigint; v_amount bigint;
begin
  v_min := (core.setting('auction.deposit.global_min_paise'))::text::bigint;
  if v_min is null or v_min <= 0 then
    raise exception 'DEPOSIT_POLICY_NOT_CONFIGURED: set auction.deposit.global_min_paise before publishing auctions' using errcode = 'P0001';
  end if;
  v_max := (core.setting('auction.deposit.global_max_paise'))::text::bigint;
  if p_mode is null or p_value is null or p_value <= 0 then
    raise exception 'DEPOSIT_REQUIRED: every auction needs a positive refundable deposit' using errcode = 'P0001';
  end if;
  if p_mode = 'FIXED' then
    v_amount := p_value;
  elsif p_mode = 'PERCENT_OF_STARTING' then
    v_amount := ((p_starting * p_value + 9999) / 10000);              -- ceil to the paisa …
    v_amount := ((v_amount + 99) / 100) * 100;                       -- … then up to the whole rupee
  else
    raise exception 'DEPOSIT_REQUIRED: unknown deposit mode %', p_mode using errcode = 'P0001';
  end if;
  v_amount := greatest(v_amount, v_min);
  if v_max is not null then
    v_amount := least(v_amount, greatest(v_max, v_min));
  end if;
  if v_amount <= 0 then
    raise exception 'DEPOSIT_REQUIRED: computed deposit must be positive' using errcode = 'P0001';
  end if;
  return v_amount;
end;
$$;

create or replace function auction.bidder_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce(core.setting('auction.bidder_verification_level') #>> '{}', 'EMAIL')
    when 'BIDDER_KYC' then exists (select 1 from core.user_verifications v
                                   where v.user_id = p_user and v.level = 'BIDDER_KYC' and v.status = 'APPROVED')
    else exists (select 1 from core.profiles p where p.id = p_user and p.status in ('ACTIVE', 'DELETION_REQUESTED'))
  end;
$$;

create or replace function auction.seller_profile(p_auction uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.profile_id from auction.auctions a join auction.assets x on x.id = a.asset_id join auction.sellers s on s.id = x.seller_id
  where a.id = p_auction;
$$;

-- effective public state (time-aware; the cron job persists LIVE/CLOSED)
create or replace function auction.effective_status(a auction.auctions)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when a.status = 'SCHEDULED' and clock_timestamp() >= a.ends_at then 'ENDED'
    when a.status = 'LIVE' and clock_timestamp() >= a.ends_at then 'ENDED'
    when a.status = 'SCHEDULED' and clock_timestamp() >= a.starts_at then 'LIVE'
    else a.status end;
$$;

create or replace function auction.min_next_bid(a auction.auctions)
returns bigint
language sql
stable
set search_path = ''
as $$ select case when a.current_bid_paise is null then a.starting_price_paise else a.current_bid_paise + a.min_increment_paise end; $$;

create or replace function auction.auction_json(a auction.auctions, p_detail boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare x auction.assets; v jsonb; r auction.results; v_bidders int;
begin
  select * into x from auction.assets where id = a.asset_id;
  select * into r from auction.results where auction_id = a.id;
  select count(distinct user_id)::int into v_bidders from auction.bids where auction_id = a.id and status = 'ACCEPTED';
  v := jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', x.title, 'type', a.type,
    'status', auction.effective_status(a),
    'category', (select jsonb_build_object('slug', c.slug, 'name', c.name, 'isVehicle', c.is_vehicle) from auction.categories c where c.id = x.category_id),
    'brand', x.brand, 'model', x.model, 'year', x.manufacture_year, 'condition', x.condition,
    'location', x.location_city || ', ' || x.location_state,
    'seller', (select jsonb_build_object('name', s.display_name, 'verified', s.verification_status = 'VERIFIED', 'kind', s.kind)
               from auction.sellers s where s.id = x.seller_id),
    'startingPricePaise', a.starting_price_paise::text,
    'currentBidPaise', a.current_bid_paise::text,
    'minNextBidPaise', auction.min_next_bid(a)::text,
    'minIncrementPaise', a.min_increment_paise::text,
    'bidCount', a.bid_count, 'bidderCount', v_bidders,
    'startsAt', a.starts_at, 'endsAt', a.ends_at,
    'depositAmountPaise', a.deposit_amount_paise::text,
    'reserve', case
      when a.reserve_price_paise is null then null
      when a.reserve_disclosure = 'HIDDEN' then jsonb_build_object('disclosure', 'HIDDEN')
      else jsonb_build_object('disclosure', 'MET_FLAG', 'met', coalesce(a.current_bid_paise >= a.reserve_price_paise, false)) end,
    'result', case when r.id is null then null else jsonb_build_object('outcome', r.outcome, 'finalPricePaise', r.final_price_paise::text) end
  );
  if p_detail then
    v := v || jsonb_build_object(
      'description', x.description, 'pickupTerms', x.pickup_terms, 'charges', x.charges,
      'depositTerms', a.deposit_terms, 'termsVersion', a.terms_version,
      'winnerPaymentDeadlineHours', a.winner_payment_deadline_hours,
      'antiSnipe', case when a.anti_snipe_window_s > 0 and a.max_extensions > 0 then jsonb_build_object(
        'windowSeconds', a.anti_snipe_window_s, 'extendSeconds', a.anti_snipe_extend_s, 'maxExtensions', a.max_extensions,
        'used', a.extensions_used) end,
      'vehicle', (select jsonb_build_object(
          'manufacturer', vd.manufacturer, 'variant', vd.variant, 'registrationState', vd.registration_state,
          'registrationMasked', vd.registration_masked, 'fuelType', vd.fuel_type, 'transmission', vd.transmission,
          'odometerKm', vd.odometer_km, 'ownersCount', vd.owners_count, 'insuranceValidUntil', vd.insurance_valid_until,
          'rcStatus', vd.rc_status, 'pucStatus', vd.puc_status, 'accidentDisclosure', vd.accident_disclosure,
          'damageDisclosure', vd.damage_disclosure, 'serviceHistory', vd.service_history,
          'ownershipTransferTerms', vd.ownership_transfer_terms)
        from auction.vehicle_details vd where vd.asset_id = x.id),
      'inspections', coalesce((select jsonb_agg(jsonb_build_object(
          'inspector', i.inspector_name, 'inspectedAt', i.inspected_at, 'location', i.location, 'summary', i.summary,
          'verified', i.is_verified) order by i.inspected_at desc) from auction.inspection_reports i where i.asset_id = x.id), '[]'::jsonb)
    );
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Refund helper (full amount of a specific payment; deposit moves to REFUND_ELIGIBLE when it is the paying attempt)
-- ---------------------------------------------------------------------------
create or replace function auction.create_refund(p_deposit uuid, p_attempt uuid, p_reason text, p_actor uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare d auction.deposits; v_amount bigint; v_id uuid;
begin
  select * into d from auction.deposits where id = p_deposit for update;
  select amount_paise into v_amount from core.payment_attempts where id = p_attempt;
  insert into auction.refunds (deposit_id, payment_attempt_id, auction_id, user_id, amount_paise, reason, initiated_by, note)
  values (d.id, p_attempt, d.auction_id, d.user_id, v_amount, p_reason, p_actor, p_note)
  on conflict (payment_attempt_id) do nothing
  returning id into v_id;
  if d.payment_attempt_id = p_attempt and d.status in ('PAID', 'WINNER_ADJUSTMENT_PENDING', 'DEFAULT_REVIEW') then
    perform auction.transition_deposit(d.id, 'REFUND_ELIGIBLE', p_reason);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment reactions
-- ---------------------------------------------------------------------------
create or replace function auction.on_deposit_captured(p_attempt uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare at core.payment_attempts; d auction.deposits; a auction.auctions;
begin
  select * into at from core.payment_attempts where id = p_attempt;
  select * into d from auction.deposits where id = at.reference_id for update;
  if d.id is null then
    return 'NO_DEPOSIT';
  end if;
  select * into a from auction.auctions where id = d.auction_id for update;

  -- money arrived: record it in the auction ledger first (idempotent per attempt)
  perform ledger.post_journal('auction', 'DEPOSIT_CAPTURED', 'auction.deposits', d.id, 'auction:deposit-capture:' || p_attempt::text,
    jsonb_build_array(
      jsonb_build_object('account', 'auction:gateway_clearing', 'debit', at.amount_paise, 'user_id', d.user_id),
      jsonb_build_object('account', 'auction:deposit_liability', 'credit', at.amount_paise, 'user_id', d.user_id)));

  if d.status not in ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED') then
    -- deposit already paid by another attempt → this payment is a duplicate and goes straight back (D-5)
    perform auction.create_refund(d.id, p_attempt, 'DUPLICATE_PAYMENT', null, 'Second payment for the same deposit');
    return 'DUPLICATE_PAYMENT_REFUND';
  end if;

  -- the attempt that actually paid becomes the deposit's payment reference; any other open attempt is closed
  update core.payment_attempts set status = 'EXPIRED'
   where id = d.payment_attempt_id and id <> p_attempt and status in ('CREATED', 'PENDING');
  update auction.deposits set payment_attempt_id = p_attempt where id = d.id;
  if d.status = 'CREATED' then
    perform auction.transition_deposit(d.id, 'PAYMENT_PENDING', 'payment captured before order state recorded');
  end if;
  perform auction.transition_deposit(d.id, 'PAID', 'verified provider capture');

  if a.status in ('SCHEDULED', 'LIVE') and clock_timestamp() < a.ends_at then
    update auction.participants set status = 'ACTIVE' where id = d.participant_id and status = 'REGISTERED';
    return 'DEPOSIT_PAID';
  end if;
  -- auction already closed/cancelled: a late deposit never grants bidding and is refunded in full
  perform auction.create_refund(d.id, p_attempt, 'LATE_CAPTURE', null, 'Deposit confirmed after the auction closed');
  return 'LATE_CAPTURE_REFUND';
end;
$$;

create or replace function auction.on_deposit_failed(p_attempt uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare d auction.deposits;
begin
  select dd.* into d from auction.deposits dd join core.payment_attempts a on a.reference_id = dd.id where a.id = p_attempt for update of dd;
  if d.id is not null and d.status = 'PAYMENT_PENDING' and d.payment_attempt_id = p_attempt then
    perform auction.transition_deposit(d.id, 'PAYMENT_FAILED', 'provider reported failure');
    return 'DEPOSIT_PAYMENT_FAILED';
  end if;
  return 'NO_CHANGE';
end;
$$;

-- Deposit is credited to the invoice exactly once, when the invoice is settled (§7.6).
create or replace function auction.settle_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare i auction.invoices; d auction.deposits;
begin
  select * into i from auction.invoices where id = p_invoice for update;
  select dd.* into d from auction.deposits dd where dd.auction_id = i.auction_id and dd.user_id = i.winner_user_id for update;
  insert into auction.deposit_adjustments (deposit_id, invoice_id, amount_paise) values (d.id, i.id, i.deposit_credit_paise)
  on conflict do nothing;
  perform ledger.post_journal('auction', 'DEPOSIT_ADJUSTED', 'auction.deposits', d.id, 'auction:adjust:' || d.id::text,
    jsonb_build_array(
      jsonb_build_object('account', 'auction:deposit_liability', 'debit', i.deposit_credit_paise, 'user_id', d.user_id),
      jsonb_build_object('account', 'auction:buyer_receivable', 'credit', i.deposit_credit_paise, 'user_id', d.user_id)));
  update auction.invoices set status = 'PAID', paid_at = coalesce(paid_at, now()) where id = i.id;
  if d.status in ('WINNER_ADJUSTMENT_PENDING', 'DEFAULT_REVIEW') then
    perform auction.transition_deposit(d.id, 'ADJUSTED', 'credited against the final invoice');
  end if;
end;
$$;

create or replace function auction.on_purchase_captured(p_attempt uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare at core.payment_attempts; pp auction.purchase_payments; i auction.invoices;
begin
  select * into at from core.payment_attempts where id = p_attempt;
  select * into pp from auction.purchase_payments where payment_attempt_id = p_attempt for update;
  select * into i from auction.invoices where id = pp.invoice_id for update;
  perform ledger.post_journal('auction', 'PURCHASE_CAPTURED', 'auction.invoices', i.id, 'auction:purchase:' || p_attempt::text,
    jsonb_build_array(
      jsonb_build_object('account', 'auction:gateway_clearing', 'debit', at.amount_paise, 'user_id', i.winner_user_id),
      jsonb_build_object('account', 'auction:buyer_receivable', 'credit', at.amount_paise, 'user_id', i.winner_user_id)));
  update auction.purchase_payments set status = 'CAPTURED' where id = pp.id;
  update auction.invoices set amount_paid_paise = least(amount_paid_paise + at.amount_paise, total_payable_paise) where id = i.id;
  select * into i from auction.invoices where id = i.id;
  if i.amount_paid_paise >= i.total_payable_paise then
    perform auction.settle_invoice(i.id);
    return 'INVOICE_PAID';
  end if;
  return 'INVOICE_PART_PAID';
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments orchestration — now routes both domains (replaces the 0008 versions; grants are preserved)
-- ---------------------------------------------------------------------------
create or replace function api.payments_attach_order(p_attempt uuid, p_provider text, p_provider_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a core.payment_attempts; d auction.deposits;
begin
  select * into a from core.payment_attempts where id = p_attempt for update;
  if a.id is null then
    raise exception 'NOT_FOUND: payment attempt' using errcode = 'P0001';
  end if;
  if a.status = 'PENDING' and a.provider = p_provider and a.provider_order_id = p_provider_order_id then
    return jsonb_build_object('status', a.status);
  end if;
  if a.status <> 'CREATED' then
    raise exception 'INVALID_STATE: attempt is %', a.status using errcode = 'P0001';
  end if;
  update core.payment_attempts set provider = p_provider, provider_order_id = p_provider_order_id, status = 'PENDING' where id = a.id;
  if a.purpose = 'AUCTION_DEPOSIT' then
    select * into d from auction.deposits where id = a.reference_id for update;
    if d.status in ('CREATED', 'PAYMENT_FAILED') then
      perform auction.transition_deposit(d.id, 'PAYMENT_PENDING', 'provider order created');
    end if;
  end if;
  return jsonb_build_object('status', 'PENDING');
end;
$$;

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
        v_result := 'AMOUNT_MISMATCH';
        perform core.write_audit('payment.amount_mismatch', 'core', 'payment_attempts', a.id::text, null,
          jsonb_build_object('expected', a.amount_paise, 'received', p_amount_paise, 'currency', p_currency), null);
      elsif a.status = 'CAPTURED' then
        v_result := 'ALREADY_CAPTURED';
      elsif a.status = 'REVERSED' then
        v_result := 'IGNORED_REVERSED';
      else
        update core.payment_attempts set status = 'CAPTURED', captured_at = now(), provider_payment_id = p_payment_id, failure_code = null
         where id = a.id;
        v_result := case a.purpose
          when 'POOL_CONTRIBUTION' then poolx.on_contribution_captured(a.id)
          when 'AUCTION_DEPOSIT' then auction.on_deposit_captured(a.id)
          when 'AUCTION_PURCHASE' then auction.on_purchase_captured(a.id)
          else 'NO_HANDLER_' || a.purpose end;
      end if;
    else
      if a.status in ('CREATED', 'PENDING') then
        update core.payment_attempts set status = 'FAILED', failure_code = left(p_payload ->> 'failure_code', 100) where id = a.id;
        v_result := case a.purpose
          when 'POOL_CONTRIBUTION' then poolx.on_contribution_failed(a.id)
          when 'AUCTION_DEPOSIT' then auction.on_deposit_failed(a.id)
          when 'AUCTION_PURCHASE' then (select case when exists (select 1 from auction.purchase_payments where payment_attempt_id = a.id)
                                        then 'PURCHASE_PAYMENT_FAILED' end)
          else 'NO_HANDLER' end;
        update auction.purchase_payments set status = 'FAILED' where payment_attempt_id = a.id and status = 'PENDING';
      else
        v_result := 'IGNORED_' || a.status;
      end if;
    end if;
  elsif p_type in ('refund.processed', 'refund.failed') then
    select id into v_refund from poolx.refunds where provider_refund_id = p_refund_id;
    if v_refund is not null then
      v_result := poolx.apply_refund_result(v_refund, case p_type when 'refund.processed' then 'PROCESSED' else 'FAILED' end,
                                             p_refund_id, p_payload ->> 'error', true);
    else
      select id into v_refund from auction.refunds where provider_refund_id = p_refund_id;
      if v_refund is null then
        v_result := 'UNKNOWN_REFUND';
      else
        v_result := auction.apply_refund_result(v_refund, case p_type when 'refund.processed' then 'PROCESSED' else 'FAILED' end,
                                                 p_refund_id, p_payload ->> 'error', true);
      end if;
    end if;
  else
    v_result := 'IGNORED_TYPE';
  end if;

  update core.payment_webhook_events set processed_at = now(), result = v_result where id = v_event_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Refund outcomes (REFUNDED only on provider confirmation — §7.8)
-- ---------------------------------------------------------------------------
create or replace function auction.apply_refund_result(p_refund uuid, p_status text, p_provider_refund_id text, p_error text, p_retryable boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare r auction.refunds; d auction.deposits; v_linked boolean; v_backoff interval;
begin
  select * into r from auction.refunds where id = p_refund for update;
  if r.id is null then
    return 'UNKNOWN_REFUND';
  end if;
  if r.status = 'REFUNDED' then
    return 'ALREADY_REFUNDED';
  end if;
  select * into d from auction.deposits where id = r.deposit_id for update;
  v_linked := d.payment_attempt_id = r.payment_attempt_id;

  if p_status = 'PROCESSED' then
    update auction.refunds set status = 'REFUNDED', refunded_at = now(),
           provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id), last_error = null, next_retry_at = null
     where id = r.id;
    if v_linked then
      if d.status = 'REFUND_INITIATED' or d.status = 'REFUND_PROCESSING' then
        perform auction.transition_deposit(d.id, 'REFUNDED', 'provider confirmed refund');
      end if;
    end if;
    perform ledger.post_journal('auction', 'DEPOSIT_REFUNDED', 'auction.refunds', r.id, 'auction:refund:' || r.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'auction:deposit_liability', 'debit', r.amount_paise, 'user_id', r.user_id),
        jsonb_build_object('account', 'auction:gateway_clearing', 'credit', r.amount_paise, 'user_id', r.user_id)));
    return 'REFUNDED';
  elsif p_status = 'PROCESSING' then
    update auction.refunds set status = 'REFUND_PROCESSING', provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id) where id = r.id;
    if v_linked and d.status = 'REFUND_INITIATED' then
      perform auction.transition_deposit(d.id, 'REFUND_PROCESSING', 'provider processing refund');
    end if;
    return 'REFUND_PROCESSING';
  elsif p_status = 'FAILED' then
    v_backoff := case least(r.attempts, 5) when 1 then interval '1 minute' when 2 then interval '5 minutes'
                 when 3 then interval '30 minutes' when 4 then interval '2 hours' else interval '12 hours' end;
    update auction.refunds
       set status = 'REFUND_FAILED', last_error = left(p_error, 500),
           retryable = coalesce(p_retryable, false) and r.attempts < 5,
           next_retry_at = case when coalesce(p_retryable, false) and r.attempts < 5 then now() + v_backoff end
     where id = r.id;
    if v_linked and d.status in ('REFUND_INITIATED', 'REFUND_PROCESSING') then
      perform auction.transition_deposit(d.id, 'REFUND_FAILED', left(coalesce(p_error, 'provider failure'), 200));
    end if;
    -- alert: recorded for finance (Phase 8 sends notifications)
    perform core.write_audit('auction.refund.failed', 'auction', 'refunds', r.id::text, null,
      jsonb_build_object('attempts', r.attempts, 'retryable', coalesce(p_retryable, false)), left(p_error, 500));
    return 'REFUND_FAILED';
  end if;
  raise exception 'INVALID_STATUS: %', p_status using errcode = 'P0001';
end;
$$;

create or replace function api.auction_claim_refunds(p_limit integer)
returns table (refund_id uuid, amount_paise bigint, provider text, provider_payment_id text, idempotency_key text, attempt_no integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare r record; v_ids uuid[] := '{}';
begin
  -- REFUND_INITIATED is committed before any provider call; only the rows claimed here are returned
  for r in
    select x.id from auction.refunds x
     where x.status = 'REFUND_ELIGIBLE' or (x.status = 'REFUND_FAILED' and x.retryable and x.next_retry_at <= now())
     order by x.created_at
     limit least(greatest(p_limit, 1), 50)
     for update skip locked
  loop
    update auction.refunds set status = 'REFUND_INITIATED', attempts = attempts + 1 where id = r.id;
    perform auction.transition_deposit(d.id, 'REFUND_INITIATED', 'refund sent to provider')
       from auction.deposits d join auction.refunds x on x.deposit_id = d.id
      where x.id = r.id and d.payment_attempt_id = x.payment_attempt_id and d.status in ('REFUND_ELIGIBLE', 'REFUND_FAILED');
    v_ids := v_ids || r.id;
  end loop;
  return query
  select x.id, x.amount_paise, a.provider, a.provider_payment_id, 'auction-refund:' || x.id::text, x.attempts
    from auction.refunds x join core.payment_attempts a on a.id = x.payment_attempt_id
   where x.id = any (v_ids);
end;
$fn$;

create or replace function api.auction_record_refund_result(p_refund uuid, p_status text, p_provider_refund_id text, p_error text, p_retryable boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v text; r auction.refunds;
begin
  v := auction.apply_refund_result(p_refund, p_status, p_provider_refund_id, p_error, p_retryable);
  select * into r from auction.refunds where id = p_refund;
  if r.id is not null then
    insert into core.provider_refunds (payment_attempt_id, domain, domain_refund_id, idempotency_key, amount_paise, provider_refund_id, status, last_error)
    values (r.payment_attempt_id, 'auction', r.id, 'auction-refund:' || r.id::text, r.amount_paise, p_provider_refund_id,
            case p_status when 'PROCESSED' then 'PROCESSED' when 'PROCESSING' then 'PROCESSING' else 'FAILED' end, left(p_error, 500))
    on conflict (idempotency_key) do update
      set provider_refund_id = coalesce(excluded.provider_refund_id, core.provider_refunds.provider_refund_id),
          status = excluded.status, last_error = excluded.last_error;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing (§8.4) — idempotent, deterministic winner: highest amount, then earliest server-accepted bid
-- ---------------------------------------------------------------------------
create or replace function auction.close_auction(p_auction uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a auction.auctions; r auction.results; b auction.bids; x auction.assets; d record;
  v_outcome text; v_result uuid; v_charges bigint; v_deposit auction.deposits; v_invoice uuid; v_total bigint; v_reason text;
begin
  select * into a from auction.auctions where id = p_auction for update;
  if a.id is null then
    raise exception 'AUCTION_NOT_FOUND: auction not found' using errcode = 'P0001';
  end if;
  select * into r from auction.results where auction_id = a.id;
  if r.id is not null then
    return r.outcome;                                                          -- already closed (idempotent)
  end if;
  if a.status not in ('SCHEDULED', 'LIVE') then
    raise exception 'INVALID_STATE: auction is %', a.status using errcode = 'P0001';
  end if;
  if clock_timestamp() < a.ends_at then
    raise exception 'NOT_ENDED: the auction has not reached its end time' using errcode = 'P0001';
  end if;

  select * into b from auction.bids where auction_id = a.id and status = 'ACCEPTED'
   order by amount_paise desc, accepted_at asc, seq asc limit 1;
  v_outcome := case
    when b.id is null then 'NO_BIDS'
    when a.reserve_price_paise is not null and b.amount_paise < a.reserve_price_paise then 'RESERVE_NOT_MET'
    else 'WON' end;

  update auction.auctions set status = 'CLOSED', closed_at = now() where id = a.id;
  insert into auction.results (auction_id, outcome, winning_bid_id, winner_user_id, final_price_paise)
  values (a.id, v_outcome, case when v_outcome = 'WON' then b.id end, case when v_outcome = 'WON' then b.user_id end,
          case when v_outcome = 'WON' then b.amount_paise end)
  returning id into v_result;

  -- every deposit is resolved; every eligible non-winner gets a FULL refund (§7.5)
  for d in select * from auction.deposits where auction_id = a.id for update loop
    if d.status = 'PAID' then
      if v_outcome = 'WON' and d.user_id = b.user_id then
        perform auction.transition_deposit(d.id, 'WINNER_ADJUSTMENT_PENDING', 'won the auction');
      else
        v_reason := case v_outcome
          when 'RESERVE_NOT_MET' then 'RESERVE_NOT_MET'
          when 'NO_BIDS' then 'NO_WINNER'
          else case when exists (select 1 from auction.bids where auction_id = a.id and user_id = d.user_id) then 'LOST' else 'NO_BID' end
        end;
        perform auction.create_refund(d.id, d.payment_attempt_id, v_reason, null, null);
      end if;
    elsif d.status = 'PAYMENT_PENDING' then
      update core.payment_attempts set status = 'EXPIRED' where id = d.payment_attempt_id and status in ('CREATED', 'PENDING');
      perform auction.transition_deposit(d.id, 'PAYMENT_FAILED', 'auction closed before payment completed');
    end if;
  end loop;

  if v_outcome = 'WON' then
    select * into x from auction.assets where id = a.asset_id;
    select coalesce(sum((c ->> 'amountPaise')::bigint), 0) into v_charges from jsonb_array_elements(x.charges) c;
    select * into v_deposit from auction.deposits where auction_id = a.id and user_id = b.user_id;
    v_total := b.amount_paise + v_charges - v_deposit.amount_paise;
    insert into auction.invoices (result_id, auction_id, winner_user_id, hammer_price_paise, charges, charges_total_paise,
                                  deposit_credit_paise, total_payable_paise, due_at)
    values (v_result, a.id, b.user_id, b.amount_paise, x.charges, v_charges, v_deposit.amount_paise, greatest(v_total, 0),
            now() + make_interval(hours => a.winner_payment_deadline_hours))
    returning id into v_invoice;
    perform ledger.post_journal('auction', 'INVOICE_ISSUED', 'auction.invoices', v_invoice, 'auction:invoice:' || v_invoice::text,
      jsonb_build_array(
        jsonb_build_object('account', 'auction:buyer_receivable', 'debit', b.amount_paise + v_charges, 'user_id', b.user_id),
        jsonb_build_object('account', 'auction:seller_payable', 'credit', b.amount_paise + v_charges, 'user_id', b.user_id)));
    if v_total <= 0 then
      perform auction.settle_invoice(v_invoice);
    end if;
  end if;

  perform core.write_audit('auction.close', 'auction', 'auctions', a.id::text, null,
    jsonb_build_object('outcome', v_outcome, 'winningBid', b.amount_paise), null);
  return v_outcome;
end;
$$;

create or replace function api.auction_close_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r record; v_n int := 0;
begin
  update auction.auctions set status = 'LIVE' where status = 'SCHEDULED' and starts_at <= now() and ends_at > now();
  for r in select id from auction.auctions where status in ('SCHEDULED', 'LIVE') and ends_at <= clock_timestamp()
           for update skip locked loop
    perform auction.close_auction(r.id);
    v_n := v_n + 1;
  end loop;
  -- unpaid winner invoices past their deadline go to review (§7.7) — never auto-forfeited
  for r in select i.id, i.auction_id, i.winner_user_id from auction.invoices i
           where i.status = 'ISSUED' and i.due_at <= now() for update skip locked loop
    update auction.invoices set status = 'DEFAULT_REVIEW' where id = r.id;
    insert into auction.default_reviews (invoice_id, deposit_id)
    select r.id, d.id from auction.deposits d where d.auction_id = r.auction_id and d.user_id = r.winner_user_id
    on conflict (invoice_id) do nothing;
    perform auction.transition_deposit(d.id, 'DEFAULT_REVIEW', 'winner payment overdue')
       from auction.deposits d where d.auction_id = r.auction_id and d.user_id = r.winner_user_id and d.status = 'WINNER_ADJUSTMENT_PENDING';
    perform core.write_audit('auction.invoice.overdue', 'auction', 'invoices', r.id::text, null, null, null);
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member API
-- ---------------------------------------------------------------------------
create or replace function api.auction_start_deposit(p_auction uuid, p_terms_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_active_user(); a auction.auctions; p auction.participants; d auction.deposits;
  at core.payment_attempts; v_attempt uuid;
begin
  select * into a from auction.auctions where id = p_auction for update;
  if a.id is null or a.status = 'DRAFT' then
    raise exception 'AUCTION_NOT_FOUND: auction not found' using errcode = 'P0001';
  end if;
  if a.status not in ('SCHEDULED', 'LIVE') or clock_timestamp() >= a.ends_at then
    raise exception 'AUCTION_CLOSED: registration is closed for this auction' using errcode = 'P0001';
  end if;
  if p_terms_version is distinct from a.terms_version then
    raise exception 'TERMS_NOT_ACCEPTED: accept the current auction terms to continue' using errcode = 'P0001';
  end if;
  if auction.seller_profile(a.id) = v_uid then
    raise exception 'SELLER_CANNOT_BID: sellers cannot participate in their own auction' using errcode = 'P0001';
  end if;
  if not auction.bidder_verified(v_uid) then
    raise exception 'VERIFICATION_REQUIRED: complete bidder verification first' using errcode = 'P0001';
  end if;

  select * into p from auction.participants where auction_id = a.id and user_id = v_uid for update;
  if p.id is null then
    insert into auction.participants (auction_id, user_id, terms_version, alias)
    values (a.id, v_uid, p_terms_version, coalesce((select max(alias) from auction.participants where auction_id = a.id), 0) + 1)
    returning * into p;
  elsif p.status in ('SUSPENDED', 'WITHDRAWN') then
    raise exception 'RESTRICTED: you cannot participate in this auction' using errcode = 'P0001';
  end if;

  select * into d from auction.deposits where participant_id = p.id for update;
  if d.id is null then
    insert into auction.deposits (participant_id, auction_id, user_id, amount_paise)
    values (p.id, a.id, v_uid, a.deposit_amount_paise) returning * into d;
    insert into auction.deposit_history (deposit_id, from_status, to_status, actor_id, reason) values (d.id, null, 'CREATED', v_uid, 'registered');
  end if;
  if d.status not in ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED') then
    return jsonb_build_object('status', 'ALREADY_PAID', 'depositStatus', d.status);
  end if;

  -- D-8: reuse a live attempt; never create a second charge while one is pending
  if d.payment_attempt_id is not null then
    select * into at from core.payment_attempts where id = d.payment_attempt_id for update;
    if at.status in ('CREATED', 'PENDING') and at.expires_at > now() then
      return jsonb_build_object('status', 'PENDING', 'attemptId', at.id, 'amountPaise', at.amount_paise::text,
                                'hasOrder', at.provider_order_id is not null);
    end if;
    if at.status in ('CREATED', 'PENDING') then
      update core.payment_attempts set status = 'EXPIRED' where id = at.id;
      if d.status = 'PAYMENT_PENDING' then
        perform auction.transition_deposit(d.id, 'PAYMENT_FAILED', 'payment attempt expired');
      end if;
    end if;
  end if;

  insert into core.payment_attempts (domain, purpose, reference_id, user_id, amount_paise)
  values ('auction', 'AUCTION_DEPOSIT', d.id, v_uid, d.amount_paise) returning id into v_attempt;
  update auction.deposits set payment_attempt_id = v_attempt where id = d.id;
  return jsonb_build_object('status', 'NEW', 'attemptId', v_attempt, 'amountPaise', d.amount_paise::text, 'hasOrder', false);
end;
$$;

-- §8.1/§8.2: server-authoritative, atomic (row lock), idempotent bid acceptance.
create or replace function api.auction_place_bid(p_auction uuid, p_amount_paise bigint, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := core.require_active_user(); a auction.auctions; p auction.participants; d auction.deposits;
  b auction.bids; v_now timestamptz; v_min bigint; v_extended boolean := false;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'INVALID_REQUEST: idempotency key required' using errcode = 'P0001';
  end if;
  select * into a from auction.auctions where id = p_auction for update;               -- serialises all bids on this auction
  if a.id is null or a.status = 'DRAFT' then
    raise exception 'AUCTION_NOT_FOUND: auction not found' using errcode = 'P0001';
  end if;

  select * into b from auction.bids where auction_id = a.id and idempotency_key = p_idempotency_key;
  if b.id is not null then
    if b.user_id <> v_uid then
      raise exception 'INVALID_REQUEST: idempotency key already used' using errcode = 'P0001';
    end if;
    return jsonb_build_object('status', 'DUPLICATE', 'bidId', b.id, 'amountPaise', b.amount_paise::text,
                              'currentBidPaise', a.current_bid_paise::text, 'endsAt', a.ends_at);
  end if;

  v_now := clock_timestamp();
  if a.status not in ('SCHEDULED', 'LIVE') or v_now < a.starts_at or v_now >= a.ends_at then
    raise exception 'AUCTION_NOT_LIVE: this auction is not accepting bids' using errcode = 'P0001';
  end if;
  if auction.seller_profile(a.id) = v_uid then
    raise exception 'SELLER_CANNOT_BID: sellers cannot bid on their own auction' using errcode = 'P0001';
  end if;
  select * into p from auction.participants where auction_id = a.id and user_id = v_uid;
  select * into d from auction.deposits where participant_id = p.id;
  if d.id is null or d.status in ('CREATED', 'PAYMENT_FAILED') then
    raise exception 'DEPOSIT_REQUIRED: pay the refundable deposit for this auction to bid' using errcode = 'P0001';
  elsif d.status = 'PAYMENT_PENDING' then
    raise exception 'DEPOSIT_PENDING: your deposit payment is not confirmed yet' using errcode = 'P0001';
  elsif d.status <> 'PAID' then
    raise exception 'DEPOSIT_REQUIRED: your deposit for this auction is no longer active' using errcode = 'P0001';
  end if;
  if p.status <> 'ACTIVE' then
    raise exception 'RESTRICTED: you cannot bid in this auction' using errcode = 'P0001';
  end if;
  if not auction.bidder_verified(v_uid) then
    raise exception 'VERIFICATION_REQUIRED: complete bidder verification first' using errcode = 'P0001';
  end if;
  v_min := auction.min_next_bid(a);
  if p_amount_paise is null or p_amount_paise < v_min then
    raise exception 'BID_TOO_LOW: the minimum bid is % paise', v_min using errcode = 'P0001';
  end if;
  if p_amount_paise > 100000000000000 then
    raise exception 'INVALID_REQUEST: bid amount too large' using errcode = 'P0001';
  end if;

  insert into auction.bids (auction_id, participant_id, user_id, amount_paise, idempotency_key, accepted_at)
  values (a.id, p.id, v_uid, p_amount_paise, p_idempotency_key, v_now) returning * into b;

  -- anti-sniping: a bid inside the final window extends the end (bounded, disclosed on the page)
  if a.anti_snipe_window_s > 0 and a.extensions_used < a.max_extensions
     and a.ends_at - v_now <= make_interval(secs => a.anti_snipe_window_s) then
    update auction.auctions set ends_at = ends_at + make_interval(secs => a.anti_snipe_extend_s),
                                original_ends_at = coalesce(original_ends_at, a.ends_at), extensions_used = extensions_used + 1
     where id = a.id;
    v_extended := true;
  end if;
  update auction.auctions set current_bid_paise = p_amount_paise, leader_bid_id = b.id, bid_count = bid_count + 1, status = 'LIVE'
   where id = a.id
  returning * into a;
  return jsonb_build_object('status', 'ACCEPTED', 'bidId', b.id, 'amountPaise', b.amount_paise::text,
                            'currentBidPaise', a.current_bid_paise::text, 'minNextBidPaise', auction.min_next_bid(a)::text,
                            'endsAt', a.ends_at, 'extended', v_extended);
end;
$$;

create or replace function api.auction_start_invoice_payment(p_invoice uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user(); i auction.invoices; pp auction.purchase_payments; at core.payment_attempts; v_attempt uuid; v_due bigint;
begin
  select * into i from auction.invoices where id = p_invoice and winner_user_id = v_uid for update;
  if i.id is null then
    raise exception 'INVOICE_NOT_FOUND: invoice not found' using errcode = 'P0001';
  end if;
  if i.status not in ('ISSUED', 'DEFAULT_REVIEW') then
    raise exception 'INVALID_STATE: this invoice is %', i.status using errcode = 'P0001';
  end if;
  select * into pp from auction.purchase_payments where invoice_id = i.id and status = 'PENDING' for update;
  if pp.id is not null then
    select * into at from core.payment_attempts where id = pp.payment_attempt_id;
    if at.status in ('CREATED', 'PENDING') and at.expires_at > now() then
      return jsonb_build_object('status', 'PENDING', 'attemptId', at.id, 'amountPaise', at.amount_paise::text,
                                'hasOrder', at.provider_order_id is not null);
    end if;
    update auction.purchase_payments set status = 'EXPIRED' where id = pp.id;
    update core.payment_attempts set status = 'EXPIRED' where id = at.id and status in ('CREATED', 'PENDING');
  end if;
  v_due := i.total_payable_paise - i.amount_paid_paise;
  if v_due <= 0 then
    raise exception 'INVALID_STATE: nothing is due' using errcode = 'P0001';
  end if;
  insert into core.payment_attempts (domain, purpose, reference_id, user_id, amount_paise)
  values ('auction', 'AUCTION_PURCHASE', i.id, v_uid, v_due) returning id into v_attempt;
  insert into auction.purchase_payments (invoice_id, payment_attempt_id, amount_paise) values (i.id, v_attempt, v_due);
  return jsonb_build_object('status', 'NEW', 'attemptId', v_attempt, 'amountPaise', v_due::text, 'hasOrder', false);
end;
$$;

create or replace function api.auction_my_status(p_auction uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verified', auction.bidder_verified(auth.uid()),
    'isSeller', auction.seller_profile(p_auction) = auth.uid(),
    'participant', (select jsonb_build_object('status', p.status, 'alias', p.alias, 'termsVersion', p.terms_version)
                    from auction.participants p where p.auction_id = p_auction and p.user_id = auth.uid()),
    'deposit', (select jsonb_build_object('status', d.status, 'amountPaise', d.amount_paise::text, 'paidAt', d.paid_at,
                                          'attemptId', d.payment_attempt_id)
                from auction.deposits d where d.auction_id = p_auction and d.user_id = auth.uid()),
    'myHighestBidPaise', (select max(amount_paise)::text from auction.bids b where b.auction_id = p_auction and b.user_id = auth.uid() and b.status = 'ACCEPTED'),
    'isLeading', exists (select 1 from auction.auctions a join auction.bids b on b.id = a.leader_bid_id
                         where a.id = p_auction and b.user_id = auth.uid())
  )
  where auth.uid() is not null;
$$;

create or replace function api.auction_my_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_active_user();
begin
  return jsonb_build_object(
    'deposits', coalesce((select jsonb_agg(jsonb_build_object(
        'depositId', d.id, 'auctionSlug', a.slug, 'auctionTitle', x.title, 'auctionStatus', auction.effective_status(a),
        'amountPaise', d.amount_paise::text, 'status', d.status, 'paidAt', d.paid_at,
        'paymentReference', (select pa.provider_payment_id from core.payment_attempts pa where pa.id = d.payment_attempt_id),
        'outcome', (select case when r.outcome = 'WON' and r.winner_user_id = v_uid then 'WON'
                                when r.outcome is null then null else 'NOT_WON' end from auction.results r where r.auction_id = a.id),
        'refund', (select jsonb_build_object('status', rf.status, 'amountPaise', rf.amount_paise::text, 'reason', rf.reason,
                                             'initiatedAt', rf.created_at, 'refundedAt', rf.refunded_at, 'reference', rf.provider_refund_id)
                   from auction.refunds rf where rf.deposit_id = d.id and rf.payment_attempt_id = d.payment_attempt_id),
        'adjustment', (select jsonb_build_object('amountPaise', ad.amount_paise::text, 'at', ad.created_at)
                       from auction.deposit_adjustments ad where ad.deposit_id = d.id)
      ) order by d.created_at desc)
      from auction.deposits d join auction.auctions a on a.id = d.auction_id join auction.assets x on x.id = a.asset_id
      where d.user_id = v_uid), '[]'::jsonb),
    'bids', coalesce((select jsonb_agg(jsonb_build_object(
        'auctionSlug', a.slug, 'auctionTitle', x.title, 'auctionStatus', auction.effective_status(a), 'endsAt', a.ends_at,
        'myHighestBidPaise', s.max_bid::text, 'bidCount', s.n, 'currentBidPaise', a.current_bid_paise::text,
        'isLeading', exists (select 1 from auction.bids lb where lb.id = a.leader_bid_id and lb.user_id = v_uid))
        order by a.ends_at desc)
      from (select auction_id, max(amount_paise) max_bid, count(*) n from auction.bids where user_id = v_uid and status = 'ACCEPTED' group by auction_id) s
      join auction.auctions a on a.id = s.auction_id join auction.assets x on x.id = a.asset_id), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object(
        'auctionTitle', x.title, 'auctionSlug', a.slug, 'amountPaise', rf.amount_paise::text, 'reason', rf.reason, 'status', rf.status,
        'initiatedAt', rf.created_at, 'refundedAt', rf.refunded_at, 'reference', rf.provider_refund_id) order by rf.created_at desc)
      from auction.refunds rf join auction.auctions a on a.id = rf.auction_id join auction.assets x on x.id = a.asset_id
      where rf.user_id = v_uid), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'auctionTitle', x.title, 'auctionSlug', a.slug, 'hammerPricePaise', i.hammer_price_paise::text,
        'charges', i.charges, 'chargesTotalPaise', i.charges_total_paise::text, 'depositCreditPaise', i.deposit_credit_paise::text,
        'totalPayablePaise', i.total_payable_paise::text, 'amountPaidPaise', i.amount_paid_paise::text, 'dueAt', i.due_at,
        'status', i.status, 'paidAt', i.paid_at) order by i.created_at desc)
      from auction.invoices i join auction.auctions a on a.id = i.auction_id join auction.assets x on x.id = a.asset_id
      where i.winner_user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------
create or replace function api.auction_list_categories()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'isVehicle', is_vehicle) order by sort), '[]'::jsonb)
  from auction.categories where is_active;
$$;

create or replace function api.auction_list(p_view text, p_category text, p_search text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 12), 1), 48); v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(left(p_search, 100)), ''); v_view text := coalesce(p_view, 'all'); v_total int; v_items jsonb;
begin
  with f as (
    select a.id, auction.effective_status(a) as st, a.ends_at, a.starts_at, a.published_at
    from auction.auctions a join auction.assets x on x.id = a.asset_id join auction.categories c on c.id = x.category_id
    where a.status <> 'DRAFT'
      and (p_category is null or c.slug = p_category)
      and (v_search is null or strpos(lower(x.title || ' ' || coalesce(x.brand, '') || ' ' || coalesce(x.model, '')), lower(v_search)) > 0)
  ), g as (
    select * from f where case v_view
      when 'live' then st = 'LIVE'
      when 'upcoming' then st = 'SCHEDULED'
      when 'ending' then st = 'LIVE' and ends_at <= now() + interval '24 hours'
      when 'recent' then st in ('LIVE', 'SCHEDULED')
      when 'closed' then st in ('CLOSED', 'ENDED')
      else st in ('LIVE', 'SCHEDULED') end
  ), s as (
    select g.id, row_number() over (order by
      case when v_view = 'recent' then g.published_at end desc,
      case when v_view = 'upcoming' then g.starts_at end asc,
      g.ends_at asc, g.id) rn from g
  )
  select (select count(*)::int from g),
         coalesce((select jsonb_agg(auction.auction_json(a, false) order by s.rn) from s join auction.auctions a on a.id = s.id
                   where s.rn > v_offset and s.rn <= v_offset + v_limit), '[]'::jsonb)
    into v_total, v_items;
  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
end;
$$;

create or replace function api.auction_get(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select auction.auction_json(a, true) from auction.auctions a where a.slug = p_slug and a.status <> 'DRAFT'; $$;

-- Bid history with privacy: bidders appear only as "Bidder N".
create or replace function api.auction_bid_history(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('bidder', 'Bidder ' || p.alias, 'amountPaise', b.amount_paise::text, 'at', b.accepted_at)
                            order by b.seq desc), '[]'::jsonb)
  from (select * from auction.bids where auction_id = (select id from auction.auctions where slug = p_slug and status <> 'DRAFT')
        and status = 'ACCEPTED' order by seq desc limit 50) b
  join auction.participants p on p.id = b.participant_id;
$$;

create or replace function api.auction_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'live', (select count(*) from auction.auctions a where auction.effective_status(a) = 'LIVE'),
    'upcoming', (select count(*) from auction.auctions a where auction.effective_status(a) = 'SCHEDULED'));
$$;

-- ---------------------------------------------------------------------------
-- Staff API
-- ---------------------------------------------------------------------------
/** Creates or updates a draft listing (asset + optional vehicle details + optional inspection + auction). */
create or replace function api.auction_admin_save_listing(p_auction uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.listings.manage'); a auction.auctions; v_asset uuid; v_seller uuid; v_id uuid;
        v_cat auction.categories;
begin
  select * into v_cat from auction.categories where slug = p ->> 'categorySlug' and is_active;
  if v_cat.id is null then
    raise exception 'INVALID_CATEGORY: choose a category' using errcode = 'P0001';
  end if;
  v_seller := nullif(p ->> 'sellerId', '')::uuid;
  if v_seller is null then
    select id into v_seller from auction.sellers where kind = 'PLATFORM' order by created_at limit 1;
    if v_seller is null then
      insert into auction.sellers (kind, display_name) values ('PLATFORM', 'Platform listing') returning id into v_seller;
    end if;
  end if;

  if p_auction is not null then
    select * into a from auction.auctions where id = p_auction for update;
    if a.id is null then
      raise exception 'AUCTION_NOT_FOUND: auction not found' using errcode = 'P0001';
    end if;
    if a.status <> 'DRAFT' then
      raise exception 'NOT_EDITABLE: only draft auctions can be edited' using errcode = 'P0001';
    end if;
    v_asset := a.asset_id;
    update auction.assets set seller_id = v_seller, category_id = v_cat.id, title = p ->> 'title', brand = nullif(p ->> 'brand', ''),
      model = nullif(p ->> 'model', ''), manufacture_year = nullif(p ->> 'year', '')::int, condition = p ->> 'condition',
      description = p ->> 'description', location_city = p ->> 'city', location_state = p ->> 'state',
      pickup_terms = p ->> 'pickupTerms', charges = coalesce(p -> 'charges', '[]'::jsonb)
    where id = v_asset;
  else
    insert into auction.assets (seller_id, category_id, title, brand, model, manufacture_year, condition, description,
                                location_city, location_state, pickup_terms, charges, created_by)
    values (v_seller, v_cat.id, p ->> 'title', nullif(p ->> 'brand', ''), nullif(p ->> 'model', ''), nullif(p ->> 'year', '')::int,
            p ->> 'condition', p ->> 'description', p ->> 'city', p ->> 'state', p ->> 'pickupTerms', coalesce(p -> 'charges', '[]'::jsonb), v_uid)
    returning id into v_asset;
  end if;

  if v_cat.is_vehicle then
    if p -> 'vehicle' is null or jsonb_typeof(p -> 'vehicle') <> 'object' then
      raise exception 'VEHICLE_DETAILS_REQUIRED: vehicles need registration, fuel, odometer and disclosure details' using errcode = 'P0001';
    end if;
    insert into auction.vehicle_details (asset_id, manufacturer, variant, registration_state, registration_masked, fuel_type,
      transmission, odometer_km, owners_count, insurance_valid_until, puc_status, accident_disclosure, damage_disclosure,
      service_history, ownership_transfer_terms)
    values (v_asset, p #>> '{vehicle,manufacturer}', nullif(p #>> '{vehicle,variant}', ''), p #>> '{vehicle,registrationState}',
      p #>> '{vehicle,registrationMasked}', p #>> '{vehicle,fuelType}', p #>> '{vehicle,transmission}',
      (p #>> '{vehicle,odometerKm}')::int, (p #>> '{vehicle,ownersCount}')::int, nullif(p #>> '{vehicle,insuranceValidUntil}', '')::date,
      coalesce(nullif(p #>> '{vehicle,pucStatus}', ''), 'UNKNOWN'), p #>> '{vehicle,accidentDisclosure}', p #>> '{vehicle,damageDisclosure}',
      nullif(p #>> '{vehicle,serviceHistory}', ''), p #>> '{vehicle,ownershipTransferTerms}')
    on conflict (asset_id) do update set manufacturer = excluded.manufacturer, variant = excluded.variant,
      registration_state = excluded.registration_state, registration_masked = excluded.registration_masked,
      fuel_type = excluded.fuel_type, transmission = excluded.transmission, odometer_km = excluded.odometer_km,
      owners_count = excluded.owners_count, insurance_valid_until = excluded.insurance_valid_until, puc_status = excluded.puc_status,
      accident_disclosure = excluded.accident_disclosure, damage_disclosure = excluded.damage_disclosure,
      service_history = excluded.service_history, ownership_transfer_terms = excluded.ownership_transfer_terms;
  else
    delete from auction.vehicle_details where asset_id = v_asset;
  end if;

  if p_auction is null then
    insert into auction.auctions (slug, asset_id, type, starting_price_paise, reserve_price_paise, reserve_disclosure,
      min_increment_paise, starts_at, ends_at, anti_snipe_window_s, anti_snipe_extend_s, max_extensions,
      deposit_mode, deposit_value, deposit_terms, winner_payment_deadline_hours, created_by)
    values (p ->> 'slug', v_asset, case when nullif(p ->> 'reservePricePaise', '') is null then 'TIMED_ENGLISH' else 'RESERVE' end,
      (p ->> 'startingPricePaise')::bigint, nullif(p ->> 'reservePricePaise', '')::bigint, coalesce(nullif(p ->> 'reserveDisclosure', ''), 'MET_FLAG'),
      (p ->> 'minIncrementPaise')::bigint, (p ->> 'startsAt')::timestamptz, (p ->> 'endsAt')::timestamptz,
      coalesce((p ->> 'antiSnipeWindowS')::int, 0), coalesce((p ->> 'antiSnipeExtendS')::int, 0), coalesce((p ->> 'maxExtensions')::int, 0),
      nullif(p ->> 'depositMode', ''), nullif(p ->> 'depositValue', '')::bigint, nullif(p ->> 'depositTerms', ''),
      nullif(p ->> 'winnerPaymentDeadlineHours', '')::int, v_uid)
    returning id into v_id;
    perform core.write_audit('auction.listing.create', 'auction', 'auctions', v_id::text, null, p, null);
    return v_id;
  end if;

  update auction.auctions set slug = p ->> 'slug',
    type = case when nullif(p ->> 'reservePricePaise', '') is null then 'TIMED_ENGLISH' else 'RESERVE' end,
    starting_price_paise = (p ->> 'startingPricePaise')::bigint, reserve_price_paise = nullif(p ->> 'reservePricePaise', '')::bigint,
    reserve_disclosure = coalesce(nullif(p ->> 'reserveDisclosure', ''), 'MET_FLAG'),
    min_increment_paise = (p ->> 'minIncrementPaise')::bigint, starts_at = (p ->> 'startsAt')::timestamptz, ends_at = (p ->> 'endsAt')::timestamptz,
    anti_snipe_window_s = coalesce((p ->> 'antiSnipeWindowS')::int, 0), anti_snipe_extend_s = coalesce((p ->> 'antiSnipeExtendS')::int, 0),
    max_extensions = coalesce((p ->> 'maxExtensions')::int, 0), deposit_mode = nullif(p ->> 'depositMode', ''),
    deposit_value = nullif(p ->> 'depositValue', '')::bigint, deposit_terms = nullif(p ->> 'depositTerms', ''),
    winner_payment_deadline_hours = nullif(p ->> 'winnerPaymentDeadlineHours', '')::int
  where id = p_auction;
  perform core.write_audit('auction.listing.update', 'auction', 'auctions', p_auction::text, null, p, null);
  return p_auction;
end;
$$;

-- Publishing computes and freezes the deposit; rejected without a valid positive deposit configuration (Test 1, 2).
create or replace function api.auction_admin_publish(p_auction uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.listings.approve'); a auction.auctions; v_amount bigint;
begin
  select * into a from auction.auctions where id = p_auction for update;
  if a.id is null or a.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: only draft auctions can be published' using errcode = 'P0001';
  end if;
  if a.deposit_mode is null or a.deposit_value is null then
    raise exception 'DEPOSIT_REQUIRED: configure the refundable participation deposit before publishing' using errcode = 'P0001';
  end if;
  if a.deposit_terms is null or a.winner_payment_deadline_hours is null then
    raise exception 'TERMS_REQUIRED: deposit terms and the winner payment deadline are required' using errcode = 'P0001';
  end if;
  if a.ends_at <= now() + interval '1 hour' then
    raise exception 'ENDS_TOO_SOON: the auction must end at least an hour from now' using errcode = 'P0001';
  end if;
  v_amount := auction.compute_deposit(a.deposit_mode, a.deposit_value, a.starting_price_paise);
  update auction.auctions set deposit_amount_paise = v_amount,
    terms_version = to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(md5(coalesce(a.deposit_terms, '')), 8),
    status = case when a.starts_at <= now() then 'LIVE' else 'SCHEDULED' end, published_at = now(), published_by = v_uid
  where id = a.id;
  perform core.write_audit('auction.publish', 'auction', 'auctions', a.id::text, null, jsonb_build_object('depositAmountPaise', v_amount), null);
  return jsonb_build_object('status', case when a.starts_at <= now() then 'LIVE' else 'SCHEDULED' end, 'depositAmountPaise', v_amount::text);
end;
$$;

-- Cancellation (admin, or seller withdrawal / asset unavailable): every paid deposit is refunded in full (Test 12).
create or replace function api.auction_admin_cancel(p_auction uuid, p_kind text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.cancel'); a auction.auctions; d record; v_n int := 0;
begin
  if p_kind not in ('ADMIN', 'SELLER_WITHDREW') then
    raise exception 'INVALID_REQUEST: kind must be ADMIN or SELLER_WITHDREW' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED: give a reason (at least 5 characters)' using errcode = 'P0001';
  end if;
  select * into a from auction.auctions where id = p_auction for update;
  if a.id is null or a.status not in ('DRAFT', 'SCHEDULED', 'LIVE') then
    raise exception 'INVALID_STATE: this auction can no longer be cancelled' using errcode = 'P0001';
  end if;
  if a.status = 'DRAFT' then
    raise exception 'INVALID_STATE: draft auctions are simply not published' using errcode = 'P0001';
  end if;
  update auction.auctions set status = 'CANCELLED', cancelled_at = now(), cancel_reason = btrim(p_reason) where id = a.id;
  insert into auction.results (auction_id, outcome) values (a.id, 'CANCELLED');
  for d in select * from auction.deposits where auction_id = a.id for update loop
    if d.status = 'PAID' then
      perform auction.create_refund(d.id, d.payment_attempt_id, case p_kind when 'ADMIN' then 'CANCELLED' else 'SELLER_CANCELLED' end, v_uid, btrim(p_reason));
      v_n := v_n + 1;
    elsif d.status = 'PAYMENT_PENDING' then
      update core.payment_attempts set status = 'EXPIRED' where id = d.payment_attempt_id and status in ('CREATED', 'PENDING');
      perform auction.transition_deposit(d.id, 'PAYMENT_FAILED', 'auction cancelled');
    end if;
  end loop;
  perform core.write_audit('auction.cancel', 'auction', 'auctions', a.id::text, null, jsonb_build_object('kind', p_kind, 'refunds', v_n), btrim(p_reason));
  return jsonb_build_object('status', 'CANCELLED', 'refunds', v_n);
end;
$$;

-- Staff close for an auction whose end time has passed (the scheduled job normally does this).
create or replace function api.auction_admin_close(p_auction uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.close.force');
begin
  return auction.close_auction(p_auction);
end;
$$;

-- Default review (§7.7). FORFEIT needs an approved policy version and two different approvers.
create or replace function api.auction_admin_decide_default(p_review uuid, p_decision text, p_reason text, p_extend_hours integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.default.review'); rv auction.default_reviews; i auction.invoices; d auction.deposits;
        v_policy text;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: document the decision (at least 10 characters)' using errcode = 'P0001';
  end if;
  select * into rv from auction.default_reviews where id = p_review for update;
  if rv.id is null then
    raise exception 'NOT_FOUND: review not found' using errcode = 'P0001';
  end if;
  select * into i from auction.invoices where id = rv.invoice_id for update;
  select * into d from auction.deposits where id = rv.deposit_id for update;

  if p_decision = 'EXTEND' then
    if p_extend_hours is null or p_extend_hours not between 1 and 336 then
      raise exception 'INVALID_REQUEST: extend by 1–336 hours' using errcode = 'P0001';
    end if;
    update auction.invoices set due_at = now() + make_interval(hours => p_extend_hours), status = 'ISSUED' where id = i.id;
    update auction.default_reviews set decision = 'EXTEND', reason = btrim(p_reason), decided_by = v_uid, decided_at = now() where id = rv.id;
  elsif p_decision = 'REFUND' then
    -- sale voided without penalty: deposit returned in full, invoice cancelled and reversed in the ledger
    update auction.invoices set status = 'CANCELLED' where id = i.id;
    perform ledger.post_journal('auction', 'INVOICE_CANCELLED', 'auction.invoices', i.id, 'auction:invoice-cancel:' || i.id::text,
      jsonb_build_array(
        jsonb_build_object('account', 'auction:seller_payable', 'debit', i.hammer_price_paise + i.charges_total_paise, 'user_id', i.winner_user_id),
        jsonb_build_object('account', 'auction:buyer_receivable', 'credit', i.hammer_price_paise + i.charges_total_paise, 'user_id', i.winner_user_id)));
    perform auction.create_refund(d.id, d.payment_attempt_id, 'DEFAULT_RESOLVED', v_uid, btrim(p_reason));
    update auction.default_reviews set decision = 'REFUND', reason = btrim(p_reason), decided_by = v_uid, decided_at = now() where id = rv.id;
  elsif p_decision = 'FORFEIT' then
    perform core.require_permission('auction.default.forfeit');
    v_policy := core.setting('auction.forfeiture_policy_approved_version') #>> '{}';
    if v_policy is null then
      raise exception 'FORFEIT_BLOCKED: no approved forfeiture policy is configured' using errcode = 'P0001';
    end if;
    if rv.decision = 'FORFEIT' and rv.decided_by is not null and rv.decided_by <> v_uid then
      update auction.default_reviews set second_approver_id = v_uid where id = rv.id;     -- second, different approver
      perform auction.transition_deposit(d.id, 'FORFEITED', btrim(p_reason));
    else
      update auction.default_reviews set decision = 'FORFEIT', reason = btrim(p_reason), decided_by = v_uid, policy_version = v_policy where id = rv.id;
      return jsonb_build_object('status', 'AWAITING_SECOND_APPROVER');
    end if;
  else
    raise exception 'INVALID_DECISION: %', p_decision using errcode = 'P0001';
  end if;
  perform core.write_audit('auction.default.decide', 'auction', 'default_reviews', rv.id::text, null, jsonb_build_object('decision', p_decision), btrim(p_reason));
  return jsonb_build_object('status', p_decision);
end;
$$;

create or replace function api.auction_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('auction.listings.manage');
  return coalesce((select jsonb_agg(auction.auction_json(a, false) || jsonb_build_object('rawStatus', a.status, 'updatedAt', a.updated_at)
                                    order by a.updated_at desc) from auction.auctions a), '[]'::jsonb);
end;
$$;

create or replace function api.auction_admin_get(p_auction uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform core.require_permission('auction.listings.manage');
  select auction.auction_json(a, true) || jsonb_build_object(
      'rawStatus', a.status, 'reservePricePaise', a.reserve_price_paise::text, 'reserveDisclosure', a.reserve_disclosure,
      'depositMode', a.deposit_mode, 'depositValue', a.deposit_value::text, 'cancelReason', a.cancel_reason,
      'sellerId', x.seller_id, 'city', x.location_city, 'state', x.location_state,
      'participants', (select count(*) from auction.participants p where p.auction_id = a.id),
      'paidDeposits', (select count(*) from auction.deposits d where d.auction_id = a.id and d.status not in ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED')))
    into v
  from auction.auctions a join auction.assets x on x.id = a.asset_id where a.id = p_auction;
  return v;
end;
$$;

-- Deposit administration (§11.4) — counts and money by state; deposits are liabilities, never revenue.
create or replace function api.auction_admin_deposits_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('auction.deposit.read');
  return jsonb_build_object(
    'byStatus', coalesce((select jsonb_object_agg(status, jsonb_build_object('count', n, 'amountPaise', amt::text))
                          from (select status, count(*) n, sum(amount_paise) amt from auction.deposits group by status) s), '{}'::jsonb),
    'refundsByStatus', coalesce((select jsonb_object_agg(status, jsonb_build_object('count', n, 'amountPaise', amt::text))
                          from (select status, count(*) n, sum(amount_paise) amt from auction.refunds group by status) s), '{}'::jsonb),
    'adjustedTotalPaise', (select coalesce(sum(amount_paise), 0)::text from auction.deposit_adjustments),
    'liabilityPaise', (select (coalesce(sum(credit_paise), 0) - coalesce(sum(debit_paise), 0))::text
                       from ledger.entries where account_code = 'auction:deposit_liability'),
    'openDefaultReviews', (select count(*) from auction.default_reviews where decided_at is null),
    'recent', coalesce((select jsonb_agg(row_to_json(t)) from (
       select d.id, d.status, d.amount_paise::text as "amountPaise", d.paid_at as "paidAt", x.title as "auctionTitle", a.id as "auctionId",
              (select pa.provider_payment_id from core.payment_attempts pa where pa.id = d.payment_attempt_id) as "paymentReference",
              coalesce(pr.display_name, 'User ' || left(d.user_id::text, 8)) as bidder,
              (select rf.id from auction.refunds rf where rf.payment_attempt_id = d.payment_attempt_id) as "refundId",
              (select rf.status from auction.refunds rf where rf.payment_attempt_id = d.payment_attempt_id) as "refundStatus",
              (select rf.last_error from auction.refunds rf where rf.payment_attempt_id = d.payment_attempt_id) as "refundError"
       from auction.deposits d join auction.auctions a on a.id = d.auction_id join auction.assets x on x.id = a.asset_id
       join core.profiles pr on pr.id = d.user_id
       order by d.updated_at desc limit 100) t), '[]'::jsonb)
  );
end;
$$;

-- Authorised retry of a failed refund (§11.4 "retry eligible failed refund").
create or replace function api.auction_admin_retry_refund(p_refund uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.deposit.refund.retry'); r auction.refunds;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED: give a reason' using errcode = 'P0001';
  end if;
  select * into r from auction.refunds where id = p_refund for update;
  if r.id is null or r.status <> 'REFUND_FAILED' then
    raise exception 'INVALID_STATE: only failed refunds can be retried' using errcode = 'P0001';
  end if;
  update auction.refunds set retryable = true, next_retry_at = now() where id = r.id;
  perform core.write_audit('auction.refund.retry', 'auction', 'refunds', r.id::text, null, null, btrim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'api' and p.proname like 'auction\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end$$;

grant execute on function api.auction_list_categories() to anon, authenticated;
grant execute on function api.auction_list(text, text, text, integer, integer) to anon, authenticated;
grant execute on function api.auction_get(text) to anon, authenticated;
grant execute on function api.auction_bid_history(text) to anon, authenticated;
grant execute on function api.auction_public_stats() to anon, authenticated;

grant execute on function api.auction_start_deposit(uuid, text) to authenticated;
grant execute on function api.auction_place_bid(uuid, bigint, text) to authenticated;
grant execute on function api.auction_start_invoice_payment(uuid) to authenticated;
grant execute on function api.auction_my_status(uuid) to authenticated;
grant execute on function api.auction_my_activity() to authenticated;

grant execute on function api.auction_admin_save_listing(uuid, jsonb) to authenticated;
grant execute on function api.auction_admin_publish(uuid) to authenticated;
grant execute on function api.auction_admin_cancel(uuid, text, text) to authenticated;
grant execute on function api.auction_admin_close(uuid) to authenticated;
grant execute on function api.auction_admin_decide_default(uuid, text, text, integer) to authenticated;
grant execute on function api.auction_admin_list() to authenticated;
grant execute on function api.auction_admin_get(uuid) to authenticated;
grant execute on function api.auction_admin_deposits_overview() to authenticated;
grant execute on function api.auction_admin_retry_refund(uuid, text) to authenticated;

grant execute on function api.auction_claim_refunds(integer) to service_role;
grant execute on function api.auction_record_refund_result(uuid, text, text, text, boolean) to service_role;
grant execute on function api.auction_close_due() to service_role;

revoke all on function auction.compute_deposit(text, bigint, bigint) from public, anon, authenticated;
revoke all on function auction.create_refund(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function auction.close_auction(uuid) from public, anon, authenticated;
revoke all on function auction.on_deposit_captured(uuid) from public, anon, authenticated;
revoke all on function auction.on_deposit_failed(uuid) from public, anon, authenticated;
revoke all on function auction.on_purchase_captured(uuid) from public, anon, authenticated;
revoke all on function auction.settle_invoice(uuid) from public, anon, authenticated;
revoke all on function auction.apply_refund_result(uuid, text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Checkout context for both domains (replaces the PoolX-only version from 0008; grants preserved)
-- ---------------------------------------------------------------------------
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
      from poolx.contributions c join poolx.pools p on p.id = c.pool_id where c.id = a.reference_id) end,
    'auction', case
      when a.purpose = 'AUCTION_DEPOSIT' then (
        select jsonb_build_object('slug', au.slug, 'title', x.title, 'kind', 'deposit')
        from auction.deposits d join auction.auctions au on au.id = d.auction_id join auction.assets x on x.id = au.asset_id
        where d.id = a.reference_id)
      when a.purpose = 'AUCTION_PURCHASE' then (
        select jsonb_build_object('slug', au.slug, 'title', x.title, 'kind', 'purchase')
        from auction.invoices i join auction.auctions au on au.id = i.auction_id join auction.assets x on x.id = au.asset_id
        where i.id = a.reference_id) end)
  from core.payment_attempts a
  where a.id = p_attempt and a.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Deposit policy (§7.1) — staff can set amounts; there is no way to disable or zero the deposit.
-- ---------------------------------------------------------------------------
create or replace function api.auction_admin_get_deposit_policy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('auction.deposit.config');
  return jsonb_build_object(
    'globalMinPaise', core.setting('auction.deposit.global_min_paise')::text,
    'globalMaxPaise', core.setting('auction.deposit.global_max_paise')::text,
    'bidderVerificationLevel', coalesce(core.setting('auction.bidder_verification_level') #>> '{}', 'EMAIL'));
end;
$$;

create or replace function api.auction_admin_set_deposit_policy(p_min_paise bigint, p_max_paise bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('auction.deposit.config'); v_before jsonb;
begin
  if p_min_paise is null or p_min_paise <= 0 then
    raise exception 'DEPOSIT_REQUIRED: the minimum deposit must be greater than zero' using errcode = 'P0001';
  end if;
  if p_max_paise is not null and p_max_paise < p_min_paise then
    raise exception 'INVALID_REQUEST: the maximum must be at least the minimum' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'REASON_REQUIRED: give a reason for the change' using errcode = 'P0001';
  end if;
  v_before := jsonb_build_object('min', core.setting('auction.deposit.global_min_paise'), 'max', core.setting('auction.deposit.global_max_paise'));
  insert into core.system_settings (key, value, updated_by) values ('auction.deposit.global_min_paise', to_jsonb(p_min_paise), v_uid)
  on conflict (key) do update set value = excluded.value, updated_by = v_uid, updated_at = now();
  if p_max_paise is null then
    -- settings are never deleted; a very high max effectively removes the cap
    insert into core.system_settings (key, value, updated_by) values ('auction.deposit.global_max_paise', to_jsonb(100000000000000::bigint), v_uid)
    on conflict (key) do update set value = excluded.value, updated_by = v_uid, updated_at = now();
  else
    insert into core.system_settings (key, value, updated_by) values ('auction.deposit.global_max_paise', to_jsonb(p_max_paise), v_uid)
    on conflict (key) do update set value = excluded.value, updated_by = v_uid, updated_at = now();
  end if;
  perform core.write_audit('auction.deposit_policy.update', 'core', 'system_settings', 'auction.deposit', v_before,
    jsonb_build_object('min', p_min_paise, 'max', p_max_paise), btrim(p_reason));
end;
$$;

revoke all on function api.auction_admin_get_deposit_policy() from public, anon;
revoke all on function api.auction_admin_set_deposit_policy(bigint, bigint, text) from public, anon;
grant execute on function api.auction_admin_get_deposit_policy() to authenticated;
grant execute on function api.auction_admin_set_deposit_policy(bigint, bigint, text) to authenticated;

-- Open and recent winner-default reviews (§7.6): decided by staff; FORFEIT needs an approved policy and two approvers.
create or replace function api.auction_admin_list_default_reviews()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('auction.default.review');
  return coalesce((select jsonb_agg(row_to_json(t) order by t."openedAt" desc) from (
    select rv.id, rv.opened_at as "openedAt", rv.decision, rv.reason, rv.decided_at as "decidedAt",
           rv.second_approver_id is not null as "secondApproved", rv.decided_by as "decidedBy",
           x.title as "auctionTitle", a.id as "auctionId", i.total_payable_paise::text as "totalPayablePaise",
           i.amount_paid_paise::text as "amountPaidPaise", i.due_at as "dueAt", i.status as "invoiceStatus",
           d.amount_paise::text as "depositPaise", d.status as "depositStatus",
           coalesce(pr.display_name, 'User ' || left(i.winner_user_id::text, 8)) as winner
    from auction.default_reviews rv
    join auction.invoices i on i.id = rv.invoice_id
    join auction.deposits d on d.id = rv.deposit_id
    join auction.auctions a on a.id = i.auction_id
    join auction.assets x on x.id = a.asset_id
    join core.profiles pr on pr.id = i.winner_user_id
    order by rv.opened_at desc limit 100) t), '[]'::jsonb);
end;
$$;
revoke all on function api.auction_admin_list_default_reviews() from public, anon;
grant execute on function api.auction_admin_list_default_reviews() to authenticated;
