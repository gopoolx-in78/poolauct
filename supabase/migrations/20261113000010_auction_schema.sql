-- 0010 — Auction domain schema. Never references the poolx schema.
-- See AUCTION_REQUIREMENTS.md and AUCTION_DEPOSIT_RULES.md (non-negotiable mandatory refundable deposit).

grant usage on schema auction to authenticated;

-- ---------------------------------------------------------------------------
-- System settings (validated per key). Values are OWNER decisions (OD-04/OD-05) — no production defaults are seeded.
-- ---------------------------------------------------------------------------
create table core.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*[a-z0-9]$'),
  value jsonb not null,
  updated_by uuid references core.profiles (id),
  updated_at timestamptz not null default now(),
  -- Deposit settings can only ever be positive: there is no way to configure a zero or disabled deposit.
  constraint settings_deposit_min_positive check (
    key <> 'auction.deposit.global_min_paise' or (jsonb_typeof(value) = 'number' and (value)::text::numeric > 0
      and (value)::text::numeric = trunc((value)::text::numeric))),
  constraint settings_deposit_max_positive check (
    key <> 'auction.deposit.global_max_paise' or (jsonb_typeof(value) = 'number' and (value)::text::numeric > 0
      and (value)::text::numeric = trunc((value)::text::numeric))),
  constraint settings_bidder_level check (
    key <> 'auction.bidder_verification_level' or value in ('"EMAIL"'::jsonb, '"BIDDER_KYC"'::jsonb)),
  constraint settings_no_deposit_switch check (key !~ 'deposit\.(enabled|disabled|required|optional|off)')
);
create trigger system_settings_no_delete before delete on core.system_settings for each row execute function core.forbid_delete();
alter table core.system_settings enable row level security;
grant select on core.system_settings to authenticated;
create policy system_settings_select_staff on core.system_settings for select to authenticated
  using (core.has_permission('system.settings') or core.has_permission('auction.deposit.config'));

create or replace function core.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select value from core.system_settings where key = p_key; $$;
revoke all on function core.setting(text) from public;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table auction.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  parent_id uuid references auction.categories (id),
  is_vehicle boolean not null default false,
  sort integer not null default 0,
  is_active boolean not null default true
);
insert into auction.categories (slug, name, is_vehicle, sort) values
  ('used-cars', 'Used Cars', true, 10), ('motorcycles', 'Motorcycles', true, 20), ('scooters', 'Scooters', true, 30),
  ('commercial-vehicles', 'Commercial Vehicles', true, 40), ('electronics', 'Electronics', false, 50),
  ('laptops', 'Laptops', false, 60), ('smartphones', 'Smartphones', false, 70), ('furniture', 'Furniture', false, 80),
  ('industrial-machinery', 'Industrial Machinery', false, 90), ('commercial-equipment', 'Commercial Equipment', false, 100),
  ('other-assets', 'Other Assets', false, 110);

create table auction.sellers (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'PLATFORM' check (kind in ('PLATFORM', 'THIRD_PARTY')),
  display_name text not null check (char_length(display_name) between 2 and 120),
  profile_id uuid references core.profiles (id),
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'SUSPENDED')),
  verified_by uuid references core.profiles (id),
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  constraint auction_sellers_verified_documented check (verification_status <> 'VERIFIED' or (verified_by is not null and verified_at is not null))
);

