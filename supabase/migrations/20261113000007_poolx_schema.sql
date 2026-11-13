-- 0007 — PoolX domain tables. Never references the auction schema.
-- See project-management/POOLX_REQUIREMENTS.md.

grant usage on schema poolx to authenticated;

-- ---------------------------------------------------------------------------
-- Categories (reference data; admin-managed)
-- ---------------------------------------------------------------------------
create table poolx.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_set_updated_at before update on poolx.categories for each row execute function core.set_updated_at();

insert into poolx.categories (slug, name, sort) values
  ('electronics', 'Electronics', 10),
  ('smartphones', 'Smartphones', 20),
  ('laptops', 'Laptops', 30),
  ('groceries', 'Groceries', 40),
  ('construction-materials', 'Construction materials', 50),
  ('cement-and-steel', 'Cement and steel', 60),
  ('society-purchases', 'Society purchases', 70),
  ('office-supplies', 'Office supplies', 80),
  ('household-products', 'Household products', 90),
  ('commercial-supplies', 'Commercial supplies', 100),
  ('services', 'Services', 110),
  ('custom-group-purchases', 'Custom group purchases', 120);

-- ---------------------------------------------------------------------------
-- Sellers
-- ---------------------------------------------------------------------------
create table poolx.sellers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 120),
  profile_id uuid references core.profiles (id),
  verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED', 'VERIFIED', 'SUSPENDED')),
  verified_by uuid references core.profiles (id),
  verified_at timestamptz,
  verification_note text,
  created_by uuid references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- VERIFIED requires a documented verifier and time (no unsupported "verified" badges)
  constraint sellers_verified_documented check (verification_status <> 'VERIFIED' or (verified_by is not null and verified_at is not null))
);
create trigger sellers_set_updated_at before update on poolx.sellers for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pools
-- ---------------------------------------------------------------------------
create table poolx.pools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  title text not null check (char_length(title) between 3 and 120),
  summary text not null check (char_length(summary) between 10 and 240),
  description text not null default '' check (char_length(description) <= 5000),
  product_name text not null check (char_length(product_name) between 2 and 120),
  specs jsonb not null default '[]'::jsonb check (jsonb_typeof(specs) = 'array'),
  category_id uuid not null references poolx.categories (id),
  seller_id uuid references poolx.sellers (id),
  kind text not null default 'PUBLIC' check (kind in ('PUBLIC', 'PRIVATE')),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'ACTIVE', 'THRESHOLD_MET', 'NEGOTIATING', 'LOCKED', 'ORDERING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  unit_label text not null default 'unit' check (char_length(unit_label) between 1 and 20),
  base_unit_price_paise bigint not null check (base_unit_price_paise > 0),
  reference_price_paise bigint check (reference_price_paise is null or reference_price_paise > 0),
  reference_price_source text check (reference_price_source is null or char_length(reference_price_source) <= 200),
  tier_basis text not null default 'MEMBERS' check (tier_basis in ('MEMBERS', 'QUANTITY')),
  min_qty_per_member integer not null default 1 check (min_qty_per_member >= 1),
  max_qty_per_member integer not null default 1 check (max_qty_per_member >= 1),
  min_members integer not null default 1 check (min_members >= 1),
  target_members integer not null check (target_members >= 1),
  max_members integer check (max_members is null or max_members >= 1),
  platform_fee_bps integer not null default 0 check (platform_fee_bps between 0 and 10000),
  withdrawal_policy text not null default 'You can withdraw while the pool is open; your full contribution is refunded.'
    check (char_length(withdrawal_policy) between 10 and 1000),
  terms text not null default '' check (char_length(terms) <= 5000),
  delivery_note text check (char_length(delivery_note) <= 500),
  starts_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  published_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_by uuid references core.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pools_qty_range check (max_qty_per_member >= min_qty_per_member),
  constraint pools_member_range check (target_members >= min_members and (max_members is null or max_members >= target_members)),
  constraint pools_deadline_after_start check (deadline_at > starts_at),
  -- a reference price must say where it comes from (no unsupported "was" prices)
  constraint pools_reference_sourced check ((reference_price_paise is null) = (reference_price_source is null)),
  constraint pools_published_consistent check (status = 'DRAFT' or published_at is not null)
);
create index pools_status_deadline_idx on poolx.pools (status, deadline_at);
create index pools_category_idx on poolx.pools (category_id, status);
create index pools_search_idx on poolx.pools using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(summary, '')));
create trigger pools_set_updated_at before update on poolx.pools for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Discount tiers (strictly increasing threshold AND discount)
-- ---------------------------------------------------------------------------
create table poolx.discount_tiers (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references poolx.pools (id) on delete cascade,
  threshold integer not null check (threshold >= 1),
  discount_bps integer not null check (discount_bps between 1 and 9000),
  unique (pool_id, threshold)
);

