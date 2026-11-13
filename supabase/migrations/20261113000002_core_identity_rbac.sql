-- 0002 — Profiles, roles, permissions and the permission-check helpers.
-- See project-management/ADMIN_PERMISSION_MATRIX.md and DATABASE_SCHEMA.md (core schema).
--
-- Access model (TD-22):
--   * Browsers reach the database only through PostgREST, which exposes the `api` schema (functions only).
--   * `core` tables are NOT exposed over HTTP. `authenticated` gets narrow SELECT grants so that RLS is the real
--     guard even for direct SQL access; there are no INSERT/UPDATE/DELETE grants or policies for end users.
--   * Staff permissions only count in an MFA (aal2) session.

-- ---------------------------------------------------------------------------
-- api schema (HTTP surface: functions only)
-- ---------------------------------------------------------------------------
create schema if not exists api;
comment on schema api is 'Only schema exposed through PostgREST. Contains functions, never tables.';
revoke all on schema api from public;
grant usage on schema api to anon, authenticated, service_role;
alter default privileges in schema api revoke all on functions from public, anon, authenticated;

grant usage on schema core to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table core.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email extensions.citext not null,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  city text check (city is null or char_length(city) <= 80),
  state text check (state is null or char_length(state) <= 80),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'DELETION_REQUESTED', 'DELETED')),
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_deletion_requested_has_timestamp
    check (status <> 'DELETION_REQUESTED' or deletion_requested_at is not null)
);
create unique index profiles_email_key on core.profiles (email);
create trigger profiles_set_updated_at before update on core.profiles
  for each row execute function core.set_updated_at();

-- ---------------------------------------------------------------------------
-- Roles & permissions
-- ---------------------------------------------------------------------------
create table core.roles (
  key text primary key check (key ~ '^[a-z][a-z_]*$'),
  name text not null,
  is_staff boolean not null,
  description text not null default ''
);

create table core.permissions (
  key text primary key check (key ~ '^[a-z][a-z_.]*[a-z]$'),
  description text not null,
  is_sensitive boolean not null default false
);

create table core.role_permissions (
  role_key text not null references core.roles (key) on delete cascade,
  permission_key text not null references core.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

create table core.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.profiles (id) on delete restrict,
  role_key text not null references core.roles (key) on delete restrict,
  granted_by uuid references core.profiles (id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references core.profiles (id),
  revoked_at timestamptz,
  reason text,
  -- revoked_by may be null for system revocations, but a revoker implies a revocation time.
  constraint user_roles_revocation_consistent check (revoked_by is null or revoked_at is not null)
);
create unique index user_roles_active_key on core.user_roles (user_id, role_key) where revoked_at is null;
create index user_roles_user_idx on core.user_roles (user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function core.current_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal0');
$$;

-- True when the current user holds any active staff role (regardless of MFA state).
-- Used to route staff to MFA enrolment/verification; never sufficient for authorisation.
create or replace function core.is_staff(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from core.user_roles ur
    join core.roles r on r.key = ur.role_key
    where ur.user_id = p_user and ur.revoked_at is null and r.is_staff
  );
$$;

-- Authorisation check. Staff-role permissions only count in an aal2 (MFA) session.
create or replace function core.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from core.user_roles ur
    join core.roles r on r.key = ur.role_key
    join core.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and ur.revoked_at is null
      and rp.permission_key = p_permission
      and (not r.is_staff or core.current_aal() = 'aal2')
  );
$$;

revoke all on function core.current_aal() from public;
revoke all on function core.is_staff(uuid) from public;
revoke all on function core.has_permission(text) from public;
grant execute on function core.current_aal() to authenticated, service_role;
grant execute on function core.is_staff(uuid) to authenticated, service_role;
grant execute on function core.has_permission(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New auth user → profile + default customer role
-- ---------------------------------------------------------------------------
create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into core.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(btrim(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80)), '')
  );
  insert into core.user_roles (user_id, role_key, reason) values (new.id, 'customer', 'default role on sign-up');
  return new;
end;
$$;
revoke all on function core.handle_new_auth_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function core.handle_new_auth_user();