create table auction.assets (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auction.sellers (id),
  category_id uuid not null references auction.categories (id),
  title text not null check (char_length(title) between 3 and 140),
  brand text check (char_length(brand) <= 80),
  model text check (char_length(model) <= 80),
  manufacture_year integer check (manufacture_year is null or manufacture_year between 1900 and 2100),
  condition text not null check (condition in ('LIKE_NEW', 'GOOD', 'FAIR', 'POOR', 'FOR_PARTS')),
  description text not null check (char_length(description) between 20 and 8000),
  location_city text not null check (char_length(location_city) between 2 and 80),
  location_state text not null check (char_length(location_state) between 2 and 80),
  pickup_terms text not null check (char_length(pickup_terms) between 5 and 2000),
  -- itemised, disclosed charges: [{"label": "Documentation fee", "amountPaise": 50000}]
  charges jsonb not null default '[]'::jsonb check (jsonb_typeof(charges) = 'array'),
  created_by uuid references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger assets_set_updated_at before update on auction.assets for each row execute function core.set_updated_at();

create table auction.vehicle_details (
  asset_id uuid primary key references auction.assets (id) on delete cascade,
  manufacturer text not null check (char_length(manufacturer) between 2 and 80),
  variant text check (char_length(variant) <= 80),
  registration_state text not null check (char_length(registration_state) between 2 and 40),
  -- Only a masked form is stored here; the full number lives in private verification documents.
  registration_masked text not null check (registration_masked ~ '^[A-Z0-9 •]{4,20}$' and registration_masked like '%•%'),
  fuel_type text not null check (fuel_type in ('PETROL', 'DIESEL', 'CNG', 'LPG', 'ELECTRIC', 'HYBRID')),
  transmission text not null check (transmission in ('MANUAL', 'AUTOMATIC')),
  odometer_km integer not null check (odometer_km between 0 and 5000000),
  owners_count integer not null check (owners_count between 0 and 20),
  insurance_valid_until date,
  rc_status text not null default 'NOT_VERIFIED' check (rc_status in ('NOT_VERIFIED', 'MANUALLY_VERIFIED', 'PROVIDER_VERIFIED')),
  rc_verified_by uuid references core.profiles (id),
  rc_verified_at timestamptz,
  rc_verification_evidence text check (char_length(rc_verification_evidence) <= 1000),
  puc_status text not null default 'UNKNOWN' check (puc_status in ('VALID', 'EXPIRED', 'NOT_APPLICABLE', 'UNKNOWN')),
  accident_disclosure text not null check (char_length(accident_disclosure) between 2 and 2000),
  damage_disclosure text not null check (char_length(damage_disclosure) between 2 and 2000),
  service_history text check (char_length(service_history) <= 2000),
  ownership_transfer_terms text not null check (char_length(ownership_transfer_terms) between 5 and 2000),
  -- never claim RC verification without a documented verifier, time and evidence
  constraint vehicle_rc_documented check (rc_status = 'NOT_VERIFIED' or
    (rc_verified_by is not null and rc_verified_at is not null and rc_verification_evidence is not null))
);

create table auction.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references auction.assets (id) on delete cascade,
  inspector_name text not null check (char_length(inspector_name) between 2 and 120),
  inspected_at date not null,
  location text not null check (char_length(location) between 2 and 200),
  summary text not null check (char_length(summary) between 10 and 4000),
  is_verified boolean not null default false,
  verified_by uuid references core.profiles (id),
  verified_at timestamptz,
  constraint inspection_verified_documented check (not is_verified or (verified_by is not null and verified_at is not null))
);