create or replace function poolx.check_tiers_monotonic()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_pool uuid := coalesce(new.pool_id, old.pool_id); v_bad int;
begin
  select count(*) into v_bad
  from (
    select discount_bps, lag(discount_bps) over (order by threshold) as prev
    from poolx.discount_tiers where pool_id = v_pool
  ) t
  where prev is not null and discount_bps <= prev;
  if v_bad > 0 then
    raise exception 'discount must increase with each higher threshold' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger discount_tiers_monotonic
  after insert or update on poolx.discount_tiers
  deferrable initially deferred
  for each row execute function poolx.check_tiers_monotonic();

-- ---------------------------------------------------------------------------
-- Pool requests (custom / private pools)
-- ---------------------------------------------------------------------------
create table poolx.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references core.profiles (id),
  title text not null check (char_length(title) between 3 and 120),
  product text not null check (char_length(product) between 2 and 120),
  description text not null check (char_length(description) between 10 and 3000),
  category_id uuid references poolx.categories (id),
  estimated_quantity integer check (estimated_quantity is null or estimated_quantity >= 1),
  target_participants integer check (target_participants is null or target_participants >= 1),
  expected_unit_price_paise bigint check (expected_unit_price_paise is null or expected_unit_price_paise > 0),
  specifications text check (char_length(specifications) <= 2000),
  preferred_seller text check (char_length(preferred_seller) <= 120),
  delivery_location text not null check (char_length(delivery_location) between 2 and 200),
  needed_by date,
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  review_note text check (char_length(review_note) <= 1000),
  reviewed_by uuid references core.profiles (id),
  reviewed_at timestamptz,
  resulting_pool_id uuid references poolx.pools (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_requester_idx on poolx.requests (requester_id, created_at desc);
create index requests_status_idx on poolx.requests (status, created_at);
create trigger requests_set_updated_at before update on poolx.requests for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership, contributions, refunds
-- ---------------------------------------------------------------------------
create table poolx.members (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references poolx.pools (id),
  user_id uuid not null references core.profiles (id),
  quantity integer not null check (quantity >= 1),
  status text not null default 'PENDING_PAYMENT' check (status in ('PENDING_PAYMENT', 'ACTIVE', 'WITHDRAWN', 'REMOVED', 'FULFILLED')),
  activated_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, user_id)                              -- no duplicate participation records
);
create index members_user_idx on poolx.members (user_id);
create index members_pool_status_idx on poolx.members (pool_id, status);
create trigger members_set_updated_at before update on poolx.members for each row execute function core.set_updated_at();

create table poolx.contributions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references poolx.members (id),
  pool_id uuid not null references poolx.pools (id),
  user_id uuid not null references core.profiles (id),
  quantity integer not null check (quantity >= 1),
  unit_price_paise bigint not null check (unit_price_paise > 0),
  fee_paise bigint not null default 0 check (fee_paise >= 0),
  amount_paise bigint not null check (amount_paise > 0),
  discount_bps_at_join integer not null default 0 check (discount_bps_at_join between 0 and 9000),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED')),
  payment_attempt_id uuid unique references core.payment_attempts (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contributions_amount_formula check (amount_paise = quantity * unit_price_paise + fee_paise),
  constraint contributions_confirmed_has_time check (status not in ('CONFIRMED', 'REFUND_PENDING', 'REFUNDED') or confirmed_at is not null)
);
-- at most one live contribution per membership (prevents duplicate payments)
create unique index contributions_one_live_per_member on poolx.contributions (member_id)
  where status in ('PENDING', 'CONFIRMED');