-- Keep the profile's email in sync after a confirmed email change.
create or replace function core.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update core.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function core.handle_auth_user_email_change() from public;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function core.handle_auth_user_email_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table core.profiles enable row level security;
alter table core.roles enable row level security;
alter table core.permissions enable row level security;
alter table core.role_permissions enable row level security;
alter table core.user_roles enable row level security;

grant select on core.profiles, core.roles, core.permissions, core.role_permissions, core.user_roles to authenticated;

-- profiles
create policy profiles_select_own_or_staff on core.profiles
  for select to authenticated
  using (id = auth.uid() or core.has_permission('users.read'));
-- No INSERT / UPDATE / DELETE policies: profile rows are created by the auth trigger and changed only through
-- api.* functions (security definer). Absence of a permissive policy denies these operations.

-- roles / permissions / role_permissions: reference data, readable by any signed-in user
create policy roles_select_all on core.roles for select to authenticated using (true);
create policy permissions_select_all on core.permissions for select to authenticated using (true);
create policy role_permissions_select_all on core.role_permissions for select to authenticated using (true);

-- user_roles: own roles, or staff with users.read
create policy user_roles_select_own_or_staff on core.user_roles
  for select to authenticated
  using (user_id = auth.uid() or core.has_permission('users.read'));

-- ---------------------------------------------------------------------------
-- Reference data: roles and permissions (mirrors ADMIN_PERMISSION_MATRIX.md)
-- ---------------------------------------------------------------------------
insert into core.roles (key, name, is_staff, description) values
  ('super_admin',      'Super Admin',      true,  'Full administrative access; cannot bypass financial or deposit invariants.'),
  ('admin',            'Admin',            true,  'General administration.'),
  ('poolx_manager',    'PoolX Manager',    true,  'Manages pools, tiers, members and PoolX orders.'),
  ('auction_manager',  'Auction Manager',  true,  'Manages auction listings, schedules and outcomes.'),
  ('finance_manager',  'Finance Manager',  true,  'Payments, refunds, ledger and reports.'),
  ('seller_manager',   'Seller Manager',   true,  'Seller onboarding and verification.'),
  ('customer_support', 'Customer Support', true,  'Support tickets and read-only customer context.'),
  ('content_manager',  'Content Manager',  true,  'CMS content, theme drafts and SEO.'),
  ('seller',           'Seller',           false, 'Submits listings for approval; cannot bid on own auctions.'),
  ('customer',         'Customer',         false, 'Default role for every account.'),
  ('bidder',           'Bidder',           false, 'Verified to participate in auctions (deposit still required per auction).');

insert into core.permissions (key, description, is_sensitive) values
  ('admin.dashboard.view',          'View the admin dashboard',                              false),
  ('users.read',                    'View user accounts',                                    false),
  ('users.suspend',                 'Suspend or reinstate user accounts',                    true),
  ('users.sessions.revoke',         'Revoke another user''s sessions',                       true),
  ('verification.review',           'Review identity/KYC submissions',                       false),
  ('roles.manage',                  'Grant and revoke roles',                                true),
  ('poolx.pools.manage',            'Create and edit pools',                                 false),
  ('poolx.requests.review',         'Review custom pool requests',                           false),
  ('poolx.tiers.manage',            'Edit pool discount tiers',                              false),
  ('poolx.orders.manage',           'Manage PoolX orders and shipments',                     false),
  ('poolx.orders.read',             'View PoolX orders',                                     false),
  ('poolx.refunds.manual',          'Initiate manual PoolX refunds',                         true),
  ('auction.listings.manage',       'Create and edit auction listings',                      false),
  ('auction.listings.approve',      'Approve and publish auction listings',                  false),
  ('auction.reserve.edit',          'Edit reserve prices',                                   true),
  ('auction.cancel',                'Cancel auctions',                                       true),
  ('auction.close.force',           'Force-close an auction',                                true),
  ('auction.bids.read_identities',  'See bidder identities behind pseudonyms',               false),
  ('auction.deposit.config',        'Configure deposit amounts (never disable deposits)',    false),
  ('auction.deposit.read',          'View auction deposits',                                 false),
  ('auction.deposit.refund.manual', 'Initiate manual deposit refunds',                       true),
  ('auction.deposit.refund.retry',  'Retry failed deposit refunds',                          false),
  ('auction.default.review',        'Review winning-bidder payment defaults',                true),
  ('auction.default.forfeit',       'Approve deposit forfeiture (requires second approver)', true),
  ('finance.ledger.read',           'Read the financial ledger',                             false),
  ('finance.reports.export',        'Export financial reports',                              false),
  ('sellers.manage',                'Manage sellers',                                        false),
  ('sellers.settlements',           'Manage seller settlements',                             true),
  ('support.tickets',               'Handle support tickets',                                false),
  ('cms.content.manage',            'Manage CMS content',                                    false),
  ('cms.theme.edit',                'Edit theme drafts',                                     false),
  ('cms.theme.publish',             'Publish themes',                                        true),
  ('seo.manage',                    'Manage SEO settings',                                   false),
  ('system.settings',               'Change system settings',                                true),
  ('audit.read',                    'Read audit logs',                                       false);

