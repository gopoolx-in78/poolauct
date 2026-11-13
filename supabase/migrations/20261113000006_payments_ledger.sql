-- 0006 — Payments core (provider-agnostic) and the double-entry ledger.
-- See project-management/FINANCIAL_ARCHITECTURE.md. Money is bigint paise; INR only until approved otherwise.

-- ---------------------------------------------------------------------------
-- Payment attempts
-- ---------------------------------------------------------------------------
create table core.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('poolx', 'auction')),
  purpose text not null check (purpose in ('POOL_CONTRIBUTION', 'POOL_ORDER_BALANCE', 'AUCTION_DEPOSIT', 'AUCTION_PURCHASE')),
  reference_id uuid not null,                       -- contribution / deposit / invoice id in the owning domain
  user_id uuid not null references core.profiles (id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  currency char(3) not null default 'INR' check (currency = 'INR'),
  -- set by the server when it creates the provider order (never chosen by the end user)
  provider text check (provider is null or provider in ('sandbox', 'razorpay')),
  provider_order_id text,
  provider_payment_id text,
  status text not null default 'CREATED' check (status in ('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'EXPIRED', 'REVERSED')),
  failure_code text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a purpose always belongs to exactly one domain (no cross-domain routing)
  constraint payment_attempts_domain_purpose check (
    (domain = 'poolx' and purpose in ('POOL_CONTRIBUTION', 'POOL_ORDER_BALANCE'))
    or (domain = 'auction' and purpose in ('AUCTION_DEPOSIT', 'AUCTION_PURCHASE'))
  ),
  constraint payment_attempts_provider_after_created check (status in ('CREATED', 'EXPIRED') or provider is not null),
  constraint payment_attempts_captured_consistent check ((status = 'CAPTURED') = (captured_at is not null) or status = 'REVERSED')
);
create unique index payment_attempts_provider_order_key on core.payment_attempts (provider, provider_order_id) where provider_order_id is not null;
create unique index payment_attempts_provider_payment_key on core.payment_attempts (provider, provider_payment_id) where provider_payment_id is not null;
create index payment_attempts_reference_idx on core.payment_attempts (domain, reference_id);
create index payment_attempts_pending_idx on core.payment_attempts (status, expires_at) where status in ('CREATED', 'PENDING');
create trigger payment_attempts_set_updated_at before update on core.payment_attempts
  for each row execute function core.set_updated_at();
create trigger payment_attempts_no_delete before delete on core.payment_attempts
  for each row execute function core.forbid_delete();

alter table core.payment_attempts enable row level security;
grant select on core.payment_attempts to authenticated;
create policy payment_attempts_select_own_or_finance on core.payment_attempts
  for select to authenticated using (user_id = auth.uid() or core.has_permission('finance.ledger.read'));

-- ---------------------------------------------------------------------------
-- Webhook events (raw, de-duplicated by provider event id)
-- ---------------------------------------------------------------------------
create table core.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_order_id text,
  provider_payment_id text,
  payload jsonb not null,                -- provider payload with secrets/PII removed by the adapter
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, provider_event_id)
);
create trigger payment_webhook_events_no_delete before delete on core.payment_webhook_events
  for each row execute function core.forbid_delete();
alter table core.payment_webhook_events enable row level security;
-- No end-user access at all.

-- ---------------------------------------------------------------------------
-- Provider refunds (mirror of provider refund objects; owned by a domain refund row)
-- ---------------------------------------------------------------------------
create table core.provider_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references core.payment_attempts (id),
  domain text not null check (domain in ('poolx', 'auction')),
  domain_refund_id uuid not null,
  idempotency_key text not null unique,
  amount_paise bigint not null check (amount_paise > 0),
  provider_refund_id text,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  raw_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger provider_refunds_set_updated_at before update on core.provider_refunds
  for each row execute function core.set_updated_at();
create trigger provider_refunds_no_delete before delete on core.provider_refunds
  for each row execute function core.forbid_delete();
alter table core.provider_refunds enable row level security;
-- No end-user access; users see refunds through their domain's refund tables.

-- ---------------------------------------------------------------------------
-- Ledger (double entry, insert-only, domain-isolated)
-- ---------------------------------------------------------------------------
create table ledger.accounts (
  code text primary key check (code ~ '^(poolx|auction):[a-z_]+$'),
  domain text not null check (domain in ('poolx', 'auction')),
  type text not null check (type in ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY')),
  description text not null,
  constraint accounts_domain_prefix check (split_part(code, ':', 1) = domain)
);

insert into ledger.accounts (code, domain, type, description) values
  ('poolx:gateway_clearing',        'poolx',   'ASSET',     'PoolX funds captured by the payment provider, not yet settled'),
  ('poolx:contribution_liability',  'poolx',   'LIABILITY', 'Member contributions held pending order or refund'),
  ('poolx:seller_payable',          'poolx',   'LIABILITY', 'Owed to PoolX sellers'),
  ('poolx:platform_fee_revenue',    'poolx',   'REVENUE',   'Disclosed PoolX platform fees'),
  ('auction:gateway_clearing',      'auction', 'ASSET',     'Auction funds captured by the payment provider, not yet settled'),
  ('auction:deposit_liability',     'auction', 'LIABILITY', 'Refundable participation deposits owed to bidders'),
  ('auction:buyer_receivable',      'auction', 'ASSET',     'Winner invoice balances'),
  ('auction:seller_payable',        'auction', 'LIABILITY', 'Owed to auction sellers'),
  ('auction:commission_revenue',    'auction', 'REVENUE',   'Disclosed auction commissions');

create table ledger.journals (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('poolx', 'auction')),
  kind text not null check (kind ~ '^[A-Z_]+$'),
  reference_type text not null,
  reference_id uuid not null,
  idempotency_key text not null unique,
  memo text,
  posted_at timestamptz not null default now(),
  posted_by uuid references core.profiles (id)
);