create index contributions_user_idx on poolx.contributions (user_id, created_at desc);
create trigger contributions_set_updated_at before update on poolx.contributions for each row execute function core.set_updated_at();
create trigger contributions_no_delete before delete on poolx.contributions for each row execute function core.forbid_delete();

create table poolx.refunds (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references poolx.contributions (id),
  pool_id uuid not null references poolx.pools (id),
  user_id uuid not null references core.profiles (id),
  amount_paise bigint not null check (amount_paise > 0),
  reason text not null check (reason in ('MEMBER_WITHDRAWAL', 'POOL_CANCELLED', 'POOL_EXPIRED', 'LATE_CAPTURE', 'PRICE_ADJUSTMENT', 'MANUAL')),
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
  constraint refunds_refunded_has_time check ((status = 'REFUNDED') = (refunded_at is not null))
);
-- one full refund per contribution (price adjustments are partial and tracked separately)
create unique index refunds_one_full_per_contribution on poolx.refunds (contribution_id) where reason <> 'PRICE_ADJUSTMENT';
create index refunds_status_idx on poolx.refunds (status, next_retry_at);
create index refunds_user_idx on poolx.refunds (user_id, created_at desc);
create trigger refunds_set_updated_at before update on poolx.refunds for each row execute function core.set_updated_at();
create trigger refunds_no_delete before delete on poolx.refunds for each row execute function core.forbid_delete();

-- Refunds for a contribution can never exceed what was paid.
create or replace function poolx.check_refund_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_paid bigint; v_refunded bigint;
begin
  select amount_paise into v_paid from poolx.contributions where id = new.contribution_id;
  select coalesce(sum(amount_paise), 0) into v_refunded from poolx.refunds where contribution_id = new.contribution_id;
  if v_refunded > v_paid then
    raise exception 'refunds (%) exceed contribution (%)', v_refunded, v_paid using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger refunds_total_within_paid
  after insert or update on poolx.refunds
  deferrable initially deferred
  for each row execute function poolx.check_refund_total();

-- ---------------------------------------------------------------------------
-- RLS — public reads go through api.* functions; tables are visible to owners and PoolX staff only.
-- ---------------------------------------------------------------------------
alter table poolx.categories enable row level security;
alter table poolx.sellers enable row level security;
alter table poolx.pools enable row level security;
alter table poolx.discount_tiers enable row level security;
alter table poolx.requests enable row level security;
alter table poolx.members enable row level security;
alter table poolx.contributions enable row level security;
alter table poolx.refunds enable row level security;

grant select on poolx.categories, poolx.sellers, poolx.pools, poolx.discount_tiers, poolx.requests,
  poolx.members, poolx.contributions, poolx.refunds to authenticated;

create policy categories_select_all on poolx.categories for select to authenticated using (true);
create policy sellers_select_staff on poolx.sellers for select to authenticated
  using (core.has_permission('poolx.pools.manage') or core.has_permission('sellers.manage'));
create policy pools_select_staff on poolx.pools for select to authenticated using (core.has_permission('poolx.pools.manage'));
create policy tiers_select_staff on poolx.discount_tiers for select to authenticated using (core.has_permission('poolx.pools.manage'));
create policy requests_select_own_or_staff on poolx.requests for select to authenticated
  using (requester_id = auth.uid() or core.has_permission('poolx.requests.review'));
create policy members_select_own_or_staff on poolx.members for select to authenticated
  using (user_id = auth.uid() or core.has_permission('poolx.pools.manage'));
create policy contributions_select_own_or_staff on poolx.contributions for select to authenticated
  using (user_id = auth.uid() or core.has_permission('poolx.pools.manage') or core.has_permission('finance.ledger.read'));
create policy refunds_select_own_or_staff on poolx.refunds for select to authenticated
  using (user_id = auth.uid() or core.has_permission('poolx.refunds.manual') or core.has_permission('finance.ledger.read'));
-- No INSERT/UPDATE/DELETE policies: every write goes through api.* security-definer functions.