-- ---------------------------------------------------------------------------
-- Auctions — the mandatory refundable deposit is enforced here (D-1, D-2, D-3)
-- ---------------------------------------------------------------------------
create table auction.auctions (
  id uuid primary key default gen_random_uuid(),
  -- reserved words would collide with the static /auctions/browse, /sell and /category routes
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 90
                                   and slug not in ('browse', 'sell', 'category')),
  asset_id uuid not null unique references auction.assets (id),
  type text not null default 'TIMED_ENGLISH' check (type in ('TIMED_ENGLISH', 'RESERVE')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED', 'CANCELLED')),
  starting_price_paise bigint not null check (starting_price_paise > 0),
  reserve_price_paise bigint,
  reserve_disclosure text not null default 'MET_FLAG' check (reserve_disclosure in ('HIDDEN', 'MET_FLAG')),
  min_increment_paise bigint not null check (min_increment_paise > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  original_ends_at timestamptz,
  anti_snipe_window_s integer not null default 0 check (anti_snipe_window_s between 0 and 3600),
  anti_snipe_extend_s integer not null default 0 check (anti_snipe_extend_s between 0 and 3600),
  max_extensions integer not null default 0 check (max_extensions between 0 and 100),
  extensions_used integer not null default 0 check (extensions_used >= 0),
  -- deposit configuration (required to publish; amount computed and frozen at publish)
  deposit_mode text check (deposit_mode in ('FIXED', 'PERCENT_OF_STARTING')),
  deposit_value bigint check (deposit_value > 0),               -- paise for FIXED, basis points for PERCENT
  deposit_amount_paise bigint check (deposit_amount_paise > 0),
  deposit_terms text check (char_length(deposit_terms) between 20 and 4000),
  terms_version text,
  winner_payment_deadline_hours integer check (winner_payment_deadline_hours between 1 and 720),
  current_bid_paise bigint check (current_bid_paise > 0),
  leader_bid_id uuid,
  bid_count integer not null default 0 check (bid_count >= 0),
  published_at timestamptz,
  published_by uuid references core.profiles (id),
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auctions_reserve_valid check (reserve_price_paise is null or reserve_price_paise >= starting_price_paise),
  constraint auctions_reserve_type check ((type = 'RESERVE') = (reserve_price_paise is not null)),
  constraint auctions_window check (ends_at > starts_at),
  constraint auctions_percent_bps check (deposit_mode <> 'PERCENT_OF_STARTING' or deposit_value <= 10000),
  constraint auctions_deposit_mode_value check ((deposit_mode is null) = (deposit_value is null)),
  -- D-1: every non-draft auction carries a positive, frozen deposit and the terms to show bidders
  constraint auctions_published_deposit check (
    status = 'DRAFT' or (deposit_mode is not null and deposit_value is not null and deposit_amount_paise > 0
                         and deposit_terms is not null and terms_version is not null
                         and winner_payment_deadline_hours is not null and published_at is not null))
);
create index auctions_status_ends_idx on auction.auctions (status, ends_at);
create index auctions_starts_idx on auction.auctions (status, starts_at);
create trigger auctions_set_updated_at before update on auction.auctions for each row execute function core.set_updated_at();

-- D-3: once published, the deposit and the price rules are frozen.
create or replace function auction.freeze_published_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' and (
       new.deposit_amount_paise is distinct from old.deposit_amount_paise
    or new.deposit_mode is distinct from old.deposit_mode
    or new.deposit_value is distinct from old.deposit_value
    or new.starting_price_paise is distinct from old.starting_price_paise
    or new.reserve_price_paise is distinct from old.reserve_price_paise
    or new.min_increment_paise is distinct from old.min_increment_paise
    or new.asset_id is distinct from old.asset_id) then
    raise exception 'FROZEN: deposit and price rules cannot change after publishing' using errcode = 'P0001';
  end if;
  if new.status = 'DRAFT' and old.status <> 'DRAFT' then
    raise exception 'FROZEN: a published auction cannot return to draft' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger auctions_freeze_published before update on auction.auctions
  for each row execute function auction.freeze_published_terms();

