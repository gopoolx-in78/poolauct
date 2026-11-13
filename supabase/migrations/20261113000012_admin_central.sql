-- Phase 6 — central admin: separated metrics, user / role / seller management, finance views, exports, audit viewer.
-- Every function checks a permission from ADMIN_PERMISSION_MATRIX.md (effective only for active staff at aal2).

-- ---------------------------------------------------------------------------
-- Suspended or deleted accounts lose every permission, including in RLS policies that call has_permission directly.
-- ---------------------------------------------------------------------------
create or replace function core.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (select 1 from core.profiles p where p.id = auth.uid() and p.status not in ('SUSPENDED', 'DELETED'))
    and exists (
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

-- Suspension bookkeeping (who, when, why) and revocation reasons for roles.
alter table core.profiles
  add column suspended_at timestamptz,
  add column suspended_by uuid references core.profiles (id),
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) <= 1000),
  add constraint profiles_suspension_documented check (status <> 'SUSPENDED' or (suspended_at is not null and suspension_reason is not null));
alter table core.user_roles add column revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 1000);

alter table core.security_events drop constraint security_events_kind_check;
alter table core.security_events add constraint security_events_kind_check check (kind in (
  'SIGN_IN_FAILED', 'SIGN_IN_RATE_LIMITED', 'SIGN_UP_RATE_LIMITED', 'PASSWORD_RESET_REQUESTED',
  'PASSWORD_CHANGED', 'MFA_ENROLLED', 'MFA_VERIFY_FAILED', 'SESSION_REVOKED', 'ACCOUNT_DELETION_REQUESTED',
  'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'SESSIONS_REVOKED_BY_STAFF', 'ROLE_GRANTED', 'ROLE_REVOKED'));

-- Ledger balance helper: positive = normal balance for the account type.
create or replace function ledger.account_balance(p_code text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.type in ('ASSET', 'EXPENSE')
              then coalesce(sum(e.debit_paise), 0) - coalesce(sum(e.credit_paise), 0)
              else coalesce(sum(e.credit_paise), 0) - coalesce(sum(e.debit_paise), 0) end::bigint
  from ledger.accounts a left join ledger.entries e on e.account_code = a.code
  where a.code = p_code group by a.type;
$$;
revoke all on function ledger.account_balance(text) from public;

-- ---------------------------------------------------------------------------
-- Dashboard metrics — PoolX and Auction figures are reported separately and never added together.
-- ---------------------------------------------------------------------------
create or replace function api.admin_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_fin boolean;
begin
  perform core.require_permission('admin.dashboard.view');
  v_fin := core.has_permission('finance.ledger.read');
  return jsonb_build_object(
    'users', case when core.has_permission('users.read') then jsonb_build_object(
      'total', (select count(*) from core.profiles),
      'active', (select count(*) from core.profiles where status = 'ACTIVE'),
      'suspended', (select count(*) from core.profiles where status = 'SUSPENDED'),
      'deletionRequested', (select count(*) from core.profiles where status = 'DELETION_REQUESTED'),
      'new7d', (select count(*) from core.profiles where created_at > now() - interval '7 days'),
      'staff', (select count(distinct ur.user_id) from core.user_roles ur join core.roles r on r.key = ur.role_key
                where ur.revoked_at is null and r.is_staff)) end,
    'poolx', jsonb_build_object(
      'activePools', (select count(*) from poolx.pools where status = 'ACTIVE'),
      'poolsByStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from poolx.pools group by status) s), '{}'::jsonb),
      'activeMembers', (select count(*) from poolx.members where status = 'ACTIVE'),
      'openRequests', (select count(*) from poolx.requests where status in ('SUBMITTED', 'UNDER_REVIEW')),
      'ordersByStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from poolx.orders group by status) s), '{}'::jsonb),
      'openDisputes', (select count(*) from poolx.disputes where status = 'OPEN'),
      'refundsPending', (select count(*) from poolx.refunds where status in ('REFUND_ELIGIBLE', 'REFUND_INITIATED', 'REFUND_PROCESSING')),
      'refundsFailed', (select count(*) from poolx.refunds where status = 'REFUND_FAILED'),
      'capturedPaise', case when v_fin then (select coalesce(sum(amount_paise), 0)::text from core.payment_attempts
                                              where domain = 'poolx' and status = 'CAPTURED') end,
      'contributionLiabilityPaise', case when v_fin then ledger.account_balance('poolx:contribution_liability')::text end,
      'sellerPayablePaise', case when v_fin then ledger.account_balance('poolx:seller_payable')::text end,
      'feeRevenuePaise', case when v_fin then ledger.account_balance('poolx:platform_fee_revenue')::text end),
    'auction', jsonb_build_object(
      'live', (select count(*) from auction.auctions where status = 'LIVE' and ends_at > now()),
      'auctionsByStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from auction.auctions group by status) s), '{}'::jsonb),
      'bids7d', (select count(*) from auction.bids where accepted_at > now() - interval '7 days' and status = 'ACCEPTED'),
      'depositsPaid', (select count(*) from auction.deposits where status = 'PAID'),
      'refundsPending', (select count(*) from auction.refunds where status in ('REFUND_ELIGIBLE', 'REFUND_INITIATED', 'REFUND_PROCESSING')),
      'refundsFailed', (select count(*) from auction.refunds where status = 'REFUND_FAILED'),
      'invoicesByStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from auction.invoices group by status) s), '{}'::jsonb),
      'openDefaultReviews', (select count(*) from auction.default_reviews where decided_at is null),
      'capturedPaise', case when v_fin then (select coalesce(sum(amount_paise), 0)::text from core.payment_attempts
                                              where domain = 'auction' and status = 'CAPTURED') end,
      'depositLiabilityPaise', case when v_fin then ledger.account_balance('auction:deposit_liability')::text end,
      'buyerReceivablePaise', case when v_fin then ledger.account_balance('auction:buyer_receivable')::text end,
      'sellerPayablePaise', case when v_fin then ledger.account_balance('auction:seller_payable')::text end)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create or replace function api.admin_list_users(p_search text, p_status text, p_role text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0);
        v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform core.require_permission('users.read');
  return (
    with f as (
      select p.* from core.profiles p
      where (v_q is null or p.email::text ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%' or p.id::text = v_q)
        and (nullif(p_status, '') is null or p.status = p_status)
        and (nullif(p_role, '') is null or exists (select 1 from core.user_roles ur where ur.user_id = p.id and ur.role_key = p_role and ur.revoked_at is null))
    )
    select jsonb_build_object(
      'total', (select count(*) from f),
      'items', coalesce((select jsonb_agg(row_to_json(t)) from (
        select f.id, f.email, f.display_name as "displayName", f.status, f.created_at as "createdAt",
               u.email_confirmed_at is not null as "emailConfirmed", u.last_sign_in_at as "lastSignInAt",
               coalesce((select jsonb_agg(ur.role_key order by ur.role_key) from core.user_roles ur
                         where ur.user_id = f.id and ur.revoked_at is null), '[]'::jsonb) as roles
        from f join auth.users u on u.id = f.id
        order by f.created_at desc limit v_limit offset v_offset) t), '[]'::jsonb)));
end;
$$;

create or replace function api.admin_get_user(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform core.require_permission('users.read');
  select jsonb_build_object(
    'id', p.id, 'email', p.email, 'displayName', p.display_name, 'phone', p.phone_e164, 'city', p.city, 'state', p.state,
    'status', p.status, 'createdAt', p.created_at, 'deletionRequestedAt', p.deletion_requested_at,
    'suspendedAt', p.suspended_at, 'suspensionReason', p.suspension_reason,
    'emailConfirmed', u.email_confirmed_at is not null, 'lastSignInAt', u.last_sign_in_at,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', ur.id, 'role', ur.role_key, 'name', r.name, 'isStaff', r.is_staff,
                 'grantedAt', ur.granted_at, 'reason', ur.reason, 'revokedAt', ur.revoked_at, 'revokeReason', ur.revoke_reason)
                 order by ur.revoked_at nulls first, ur.granted_at desc)
               from core.user_roles ur join core.roles r on r.key = ur.role_key where ur.user_id = p.id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(jsonb_build_object('level', v.level, 'status', v.status, 'createdAt', v.created_at,
                 'reviewedAt', v.reviewed_at) order by v.created_at desc) from core.user_verifications v where v.user_id = p.id), '[]'::jsonb),
    'activeSessions', (select count(*) from auth.sessions s where s.user_id = p.id and (s.not_after is null or s.not_after > now())),
    'mfaFactors', (select count(*) from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified'),
    'securityEvents', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at) order by e.created_at desc)
                 from (select * from core.security_events e where e.user_id = p.id order by created_at desc limit 20) e), '[]'::jsonb),
    'activity', jsonb_build_object(
      'poolMemberships', (select count(*) from poolx.members m where m.user_id = p.id),
      'poolOrders', (select count(*) from poolx.orders o where o.user_id = p.id),
      'auctionDeposits', (select count(*) from auction.deposits d where d.user_id = p.id),
      'auctionBids', (select count(*) from auction.bids b where b.user_id = p.id),
      'auctionWins', (select count(*) from auction.invoices i where i.winner_user_id = p.id))
  ) into v
  from core.profiles p join auth.users u on u.id = p.id where p.id = p_user;
  return v;
