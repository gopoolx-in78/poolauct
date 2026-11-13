-- 0001 — Extensions, domain schemas and shared helper functions.
-- See project-management/DATABASE_SCHEMA.md and TECHNICAL_ARCHITECTURE.md (TD-02, TD-03).
--
-- Domain schemas are NOT exposed through PostgREST (config.toml [api].schemas) and grant nothing to
-- anon/authenticated by default. Each later migration grants the minimum needed, table by table,
-- alongside RLS policies.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
create schema if not exists core;
create schema if not exists poolx;
create schema if not exists auction;
create schema if not exists ledger;
create schema if not exists cms;

comment on schema core    is 'Shared infrastructure: identity, RBAC, audit, notifications, payment attempts.';
comment on schema poolx   is 'PoolX group-buying business domain. Must not reference the auction schema.';
comment on schema auction is 'Auction business domain. Must not reference the poolx schema.';
comment on schema ledger  is 'Double-entry financial ledger. Insert-only.';
comment on schema cms     is 'Content, theme and SEO configuration. Never referenced by business logic.';

-- Lock everything down first; grant explicitly later.
do $$
declare s text;
begin
  foreach s in array array['core','poolx','auction','ledger','cms'] loop
    execute format('revoke all on schema %I from public, anon, authenticated', s);
    execute format('grant usage on schema %I to service_role', s);
    execute format('alter default privileges in schema %I revoke all on tables from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on functions from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on sequences from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to service_role', s);
    execute format('alter default privileges in schema %I grant execute on functions to service_role', s);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Maintains updated_at columns.
create or replace function core.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Attach to append-only tables (audit logs, ledger entries, webhook events, state transitions).
create or replace function core.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Table %.% is append-only; % is not permitted', tg_table_schema, tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- Attach to financial tables whose rows may change status but must never be deleted.
create or replace function core.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Rows in %.% must never be deleted', tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function core.set_updated_at()  from public;
revoke all on function core.forbid_mutation() from public;
revoke all on function core.forbid_delete()   from public;