-- ---------------------------------------------------------------------------
-- Participation and deposits (D-4 … D-8)
-- ---------------------------------------------------------------------------
create table auction.participants (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auction.auctions (id),
  user_id uuid not null references core.profiles (id),
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  status text not null default 'REGISTERED' check (status in ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
  alias integer,                                   -- pseudonymous bidder number shown in bid history
  created_at timestamptz not null default now(),
  unique (auction_id, user_id),
  unique (auction_id, alias)
);

create table auction.deposits (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references auction.participants (id),
  auction_id uuid not null references auction.auctions (id),
  user_id uuid not null references core.profiles (id),
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'CREATED' check (status in (
    'CREATED', 'PAYMENT_PENDING', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_REVERSED', 'REFUND_ELIGIBLE', 'REFUND_INITIATED',
    'REFUND_PROCESSING', 'REFUNDED', 'REFUND_FAILED', 'WINNER_ADJUSTMENT_PENDING', 'ADJUSTED', 'DEFAULT_REVIEW', 'FORFEITED')),
  payment_attempt_id uuid unique references core.payment_attempts (id),     -- the attempt that paid / is paying it
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auction_id, user_id),                                            -- D-5: one deposit per user per auction
  -- D-6: anything past PAID must reference the verified payment that paid it
  constraint deposits_paid_has_payment check (
    status in ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_FAILED') or (paid_at is not null and payment_attempt_id is not null))
);
create index deposits_user_idx on auction.deposits (user_id, created_at desc);
create index deposits_status_idx on auction.deposits (status);
create trigger deposits_set_updated_at before update on auction.deposits for each row execute function core.set_updated_at();
create trigger deposits_no_delete before delete on auction.deposits for each row execute function core.forbid_delete();

-- the deposit's auction and user can never change (no transfer between users or auctions)
create or replace function auction.deposit_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auction_id <> old.auction_id or new.user_id <> old.user_id or new.participant_id <> old.participant_id
     or new.amount_paise <> old.amount_paise then
    raise exception 'IMMUTABLE: a deposit cannot move between users or auctions, or change amount' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger deposits_identity_immutable before update on auction.deposits
  for each row execute function auction.deposit_identity_immutable();

-- §7.9 state machine as data
create table auction.deposit_transitions_allowed (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);
insert into auction.deposit_transitions_allowed values
  ('CREATED', 'PAYMENT_PENDING'),
  ('PAYMENT_PENDING', 'PAID'), ('PAYMENT_PENDING', 'PAYMENT_FAILED'),
  ('PAYMENT_FAILED', 'PAYMENT_PENDING'), ('PAYMENT_FAILED', 'PAID'),          -- retry; or a late capture of the earlier attempt
  ('PAID', 'REFUND_ELIGIBLE'), ('PAID', 'WINNER_ADJUSTMENT_PENDING'), ('PAID', 'PAYMENT_REVERSED'),
  ('REFUND_ELIGIBLE', 'REFUND_INITIATED'),
  ('REFUND_INITIATED', 'REFUND_PROCESSING'), ('REFUND_INITIATED', 'REFUNDED'), ('REFUND_INITIATED', 'REFUND_FAILED'),
  ('REFUND_PROCESSING', 'REFUNDED'), ('REFUND_PROCESSING', 'REFUND_FAILED'),
  ('REFUND_FAILED', 'REFUND_INITIATED'),
  ('WINNER_ADJUSTMENT_PENDING', 'ADJUSTED'), ('WINNER_ADJUSTMENT_PENDING', 'DEFAULT_REVIEW'),
  ('WINNER_ADJUSTMENT_PENDING', 'REFUND_ELIGIBLE'),
  ('DEFAULT_REVIEW', 'ADJUSTED'), ('DEFAULT_REVIEW', 'REFUND_ELIGIBLE'), ('DEFAULT_REVIEW', 'FORFEITED');

create table auction.deposit_history (
  id bigint generated always as identity primary key,
  deposit_id uuid not null references auction.deposits (id),
  from_status text,
  to_status text not null,
  actor_id uuid references core.profiles (id),
  reason text,
  at timestamptz not null default now()
);
create index deposit_history_deposit_idx on auction.deposit_history (deposit_id, id);
create trigger deposit_history_append_only before update or delete on auction.deposit_history
  for each row execute function core.forbid_mutation();

-- Only valid transitions; every change recorded. Status may ONLY change through auction.transition_deposit().
create or replace function auction.check_deposit_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if current_setting('auction.transition_ok', true) is distinct from 'on' then
      raise exception 'DIRECT_STATUS_CHANGE: use auction.transition_deposit()' using errcode = 'P0001';
    end if;
    if not exists (select 1 from auction.deposit_transitions_allowed where from_status = old.status and to_status = new.status) then
      raise exception 'INVALID_TRANSITION: % → %', old.status, new.status using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger deposits_valid_transition before update of status on auction.deposits
  for each row execute function auction.check_deposit_transition();

create or replace function auction.transition_deposit(p_deposit uuid, p_to text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_from text;
begin
  select status into v_from from auction.deposits where id = p_deposit for update;
  if v_from = p_to then
    return;                                                  -- idempotent
  end if;
  perform set_config('auction.transition_ok', 'on', true);
  update auction.deposits set status = p_to,
         paid_at = case when p_to = 'PAID' then coalesce(paid_at, now()) else paid_at end
   where id = p_deposit;
  perform set_config('auction.transition_ok', 'off', true);
  insert into auction.deposit_history (deposit_id, from_status, to_status, actor_id, reason)
  values (p_deposit, v_from, p_to, auth.uid(), p_reason);
end;
$$;
revoke all on function auction.transition_deposit(uuid, text, text) from public, anon, authenticated;

-- FORFEITED requires an approved, published forfeiture policy (OD-11) — blocked until the owner configures one.
create or replace function auction.guard_forfeit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'FORFEITED' and old.status <> 'FORFEITED' then
    if core.setting('auction.forfeiture_policy_approved_version') is null then
      raise exception 'FORFEIT_BLOCKED: no approved forfeiture policy is configured' using errcode = 'P0001';
    end if;
    if not exists (select 1 from auction.default_reviews r where r.deposit_id = new.id and r.decision = 'FORFEIT'
                   and r.second_approver_id is not null and r.second_approver_id <> r.decided_by) then
      raise exception 'FORFEIT_BLOCKED: forfeiture needs a documented two-person decision' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bids
-- ---------------------------------------------------------------------------
create table auction.bids (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  auction_id uuid not null references auction.auctions (id),
  participant_id uuid not null references auction.participants (id),
  user_id uuid not null references core.profiles (id),
  amount_paise bigint not null check (amount_paise > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  accepted_at timestamptz not null default clock_timestamp(),
  status text not null default 'ACCEPTED' check (status in ('ACCEPTED', 'VOIDED')),
  unique (auction_id, idempotency_key)                                    -- replay / double-submit protection
);
create unique index bids_one_accepted_amount on auction.bids (auction_id, amount_paise) where status = 'ACCEPTED';
create index bids_auction_idx on auction.bids (auction_id, amount_paise desc, seq);
create index bids_user_idx on auction.bids (user_id, accepted_at desc);
create trigger bids_no_delete before delete on auction.bids for each row execute function core.forbid_delete();
alter table auction.auctions add constraint auctions_leader_fk foreign key (leader_bid_id) references auction.bids (id);

-- Defence in depth (D-4, §8.1): a bid row can only exist for a PAID depositor who is not the seller, in a live window.
create or replace function auction.check_bid_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a auction.auctions; v_seller_profile uuid; v_deposit_status text; v_participant_status text;
begin
  select * into a from auction.auctions where id = new.auction_id;
  if a.status not in ('SCHEDULED', 'LIVE') or new.accepted_at < a.starts_at or new.accepted_at >= a.ends_at then
    raise exception 'AUCTION_NOT_LIVE: bids are only accepted while the auction is live' using errcode = 'P0001';
  end if;
  select s.profile_id into v_seller_profile from auction.assets x join auction.sellers s on s.id = x.seller_id where x.id = a.asset_id;
  if v_seller_profile = new.user_id then
    raise exception 'SELLER_CANNOT_BID: sellers cannot bid on their own auction' using errcode = 'P0001';
  end if;
  select p.status, d.status into v_participant_status, v_deposit_status
    from auction.participants p left join auction.deposits d on d.participant_id = p.id
   where p.id = new.participant_id and p.auction_id = new.auction_id and p.user_id = new.user_id;
  if v_deposit_status is distinct from 'PAID' or v_participant_status is distinct from 'ACTIVE' then
    raise exception 'DEPOSIT_REQUIRED: a paid deposit for this auction is required to bid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger bids_require_paid_deposit before insert on auction.bids
  for each row execute function auction.check_bid_insert();

-- ---------------------------------------------------------------------------
-- Results, invoices, adjustments, payments, refunds, default reviews
-- ---------------------------------------------------------------------------
create table auction.results (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null unique references auction.auctions (id),              -- one result per auction
  outcome text not null check (outcome in ('WON', 'RESERVE_NOT_MET', 'NO_BIDS', 'CANCELLED')),
  winning_bid_id uuid unique references auction.bids (id),
  winner_user_id uuid references core.profiles (id),
  final_price_paise bigint check (final_price_paise > 0),
  closed_at timestamptz not null default now(),
  constraint results_winner_consistent check ((outcome = 'WON') = (winning_bid_id is not null and winner_user_id is not null
                                                                   and final_price_paise is not null))
);
create trigger results_append_only before update or delete on auction.results for each row execute function core.forbid_mutation();

create table auction.invoices (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null unique references auction.results (id),
  auction_id uuid not null unique references auction.auctions (id),
  winner_user_id uuid not null references core.profiles (id),
  hammer_price_paise bigint not null check (hammer_price_paise > 0),
  charges jsonb not null default '[]'::jsonb,
  charges_total_paise bigint not null default 0 check (charges_total_paise >= 0),
  deposit_credit_paise bigint not null check (deposit_credit_paise > 0),
  total_payable_paise bigint not null check (total_payable_paise >= 0),
  amount_paid_paise bigint not null default 0 check (amount_paid_paise >= 0),
  due_at timestamptz not null,
  status text not null default 'ISSUED' check (status in ('ISSUED', 'PAID', 'OVERDUE', 'DEFAULT_REVIEW', 'CANCELLED')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- §7.6: the deposit is shown as already paid and deducted exactly once from the balance
  constraint invoices_total_formula check (total_payable_paise = hammer_price_paise + charges_total_paise - deposit_credit_paise),
  constraint invoices_paid_within check (amount_paid_paise <= total_payable_paise),
  constraint invoices_paid_consistent check ((status = 'PAID') = (paid_at is not null))
);
create trigger invoices_set_updated_at before update on auction.invoices for each row execute function core.set_updated_at();
create trigger invoices_no_delete before delete on auction.invoices for each row execute function core.forbid_delete();

create table auction.deposit_adjustments (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null unique references auction.deposits (id),               -- credited once …
  invoice_id uuid not null unique references auction.invoices (id),               -- … to exactly one invoice
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);
create trigger deposit_adjustments_append_only before update or delete on auction.deposit_adjustments
  for each row execute function core.forbid_mutation();

create table auction.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references auction.invoices (id),
  payment_attempt_id uuid not null unique references core.payment_attempts (id),
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CAPTURED', 'FAILED', 'EXPIRED')),
  created_at timestamptz not null default now()
);
create unique index purchase_payments_one_pending on auction.purchase_payments (invoice_id) where status = 'PENDING';

create table auction.refunds (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references auction.deposits (id),
  payment_attempt_id uuid not null references core.payment_attempts (id),       -- the payment being returned
  auction_id uuid not null references auction.auctions (id),
  user_id uuid not null references core.profiles (id),
  amount_paise bigint not null check (amount_paise > 0),
  reason text not null check (reason in ('LOST', 'NO_BID', 'CANCELLED', 'SELLER_CANCELLED', 'RESERVE_NOT_MET', 'NO_WINNER',
                                         'LATE_CAPTURE', 'DUPLICATE_PAYMENT', 'DEFAULT_RESOLVED', 'MANUAL')),
  status text not null default 'REFUND_ELIGIBLE' check (status in (
    'REFUND_ELIGIBLE', 'REFUND_INITIATED', 'REFUND_PROCESSING', 'REFUNDED', 'REFUND_FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  next_retry_at timestamptz,
  retryable boolean not null default true,
  last_error text,
  provider_refund_id text,
  initiated_by uuid references core.profiles (id),
  note text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auction_refunds_refunded_time check ((status = 'REFUNDED') = (refunded_at is not null))
);
-- one refund per payment attempt (idempotent; a deposit payment is never refunded twice)
create unique index auction_refunds_one_per_payment on auction.refunds (payment_attempt_id);
create index auction_refunds_status_idx on auction.refunds (status, next_retry_at);
create index auction_refunds_user_idx on auction.refunds (user_id, created_at desc);
create trigger auction_refunds_set_updated_at before update on auction.refunds for each row execute function core.set_updated_at();
create trigger auction_refunds_no_delete before delete on auction.refunds for each row execute function core.forbid_delete();

-- D-9: a deposit refund is always the FULL amount of that payment — no fees, commissions or penalties deducted.
create or replace function auction.check_full_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_paid bigint;
begin
  select amount_paise into v_paid from core.payment_attempts where id = new.payment_attempt_id;
  if new.amount_paise <> v_paid then
    raise exception 'FULL_REFUND_REQUIRED: deposit refunds must return the full % paise paid', v_paid using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger auction_refunds_full_amount before insert or update of amount_paise on auction.refunds
  for each row execute function auction.check_full_refund();

create table auction.default_reviews (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references auction.invoices (id),
  deposit_id uuid not null references auction.deposits (id),
  opened_at timestamptz not null default now(),
  decision text check (decision in ('EXTEND', 'REFUND', 'FORFEIT')),
  reason text check (char_length(reason) <= 2000),
  decided_by uuid references core.profiles (id),
  second_approver_id uuid references core.profiles (id),
  policy_version text,
  decided_at timestamptz,
  constraint default_reviews_forfeit_controls check (decision is distinct from 'FORFEIT' or (
    policy_version is not null and char_length(coalesce(reason, '')) >= 20 and decided_by is not null
    and second_approver_id is not null and second_approver_id <> decided_by))
);

-- named to sort after deposits_valid_transition: Postgres fires same-event triggers alphabetically, so the
-- state machine always rejects invalid transitions first.
create trigger deposits_zz_guard_forfeit before update of status on auction.deposits
  for each row execute function auction.guard_forfeit();

-- ---------------------------------------------------------------------------
-- RLS: reads through api.* functions; tables visible to owners and auction/finance staff only; no end-user writes.
-- ---------------------------------------------------------------------------
alter table auction.categories enable row level security;
alter table auction.sellers enable row level security;
alter table auction.assets enable row level security;
alter table auction.vehicle_details enable row level security;
alter table auction.inspection_reports enable row level security;
alter table auction.auctions enable row level security;
alter table auction.participants enable row level security;
alter table auction.deposits enable row level security;
alter table auction.deposit_transitions_allowed enable row level security;
alter table auction.deposit_history enable row level security;
alter table auction.bids enable row level security;
alter table auction.results enable row level security;
alter table auction.invoices enable row level security;
alter table auction.deposit_adjustments enable row level security;
alter table auction.purchase_payments enable row level security;
alter table auction.refunds enable row level security;
alter table auction.default_reviews enable row level security;

grant select on all tables in schema auction to authenticated;

create policy categories_select on auction.categories for select to authenticated using (true);
create policy transitions_select on auction.deposit_transitions_allowed for select to authenticated using (true);
create policy sellers_select on auction.sellers for select to authenticated
  using (profile_id = auth.uid() or core.has_permission('auction.listings.manage') or core.has_permission('sellers.manage'));
create policy assets_select on auction.assets for select to authenticated using (core.has_permission('auction.listings.manage'));
create policy vehicle_select on auction.vehicle_details for select to authenticated using (core.has_permission('auction.listings.manage'));
create policy inspection_select on auction.inspection_reports for select to authenticated using (core.has_permission('auction.listings.manage'));
create policy auctions_select on auction.auctions for select to authenticated using (core.has_permission('auction.listings.manage'));
create policy participants_select on auction.participants for select to authenticated
  using (user_id = auth.uid() or core.has_permission('auction.deposit.read'));
create policy deposits_select on auction.deposits for select to authenticated
  using (user_id = auth.uid() or core.has_permission('auction.deposit.read'));
create policy deposit_history_select on auction.deposit_history for select to authenticated
  using (exists (select 1 from auction.deposits d where d.id = deposit_id and d.user_id = auth.uid())
         or core.has_permission('auction.deposit.read'));
create policy bids_select on auction.bids for select to authenticated
  using (user_id = auth.uid() or core.has_permission('auction.bids.read_identities'));
create policy results_select on auction.results for select to authenticated
  using (winner_user_id = auth.uid() or core.has_permission('auction.listings.manage') or core.has_permission('auction.deposit.read'));
create policy invoices_select on auction.invoices for select to authenticated
  using (winner_user_id = auth.uid() or core.has_permission('finance.ledger.read') or core.has_permission('auction.default.review'));
create policy adjustments_select on auction.deposit_adjustments for select to authenticated
  using (exists (select 1 from auction.deposits d where d.id = deposit_id and d.user_id = auth.uid())
         or core.has_permission('auction.deposit.read'));
create policy purchase_payments_select on auction.purchase_payments for select to authenticated
  using (exists (select 1 from auction.invoices i where i.id = invoice_id and i.winner_user_id = auth.uid())
         or core.has_permission('finance.ledger.read'));
create policy refunds_select on auction.refunds for select to authenticated
  using (user_id = auth.uid() or core.has_permission('auction.deposit.read'));
create policy default_reviews_select on auction.default_reviews for select to authenticated
  using (core.has_permission('auction.default.review'));