end;
$$;

-- Suspending a staff member needs roles.manage too, so an admin cannot lock out the people who manage roles.
create or replace function api.admin_set_user_status(p_user uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('users.suspend'); v_old core.profiles;
begin
  if p_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'INVALID_REQUEST: status must be ACTIVE or SUSPENDED' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  if p_user = v_uid then
    raise exception 'NOT_ALLOWED: you cannot change your own account status' using errcode = 'P0001';
  end if;
  select * into v_old from core.profiles where id = p_user for update;
  if v_old.id is null then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0001';
  end if;
  if core.is_staff(p_user) and not core.has_permission('roles.manage') then
    raise exception 'FORBIDDEN: only role managers can change a staff member''s status' using errcode = '42501';
  end if;
  if p_status = 'SUSPENDED' then
    if v_old.status not in ('ACTIVE', 'DELETION_REQUESTED') then
      raise exception 'INVALID_STATE: account is %', v_old.status using errcode = 'P0001';
    end if;
    update core.profiles set status = 'SUSPENDED', suspended_at = now(), suspended_by = v_uid, suspension_reason = btrim(p_reason)
     where id = p_user;
    delete from auth.sessions where user_id = p_user;          -- ends every session (refresh tokens stop working)
    perform core.record_security_event('ACCOUNT_SUSPENDED', p_user, null);
  else
    if v_old.status <> 'SUSPENDED' then
      raise exception 'INVALID_STATE: account is not suspended' using errcode = 'P0001';
    end if;
    update core.profiles set status = 'ACTIVE', suspended_at = null, suspended_by = null, suspension_reason = null where id = p_user;
    perform core.record_security_event('ACCOUNT_REACTIVATED', p_user, null);
  end if;
  perform core.write_audit(case p_status when 'SUSPENDED' then 'user.suspend' else 'user.reactivate' end, 'core', 'profiles',
    p_user::text, jsonb_build_object('status', v_old.status), jsonb_build_object('status', p_status), btrim(p_reason));
end;
$$;

create or replace function api.admin_revoke_user_sessions(p_user uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('users.sessions.revoke'); v_n int;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  if p_user = v_uid then
    raise exception 'NOT_ALLOWED: use the Sessions page to manage your own sessions' using errcode = 'P0001';
  end if;
  delete from auth.sessions where user_id = p_user;
  get diagnostics v_n = row_count;
  perform core.record_security_event('SESSIONS_REVOKED_BY_STAFF', p_user, null);
  perform core.write_audit('user.sessions.revoke', 'auth', 'sessions', p_user::text, null, jsonb_build_object('revoked', v_n), btrim(p_reason));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles (roles.manage — Super Admin by default)
-- ---------------------------------------------------------------------------
create or replace function api.admin_list_roles()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform core.require_permission('roles.manage');
  return jsonb_build_object(
    'roles', coalesce((select jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name, 'isStaff', r.is_staff, 'description', r.description,
        'members', (select count(*) from core.user_roles ur where ur.role_key = r.key and ur.revoked_at is null),
        'permissions', coalesce((select jsonb_agg(rp.permission_key order by rp.permission_key) from core.role_permissions rp where rp.role_key = r.key), '[]'::jsonb))
        order by r.is_staff desc, r.key) from core.roles r), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object('key', p.key, 'description', p.description, 'sensitive', p.is_sensitive) order by p.key)
        from core.permissions p), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(row_to_json(t)) from (
        select pr.id, pr.email, pr.display_name as "displayName", pr.status, ur.role_key as role, ur.granted_at as "grantedAt"
        from core.user_roles ur join core.roles r on r.key = ur.role_key join core.profiles pr on pr.id = ur.user_id
        where ur.revoked_at is null and r.is_staff order by ur.role_key, pr.email) t), '[]'::jsonb));
