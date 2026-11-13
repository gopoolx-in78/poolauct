-- 0003 — Audit log (append-only), security events, verifications, rate limiting.

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table core.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references core.profiles (id),
  actor_kind text not null default 'user' check (actor_kind in ('user', 'system')),
  action text not null check (action ~ '^[a-z][a-z_.]*[a-z]$'),
  entity_schema text,
  entity_table text,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on core.audit_logs (entity_schema, entity_table, entity_id);
create index audit_logs_actor_idx on core.audit_logs (actor_id, created_at desc);

create trigger audit_logs_append_only
  before update or delete on core.audit_logs
  for each row execute function core.forbid_mutation();
-- TRUNCATE bypasses row triggers; block it too.
create trigger audit_logs_no_truncate
  before truncate on core.audit_logs
  for each statement execute function core.forbid_mutation();

alter table core.audit_logs enable row level security;
grant select on core.audit_logs to authenticated;
create policy audit_logs_select_staff on core.audit_logs
  for select to authenticated using (core.has_permission('audit.read'));
-- No INSERT/UPDATE/DELETE policies for end users; rows are written by core.write_audit() only.

create or replace function core.write_audit(
  p_action text,
  p_entity_schema text default null,
  p_entity_table text default null,
  p_entity_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  insert into core.audit_logs (actor_id, actor_kind, action, entity_schema, entity_table, entity_id, before, after, reason)
  values (auth.uid(), case when auth.uid() is null then 'system' else 'user' end,
          p_action, p_entity_schema, p_entity_table, p_entity_id, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function core.write_audit(text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function core.write_audit(text, text, text, text, jsonb, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Security events (sign-in failures, lockouts, MFA events)
-- ---------------------------------------------------------------------------
create table core.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references core.profiles (id),
  kind text not null check (kind in (
    'SIGN_IN_FAILED', 'SIGN_IN_RATE_LIMITED', 'SIGN_UP_RATE_LIMITED', 'PASSWORD_RESET_REQUESTED',
    'PASSWORD_CHANGED', 'MFA_ENROLLED', 'MFA_VERIFY_FAILED', 'SESSION_REVOKED', 'ACCOUNT_DELETION_REQUESTED'
  )),
  subject_hash text,           -- sha256 of a normalised email/IP; never the raw value
  created_at timestamptz not null default now()
);
create index security_events_user_idx on core.security_events (user_id, created_at desc);
create trigger security_events_append_only
  before update or delete on core.security_events
  for each row execute function core.forbid_mutation();

alter table core.security_events enable row level security;
grant select on core.security_events to authenticated;
create policy security_events_select_own_or_staff on core.security_events
  for select to authenticated using (user_id = auth.uid() or core.has_permission('audit.read'));

-- ---------------------------------------------------------------------------
-- Verifications (email/phone mirror + KYC submissions reviewed in later phases)
-- ---------------------------------------------------------------------------
create table core.user_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.profiles (id) on delete restrict,
  level text not null check (level in ('EMAIL', 'PHONE', 'BIDDER_KYC', 'SELLER_KYC')),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  document_refs jsonb not null default '[]'::jsonb,  -- private storage paths only
  reviewed_by uuid references core.profiles (id),
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_verifications_review_consistent check ((reviewed_by is null) = (reviewed_at is null))
);
create unique index user_verifications_one_open on core.user_verifications (user_id, level)
  where status in ('PENDING', 'APPROVED');
create trigger user_verifications_set_updated_at before update on core.user_verifications
  for each row execute function core.set_updated_at();

alter table core.user_verifications enable row level security;
grant select on core.user_verifications to authenticated;
create policy user_verifications_select_own_or_reviewer on core.user_verifications
  for select to authenticated using (user_id = auth.uid() or core.has_permission('verification.review'));

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window). Called by the server with the service role.
-- ---------------------------------------------------------------------------
create table core.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);
alter table core.rate_limits enable row level security;
-- No grants or policies for anon/authenticated.

-- Returns true when the request is allowed. Atomic under concurrency (upsert on the window row).
create or replace function core.rate_limit_hit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_max < 1 or p_window_seconds < 1 or char_length(p_bucket) > 200 then
    raise exception 'invalid rate limit arguments' using errcode = 'invalid_parameter_value';
  end if;
  insert into core.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;
  -- opportunistic cleanup of stale windows for this bucket
  delete from core.rate_limits where bucket = p_bucket and window_start < v_window - make_interval(secs => p_window_seconds);
  return v_hits <= p_max;
end;
$$;
revoke all on function core.rate_limit_hit(text, integer, integer) from public;
grant execute on function core.rate_limit_hit(text, integer, integer) to service_role;

create or replace function core.record_security_event(p_kind text, p_user uuid, p_subject_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into core.security_events (kind, user_id, subject_hash) values (p_kind, p_user, p_subject_hash);
$$;
revoke all on function core.record_security_event(text, uuid, text) from public;
grant execute on function core.record_security_event(text, uuid, text) to service_role;