create table ledger.entries (
  id bigint generated always as identity primary key,
  journal_id uuid not null references ledger.journals (id),
  account_code text not null references ledger.accounts (code),
  user_id uuid references core.profiles (id),
  debit_paise bigint not null default 0 check (debit_paise >= 0),
  credit_paise bigint not null default 0 check (credit_paise >= 0),
  constraint entries_one_side check ((debit_paise > 0) <> (credit_paise > 0))
);
create index entries_journal_idx on ledger.entries (journal_id);
create index entries_account_idx on ledger.entries (account_code);
create index journals_reference_idx on ledger.journals (reference_type, reference_id);

-- insert-only
create trigger journals_append_only before update or delete on ledger.journals
  for each row execute function core.forbid_mutation();
create trigger entries_append_only before update or delete on ledger.entries
  for each row execute function core.forbid_mutation();
create trigger journals_no_truncate before truncate on ledger.journals
  for each statement execute function core.forbid_mutation();
create trigger entries_no_truncate before truncate on ledger.entries
  for each statement execute function core.forbid_mutation();

-- Every entry's account must belong to the journal's domain.
create or replace function ledger.check_entry_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_journal_domain text; v_account_domain text;
begin
  select domain into v_journal_domain from ledger.journals where id = new.journal_id;
  select domain into v_account_domain from ledger.accounts where code = new.account_code;
  if v_journal_domain is distinct from v_account_domain then
    raise exception 'ledger entry account % (domain %) does not match journal domain %',
      new.account_code, v_account_domain, v_journal_domain using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger entries_domain_check before insert on ledger.entries
  for each row execute function ledger.check_entry_domain();

-- Every journal must balance and have at least two entries (checked at commit).
create or replace function ledger.check_journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_debit bigint; v_credit bigint; v_count int;
begin
  select coalesce(sum(debit_paise), 0), coalesce(sum(credit_paise), 0), count(*)
    into v_debit, v_credit, v_count
  from ledger.entries where journal_id = new.journal_id;
  if v_count < 2 or v_debit <> v_credit then
    raise exception 'ledger journal % is unbalanced (debits %, credits %, entries %)', new.journal_id, v_debit, v_credit, v_count
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger entries_balanced
  after insert on ledger.entries
  deferrable initially deferred
  for each row execute function ledger.check_journal_balanced();

/**
 * Posts a balanced journal. Idempotent on p_idempotency_key: a repeat returns the existing journal id without
 * posting again. p_lines: [{"account": "...", "debit": 123, "credit": 0, "user_id": "..."}].
 */
create or replace function ledger.post_journal(
  p_domain text, p_kind text, p_reference_type text, p_reference_id uuid, p_idempotency_key text, p_lines jsonb, p_memo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_line jsonb;
begin
  select id into v_id from ledger.journals where idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;
  insert into ledger.journals (domain, kind, reference_type, reference_id, idempotency_key, memo, posted_by)
  values (p_domain, p_kind, p_reference_type, p_reference_id, p_idempotency_key, p_memo, auth.uid())
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into ledger.entries (journal_id, account_code, user_id, debit_paise, credit_paise)
    values (v_id, v_line ->> 'account', nullif(v_line ->> 'user_id', '')::uuid,
            coalesce((v_line ->> 'debit')::bigint, 0), coalesce((v_line ->> 'credit')::bigint, 0));
  end loop;
  return v_id;
end;
$$;
revoke all on function ledger.post_journal(text, text, text, uuid, text, jsonb, text) from public, anon, authenticated;

alter table ledger.accounts enable row level security;
alter table ledger.journals enable row level security;
alter table ledger.entries enable row level security;
grant usage on schema ledger to authenticated;
grant select on ledger.accounts, ledger.journals, ledger.entries to authenticated;
create policy accounts_select_finance on ledger.accounts for select to authenticated using (core.has_permission('finance.ledger.read'));
create policy journals_select_finance on ledger.journals for select to authenticated using (core.has_permission('finance.ledger.read'));
create policy entries_select_finance on ledger.entries for select to authenticated using (core.has_permission('finance.ledger.read'));