end;
$$;

create or replace function api.admin_grant_role(p_user uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('roles.manage'); v_id uuid; v_status text;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  if p_user = v_uid then
    raise exception 'NOT_ALLOWED: you cannot change your own roles' using errcode = 'P0001';
  end if;
  if not exists (select 1 from core.roles where key = p_role) or p_role = 'customer' then
    raise exception 'INVALID_ROLE: unknown or default role' using errcode = 'P0001';
  end if;
  select status into v_status from core.profiles where id = p_user;
  if v_status is null then
    raise exception 'NOT_FOUND: user not found' using errcode = 'P0001';
  end if;
  if v_status <> 'ACTIVE' then
    raise exception 'INVALID_STATE: roles can only be granted to active accounts' using errcode = 'P0001';
  end if;
  insert into core.user_roles (user_id, role_key, granted_by, reason) values (p_user, p_role, v_uid, btrim(p_reason))
  on conflict (user_id, role_key) where revoked_at is null do nothing returning id into v_id;
  if v_id is null then
    raise exception 'ALREADY_GRANTED: the user already has this role' using errcode = 'P0001';
  end if;
  perform core.record_security_event('ROLE_GRANTED', p_user, null);
  perform core.write_audit('role.grant', 'core', 'user_roles', v_id::text, null, jsonb_build_object('user_id', p_user, 'role', p_role), btrim(p_reason));
end;
$$;

create or replace function api.admin_revoke_role(p_user uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('roles.manage'); v_id uuid;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  if p_user = v_uid then
    raise exception 'NOT_ALLOWED: you cannot change your own roles' using errcode = 'P0001';
  end if;
  if p_role = 'customer' then
    raise exception 'INVALID_ROLE: the default role cannot be revoked' using errcode = 'P0001';
  end if;
  if p_role = 'super_admin' and not exists (select 1 from core.user_roles ur join core.profiles pr on pr.id = ur.user_id
                                 where ur.role_key = 'super_admin' and ur.revoked_at is null and pr.status = 'ACTIVE'
                                   and ur.user_id <> p_user) then
    raise exception 'LAST_SUPER_ADMIN: at least one active Super Admin must remain' using errcode = 'P0001';
  end if;
  update core.user_roles set revoked_at = now(), revoked_by = v_uid, revoke_reason = btrim(p_reason)
   where user_id = p_user and role_key = p_role and revoked_at is null returning id into v_id;
  if v_id is null then
    raise exception 'NOT_GRANTED: the user does not have this role' using errcode = 'P0001';
  end if;
  perform core.record_security_event('ROLE_REVOKED', p_user, null);
  perform core.write_audit('role.revoke', 'core', 'user_roles', v_id::text, jsonb_build_object('user_id', p_user, 'role', p_role), null, btrim(p_reason));
end;
$$;

-- Permission matrix edits. Guard rails: Super Admin always keeps roles.manage; permissions only go to staff roles.
create or replace function api.admin_set_role_permission(p_role text, p_permission text, p_granted boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('roles.manage'); v_staff boolean;
begin
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then
    raise exception 'REASON_REQUIRED: give a reason (at least 10 characters)' using errcode = 'P0001';
  end if;
  select is_staff into v_staff from core.roles where key = p_role;
  if v_staff is null or not exists (select 1 from core.permissions where key = p_permission) then
    raise exception 'INVALID_REQUEST: unknown role or permission' using errcode = 'P0001';
  end if;
  if not v_staff then
    raise exception 'INVALID_ROLE: permissions are assigned to staff roles only' using errcode = 'P0001';
  end if;
  if p_role = 'super_admin' and not p_granted then
    raise exception 'NOT_ALLOWED: Super Admin keeps every permission' using errcode = 'P0001';
  end if;
  if p_granted then
    insert into core.role_permissions (role_key, permission_key) values (p_role, p_permission) on conflict do nothing;
  else
    delete from core.role_permissions where role_key = p_role and permission_key = p_permission;
  end if;
  perform core.write_audit(case when p_granted then 'role.permission.grant' else 'role.permission.revoke' end, 'core', 'role_permissions',
    p_role || ':' || p_permission, null, jsonb_build_object('role', p_role, 'permission', p_permission, 'granted', p_granted), btrim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Sellers (both domains, kept apart)
-- ---------------------------------------------------------------------------
create or replace function api.admin_list_sellers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_settle boolean;
begin
  perform core.require_permission('sellers.manage');
  v_settle := core.has_permission('sellers.settlements');
  return jsonb_build_object(
    'poolx', coalesce((select jsonb_agg(row_to_json(t)) from (
      select s.id, s.display_name as "displayName", s.verification_status as status, s.verified_at as "verifiedAt",
             s.verification_note as note, s.created_at as "createdAt",
             (select count(*) from poolx.pools p where p.seller_id = s.id) as listings,
             case when v_settle then (select coalesce(sum(o.quantity * o.unit_price_paise), 0)::text from poolx.orders o
                   join poolx.pools p on p.id = o.pool_id where p.seller_id = s.id and o.status not in ('REFUNDED', 'CANCELLED')) end as "grossOrdersPaise"
      from poolx.sellers s order by s.display_name) t), '[]'::jsonb),
    'auction', coalesce((select jsonb_agg(row_to_json(t)) from (
      select s.id, s.display_name as "displayName", s.kind, s.verification_status as status, s.verified_at as "verifiedAt",
             s.verification_note as note, s.created_at as "createdAt",
             (select count(*) from auction.assets x where x.seller_id = s.id) as listings,
             case when v_settle then (select coalesce(sum(i.hammer_price_paise + i.charges_total_paise), 0)::text from auction.invoices i
                   join auction.auctions a on a.id = i.auction_id join auction.assets x on x.id = a.asset_id
                   where x.seller_id = s.id and i.status = 'PAID') end as "paidSalesPaise"
      from auction.sellers s order by s.display_name) t), '[]'::jsonb),
    'settlementsVisible', v_settle);
end;
$$;

create or replace function api.admin_set_seller_status(p_domain text, p_seller uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('sellers.manage'); v_n int;
begin
  if p_status not in ('VERIFIED', 'UNVERIFIED', 'SUSPENDED') then
    raise exception 'INVALID_REQUEST: unknown status' using errcode = 'P0001';
  end if;
  if coalesce(char_length(btrim(p_note)), 0) < 10 then
    raise exception 'NOTE_REQUIRED: record what was checked or why (at least 10 characters)' using errcode = 'P0001';
  end if;
  if p_domain = 'poolx' then
    update poolx.sellers set verification_status = p_status, verification_note = btrim(p_note),
      verified_by = case when p_status = 'VERIFIED' then v_uid end, verified_at = case when p_status = 'VERIFIED' then now() end
     where id = p_seller;
  elsif p_domain = 'auction' then
    update auction.sellers set verification_status = p_status, verification_note = btrim(p_note),
      verified_by = case when p_status = 'VERIFIED' then v_uid end, verified_at = case when p_status = 'VERIFIED' then now() end
     where id = p_seller;
  else
    raise exception 'INVALID_REQUEST: unknown domain' using errcode = 'P0001';
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'NOT_FOUND: seller not found' using errcode = 'P0001';
  end if;
  perform core.write_audit(p_domain || '.seller.status', p_domain, 'sellers', p_seller::text, null, jsonb_build_object('status', p_status), btrim(p_note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance views (finance.ledger.read)
-- ---------------------------------------------------------------------------
create or replace function api.admin_list_payments(p_domain text, p_status text, p_search text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200); v_offset int := greatest(coalesce(p_offset, 0), 0);
        v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform core.require_permission('finance.ledger.read');
  return (
    with f as (
      select a.*, p.email from core.payment_attempts a join core.profiles p on p.id = a.user_id
      where (nullif(p_domain, '') is null or a.domain = p_domain) and (nullif(p_status, '') is null or a.status = p_status)
        and (v_q is null or p.email::text ilike '%' || v_q || '%' or a.provider_order_id = v_q or a.provider_payment_id = v_q or a.id::text = v_q)
    )
    select jsonb_build_object('total', (select count(*) from f),
      'items', coalesce((select jsonb_agg(row_to_json(t)) from (
        select f.id, f.domain, f.purpose, f.status, f.amount_paise::text as "amountPaise", f.provider, f.provider_order_id as "providerOrderId",
               f.provider_payment_id as "providerPaymentId", f.failure_code as "failureCode", f.email as "userEmail",
               f.created_at as "createdAt", f.captured_at as "capturedAt"
        from f order by f.created_at desc limit v_limit offset v_offset) t), '[]'::jsonb)));
end;
$$;

create or replace function api.admin_list_refunds(p_domain text, p_status text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200); v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform core.require_permission('finance.ledger.read');
  return (
    with f as (
      select 'poolx' as domain, r.id, r.reason, r.status, r.amount_paise, r.attempts, r.last_error, r.provider_refund_id,
             r.created_at, r.refunded_at, r.user_id, pl.title as subject
      from poolx.refunds r join poolx.pools pl on pl.id = r.pool_id
      union all
      select 'auction', r.id, r.reason, r.status, r.amount_paise, r.attempts, r.last_error, r.provider_refund_id,
             r.created_at, r.refunded_at, r.user_id, x.title
      from auction.refunds r join auction.auctions a on a.id = r.auction_id join auction.assets x on x.id = a.asset_id
    ), g as (
      select * from f where (nullif(p_domain, '') is null or domain = p_domain) and (nullif(p_status, '') is null or status = p_status)
    )
    select jsonb_build_object('total', (select count(*) from g),
      'items', coalesce((select jsonb_agg(row_to_json(t)) from (
        select g.domain, g.id, g.reason, g.status, g.amount_paise::text as "amountPaise", g.attempts, g.last_error as "lastError",
               g.provider_refund_id as "providerRefundId", g.created_at as "createdAt", g.refunded_at as "refundedAt",
               g.subject, p.email as "userEmail"
        from g join core.profiles p on p.id = g.user_id order by g.created_at desc limit v_limit offset v_offset) t), '[]'::jsonb)));
end;
$$;

create or replace function api.admin_ledger_overview(p_domain text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform core.require_permission('finance.ledger.read');
  if p_domain not in ('poolx', 'auction') then
    raise exception 'INVALID_REQUEST: choose poolx or auction' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'type', a.type, 'description', a.description,
        'debitPaise', coalesce((select sum(debit_paise) from ledger.entries e where e.account_code = a.code), 0)::text,
        'creditPaise', coalesce((select sum(credit_paise) from ledger.entries e where e.account_code = a.code), 0)::text,
        'balancePaise', ledger.account_balance(a.code)::text) order by a.code)
      from ledger.accounts a where a.domain = p_domain), '[]'::jsonb),
    'totalJournals', (select count(*) from ledger.journals where domain = p_domain),
    'journals', coalesce((select jsonb_agg(row_to_json(t)) from (
      select j.id, j.kind, j.reference_type as "referenceType", j.reference_id as "referenceId", j.posted_at as "postedAt",
             (select jsonb_agg(jsonb_build_object('account', e.account_code, 'debitPaise', e.debit_paise::text, 'creditPaise', e.credit_paise::text) order by e.id)
              from ledger.entries e where e.journal_id = j.id) as entries
      from ledger.journals j where j.domain = p_domain order by j.posted_at desc, j.id limit v_limit offset v_offset) t), '[]'::jsonb));
end;
$$;

-- CSV exports (finance.reports.export). Every export is audited; money stays in paise (exact integers).
create or replace function api.admin_export(p_kind text, p_domain text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := core.require_permission('finance.reports.export'); v jsonb;
begin
  if p_domain not in ('poolx', 'auction') then
    raise exception 'INVALID_REQUEST: choose poolx or auction' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'INVALID_REQUEST: choose a date range of up to one year' using errcode = 'P0001';
  end if;
  if p_kind = 'payments' then
    select coalesce(jsonb_agg(row_to_json(t) order by t.created_at), '[]'::jsonb) into v from (
      select a.id as payment_id, a.created_at, a.captured_at, a.purpose, a.status, a.amount_paise, a.currency, a.provider,
             a.provider_order_id, a.provider_payment_id, a.reference_id, a.user_id
      from core.payment_attempts a where a.domain = p_domain and a.created_at >= p_from and a.created_at < p_to limit 50000) t;
  elsif p_kind = 'refunds' then
    if p_domain = 'poolx' then
      select coalesce(jsonb_agg(row_to_json(t) order by t.created_at), '[]'::jsonb) into v from (
        select r.id as refund_id, r.created_at, r.refunded_at, r.reason, r.status, r.amount_paise, r.provider_refund_id, r.pool_id as subject_id, r.user_id
        from poolx.refunds r where r.created_at >= p_from and r.created_at < p_to limit 50000) t;
    else
      select coalesce(jsonb_agg(row_to_json(t) order by t.created_at), '[]'::jsonb) into v from (
        select r.id as refund_id, r.created_at, r.refunded_at, r.reason, r.status, r.amount_paise, r.provider_refund_id, r.auction_id as subject_id, r.user_id
        from auction.refunds r where r.created_at >= p_from and r.created_at < p_to limit 50000) t;
    end if;
  elsif p_kind = 'ledger' then
    select coalesce(jsonb_agg(row_to_json(t) order by t.posted_at, t.entry_id), '[]'::jsonb) into v from (
      select e.id as entry_id, j.id as journal_id, j.posted_at, j.kind, j.reference_type, j.reference_id, e.account_code,
             e.debit_paise, e.credit_paise, e.user_id
      from ledger.entries e join ledger.journals j on j.id = e.journal_id
      where j.domain = p_domain and j.posted_at >= p_from and j.posted_at < p_to limit 100000) t;
  else
    raise exception 'INVALID_REQUEST: unknown export' using errcode = 'P0001';
  end if;
  perform core.write_audit('finance.export', 'ledger', null, p_kind || ':' || p_domain, null,
    jsonb_build_object('kind', p_kind, 'domain', p_domain, 'from', p_from, 'to', p_to, 'rows', jsonb_array_length(v)), null);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit viewer (audit.read)
-- ---------------------------------------------------------------------------
create or replace function api.admin_list_audit(p_action text, p_actor text, p_entity text, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200); v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  perform core.require_permission('audit.read');
  return (
    with f as (
      select l.*, p.email as actor_email from core.audit_logs l left join core.profiles p on p.id = l.actor_id
      where (nullif(btrim(coalesce(p_action, '')), '') is null or l.action like btrim(p_action) || '%')
        and (nullif(btrim(coalesce(p_actor, '')), '') is null or p.email::text ilike '%' || btrim(p_actor) || '%')
        and (nullif(btrim(coalesce(p_entity, '')), '') is null or l.entity_id = btrim(p_entity))
    )
    select jsonb_build_object('total', (select count(*) from f),
      'items', coalesce((select jsonb_agg(row_to_json(t)) from (
        select f.id, f.created_at as "createdAt", f.action, f.actor_kind as "actorKind", f.actor_email as "actorEmail",
               f.entity_schema as "entitySchema", f.entity_table as "entityTable", f.entity_id as "entityId",
               f.before, f.after, f.reason
        from f order by f.id desc limit v_limit offset v_offset) t), '[]'::jsonb)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: every function above is for signed-in staff only (permission checked inside)
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'api.admin_metrics()', 'api.admin_list_users(text, text, text, integer, integer)', 'api.admin_get_user(uuid)',
    'api.admin_set_user_status(uuid, text, text)', 'api.admin_revoke_user_sessions(uuid, text)', 'api.admin_list_roles()',
    'api.admin_grant_role(uuid, text, text)', 'api.admin_revoke_role(uuid, text, text)',
    'api.admin_set_role_permission(text, text, boolean, text)', 'api.admin_list_sellers()',
    'api.admin_set_seller_status(text, uuid, text, text)', 'api.admin_list_payments(text, text, text, integer, integer)',
    'api.admin_list_refunds(text, text, integer, integer)', 'api.admin_ledger_overview(text, integer, integer)',
    'api.admin_export(text, text, timestamptz, timestamptz)', 'api.admin_list_audit(text, text, text, integer, integer)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