insert into core.role_permissions (role_key, permission_key)
select 'super_admin', key from core.permissions;

insert into core.role_permissions (role_key, permission_key) values
  -- every staff role can open the dashboard
  ('admin', 'admin.dashboard.view'), ('poolx_manager', 'admin.dashboard.view'), ('auction_manager', 'admin.dashboard.view'),
  ('finance_manager', 'admin.dashboard.view'), ('seller_manager', 'admin.dashboard.view'),
  ('customer_support', 'admin.dashboard.view'), ('content_manager', 'admin.dashboard.view'),
  -- admin
  ('admin', 'users.read'), ('admin', 'users.suspend'), ('admin', 'users.sessions.revoke'), ('admin', 'verification.review'),
  ('admin', 'poolx.pools.manage'), ('admin', 'poolx.requests.review'), ('admin', 'poolx.tiers.manage'),
  ('admin', 'poolx.orders.manage'), ('admin', 'poolx.orders.read'),
  ('admin', 'auction.listings.manage'), ('admin', 'auction.listings.approve'), ('admin', 'auction.cancel'),
  ('admin', 'auction.bids.read_identities'), ('admin', 'auction.deposit.read'),
  ('admin', 'sellers.manage'), ('admin', 'support.tickets'), ('admin', 'cms.content.manage'), ('admin', 'seo.manage'),
  ('admin', 'audit.read'),
  -- poolx manager
  ('poolx_manager', 'poolx.pools.manage'), ('poolx_manager', 'poolx.requests.review'), ('poolx_manager', 'poolx.tiers.manage'),
  ('poolx_manager', 'poolx.orders.manage'), ('poolx_manager', 'poolx.orders.read'),
  -- auction manager
  ('auction_manager', 'verification.review'), ('auction_manager', 'auction.listings.manage'),
  ('auction_manager', 'auction.listings.approve'), ('auction_manager', 'auction.reserve.edit'), ('auction_manager', 'auction.cancel'),
  ('auction_manager', 'auction.close.force'), ('auction_manager', 'auction.bids.read_identities'),
  ('auction_manager', 'auction.deposit.config'), ('auction_manager', 'auction.deposit.read'), ('auction_manager', 'auction.default.review'),
  -- finance manager
  ('finance_manager', 'users.read'), ('finance_manager', 'poolx.refunds.manual'), ('finance_manager', 'auction.bids.read_identities'),
  ('finance_manager', 'auction.deposit.config'), ('finance_manager', 'auction.deposit.read'),
  ('finance_manager', 'auction.deposit.refund.manual'), ('finance_manager', 'auction.deposit.refund.retry'),
  ('finance_manager', 'auction.default.review'), ('finance_manager', 'auction.default.forfeit'),
  ('finance_manager', 'finance.ledger.read'), ('finance_manager', 'finance.reports.export'), ('finance_manager', 'sellers.settlements'),
  ('finance_manager', 'audit.read'),
  -- seller manager
  ('seller_manager', 'users.read'), ('seller_manager', 'verification.review'), ('seller_manager', 'sellers.manage'),
  -- customer support
  ('customer_support', 'users.read'), ('customer_support', 'users.sessions.revoke'), ('customer_support', 'poolx.orders.read'),
  ('customer_support', 'auction.deposit.read'), ('customer_support', 'support.tickets'),
  -- content manager
  ('content_manager', 'cms.content.manage'), ('content_manager', 'cms.theme.edit'), ('content_manager', 'seo.manage');
