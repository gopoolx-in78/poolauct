# Database Schema

> Status: migrations **0001–0009 applied and tested** (pgTAP 148/148); the rest of this document is the plan.
> Last updated: 2026-11-13.
> Engine: Supabase Postgres 17. Schemas: `core`, `poolx`, `auction`, `ledger`, `cms`, plus `api` (HTTP surface, functions only — TD-22).

## Applied migrations

| File (`supabase/migrations/`) | Contents |
|---|---|
| `20261113000001_core_extensions_and_schemas.sql` | citext, pgcrypto; schemas core/poolx/auction/ledger/cms; default-deny privileges; `core.set_updated_at`, `core.forbid_mutation`, `core.forbid_delete` |
| `20261113000002_core_identity_rbac.sql` | `api` schema; `core.profiles` (FK auth.users, ON DELETE RESTRICT; status ACTIVE/SUSPENDED/DELETION_REQUESTED/DELETED; phone E.164 check); `core.roles` (11), `core.permissions` (35), `core.role_permissions` (matrix), `core.user_roles` (partial unique active role, revocation fields); `core.current_aal()`, `core.is_staff()`, `core.has_permission()` (staff perms only at aal2); auth triggers: new user → profile + `customer` role, email change → profile sync; RLS: SELECT own-or-`users.read`; reference tables readable; no end-user writes |
| `20261113000003_core_audit_security.sql` | `core.audit_logs` (append-only: UPDATE/DELETE/TRUNCATE blocked; SELECT needs `audit.read`); `core.write_audit()`; `core.security_events` (append-only; own or `audit.read`); `core.user_verifications` (EMAIL/PHONE/BIDDER_KYC/SELLER_KYC; one open per level); `core.rate_limits` + `core.rate_limit_hit()`; `core.record_security_event()` |
| `20261113000004_api_account.sql` | `core.require_active_user()`; `api.get_my_account`, `api.update_my_profile`, `api.list_my_sessions`, `api.revoke_my_session`, `api.request_account_deletion`, `api.cancel_account_deletion`; `core.operator_grant_role()` (service_role/SQL only) |
| `20261113000005_api_server_helpers.sql` | `api.rate_limit_hit`, `api.record_security_event` (service_role only) |
| `20261113000006_payments_ledger.sql` | `core.payment_attempts` (domain+purpose pairing CHECK; provider set only by server; unique provider order/payment ids; no delete), `core.payment_webhook_events` (unique provider+event id; no user access), `core.provider_refunds` (unique idempotency key); `ledger.accounts` (9, domain-prefixed), `ledger.journals` (unique idempotency key), `ledger.entries` (one-sided CHECK); triggers: insert-only, entry account domain = journal domain, deferred balance check (≥2 entries, debits = credits); `ledger.post_journal()` (idempotent); RLS: ledger readable only with `finance.ledger.read` |
| `20261113000007_poolx_schema.sql` | `poolx.categories` (12 seeded), `poolx.sellers` (VERIFIED requires verifier + time), `poolx.pools` (lifecycle status, bigint paise, reference price requires source, qty/member/deadline CHECKs, FTS index), `poolx.discount_tiers` (deferred trigger: discount strictly increases), `poolx.requests`, `poolx.members` (UNIQUE pool+user), `poolx.contributions` (amount = qty×unit+fee; one live PENDING/CONFIRMED per member; no delete), `poolx.refunds` (one full refund per contribution; refunds ≤ paid; no delete); RLS: own rows or PoolX/finance staff; no end-user writes |
| `20261113000008_poolx_functions.sql` | Pricing (`discounted_price`, `fee_for`, `discount_bps_at`, `current_discount_bps`), `pool_json`; domain reactions (`on_contribution_captured`/`failed`, `create_full_refund`, `apply_refund_result`); service-role API (`payments_attach_order`, `payments_process_event`, `poolx_claim_refunds`, `poolx_record_refund_result`, `poolx_close_due_pools`); public API (`poolx_list_categories`, `poolx_list_pools`, `poolx_get_pool`, `poolx_public_stats`); member API (`poolx_start_contribution`, `poolx_withdraw`, `poolx_my_membership`, `poolx_my_activity`, `payments_get_my_attempt`, `poolx_submit_request`); staff API (`poolx_admin_*`); `core.require_permission()` |

| `20261113000009_poolx_lifecycle.sql` | `poolx.pools` + `final_unit_price_paise`, `locked_at` (consistency CHECK); `poolx.negotiations` (append-only), `poolx.orders` (one per member, amount formula, no delete), `poolx.shipments` (one per order; https tracking URL), `poolx.disputes` (one open per order; resolution consistency); RLS own/staff; `apply_refund_result` v2 (post-order MANUAL refunds debit `seller_payable`); `maybe_complete_pool`; staff API `poolx_admin_close_joining`, `_record_negotiation`, `_lock`, `_ship_order`, `_mark_delivered`, `_resolve_dispute`, `_lifecycle`, `_list_disputes`; member API `poolx_confirm_delivery`, `poolx_open_dispute`; `poolx_my_activity` v2 (order/shipment/dispute); `poolx_get_pool` v2 (final price); integrity triggers → SECURITY DEFINER (TD-40) |
| `20261113000010_auction_schema.sql` | `core.system_settings` (positive deposit limits, verification level, no deposit on/off keys, no delete) + `core.setting()`; `auction.categories` (11 seeded, `is_vehicle`), `sellers`, `assets` (charges jsonb), `vehicle_details` (masked registration must contain •; RC status), `inspection_reports`; `auction.auctions` (non-DRAFT ⇒ deposit > 0 + terms + version + deadline + published_at; reserve/type consistency; reserved slugs; anti-snipe; `freeze_published_terms` trigger); `participants` (unique alias); `deposits` (14 states, unique auction+user, unique attempt, identity immutable) + `deposit_transitions_allowed` + append-only `deposit_history` + `transition_deposit()`; `bids` (seq, unique idempotency key, `check_bid_insert`: live window, not seller, PAID deposit, ACTIVE participant); `results` (append-only), `invoices` (total formula CHECK), `deposit_adjustments` (unique deposit, unique invoice), `purchase_payments`, `refunds` (one per payment; full-amount trigger), `default_reviews` (FORFEIT needs policy + 20-char reason + two different approvers; `guard_forfeit`); RLS on every table |
| `20261113000012_admin_central.sql` | `core.has_permission` v2 (profile must not be SUSPENDED/DELETED); `core.profiles` + `suspended_at`, `suspended_by`, `suspension_reason` (CHECK `profiles_suspension_documented`); `core.user_roles` + `revoke_reason`; security event kinds ACCOUNT_SUSPENDED, ACCOUNT_REACTIVATED, SESSIONS_REVOKED_BY_STAFF, ROLE_GRANTED, ROLE_REVOKED; `ledger.account_balance(code)`; `api.admin_*` (metrics, users, roles, permissions, sellers, payments, refunds, ledger overview, export, audit) — SECURITY DEFINER, `require_permission`, granted to `authenticated` only |
| `20261113000011_auction_functions.sql` | `compute_deposit` (min/max clamp, percent in bps, rounded up to the rupee), `effective_status`, `min_next_bid`, `auction_json`; payment reactions (`on_deposit_captured`, `on_deposit_failed`, `on_purchase_captured`, `settle_invoice`); `payments_attach_order` / `payments_process_event` (AUCTION_DEPOSIT, AUCTION_PURCHASE routing); refund engine (`create_refund`, `apply_refund_result`, `auction_claim_refunds`, `auction_record_refund_result`); `close_auction` (idempotent winner selection, loser refunds, invoice + journal), `auction_close_due`; member/public/admin API (API_DOCUMENTATION); `auction_admin_list_default_reviews` |
| `20261113000013_cms_theme.sql` | `usage on schema cms` to `authenticated`; validators `cms.has_exact_keys`, `is_plain_text`, `is_internal_href`, `is_hex`, `contrast`, `link_list_problem`, `theme_config_problem` (returns the first problem or null); `cms.theme_versions` (status DRAFT/PUBLISHED/ARCHIVED, config CHECK valid, partial unique one DRAFT + one PUBLISHED, `guard_theme_version` trigger, no delete); `cms.documents` (kind PAGE/POST, slug pattern, unique kind+slug, latest / published revision pointers); `cms.document_revisions` (append-only); `cms.faqs` (topic general/poolx/auction, plain text, PUBLISHED/HIDDEN); `cms.seo_entries` (8 allowlisted route keys, title 10–70, description 50–160); RLS: SELECT by `cms.theme.edit` / `cms.theme.publish` / `cms.content.manage` / `seo.manage`, all direct writes denied; public and staff `api.cms_*` functions (API_DOCUMENTATION) |
| `20261114000016_launch_readiness.sql` | `api.launch_readiness()` — read-only, security definer, service_role only; six launch checks returning counts (TD-71) |
| `20261114000017_media.sql` | Storage bucket `public-media` (public read, WebP only, 2 MB, no client write policies); `core.media_assets` (dimensions, bytes, required alt text, ACTIVE / REMOVED, no delete); `auction.asset_media` and `poolx.pool_media` (photo order); RLS deny-all on all three; staff `api.*_admin_media_{add,update,remove,list}` (draft-only, max 12, audited) and public `api.auction_media`, `api.auction_media_covers`, `api.poolx_pool_media`, `api.poolx_media_covers` (TD-74) |
| `20261114000015_hardening.sql` | `alter role service_role set statement_timeout = '30s'`, `lock_timeout = '10s'` (TD-69) |
| `20261114000014_notifications.sql` | `core.notification_events` (28 events: key, domain, label, description, audience PARTICIPANT/SUBSCRIBER, essential, in-app / e-mail defaults; CHECKs: essential ⇒ defaults on, subscriber ⇒ defaults off; no delete); `core.notification_preferences` (user + event PK; rows only for changed defaults); `core.notifications` (user, event, data jsonb ≤ 4 KB, internal link, dedupe key UNIQUE per user, in_app flag, read_at; only read_at may change, once; no delete); `core.notification_deliveries` (EMAIL/SMS/WHATSAPP, QUEUED/SENDING/SENT/FAILED/SKIPPED, attempts, next_attempt_at, provider + message id, last_error; unique per notification + channel; no delete); `core.notification_errors` (append-only); functions `core.notify`, `core.notify_subscribers`, `core.record_notification_error`, `core.mask_reference`, `poolx.pool_notice`, `auction.auction_notice`; AFTER triggers on poolx pools / requests / members / contributions / orders / refunds and auction auctions (status, leader) / bids / deposits / results / refunds / deposit_adjustments / invoices; RLS: events readable, own preferences / notifications, deliveries and errors with `support.tickets`, all direct writes denied |

Tests: `supabase/tests/0001_schemas.test.sql` (12), `0002_identity_rbac.test.sql` (46), `0003_payments_poolx.test.sql` (54), `0004_poolx_lifecycle.test.sql` (36).

Note: migration numbering below was the original plan; actual files use timestamps and Phase 2 split identity/audit/API
differently. Later phases continue with `20261113000006+` / dated prefixes.
> Conventions: `uuid` PKs (`gen_random_uuid()`), `timestamptz` in UTC, money = `bigint` paise with
> `CHECK (x >= 0)` (or `> 0` where required), currency `char(3) DEFAULT 'INR' CHECK (currency='INR')`
> until multi-currency is approved, `created_at/updated_at` on every table, soft status columns
> instead of deletes for anything financial.

## Migrations (original plan)

| # | File | Contents |
|---|---|---|
| 0001 | `core_extensions_and_schemas.sql` | pgcrypto, citext, pg_cron, schemas, grants baseline (revoke all from anon/authenticated) |
| 0002 | `core_identity_rbac.sql` | profiles, roles, permissions, role_permissions, user_roles, `has_permission()`, `is_staff()` |
| 0003 | `core_verification_sessions.sql` | user_verifications, session registry, security events |
| 0004 | `core_audit_notifications.sql` | audit_logs (append-only), notifications, notification_preferences, deliveries, outbox |
| 0005 | `core_payments.sql` | payment_attempts, payment_webhook_events, provider refunds mirror |
| 0006 | `ledger.sql` | accounts, journals, entries, balance trigger |
| 0007 | `cms_theme.sql` | theme_versions, cms_pages, banners, nav, homepage_sections, seo_settings, system_settings |
| 0008 | `poolx_core.sql` | categories, sellers, pools, products, tiers, requests |
| 0009 | `poolx_participation.sql` | members, contributions, orders, items, shipments, refunds, disputes, negotiations |
| 0010 | `auction_catalog.sql` | categories, sellers, assets, vehicle details, media, inspection reports |
| 0011 | `auction_core.sql` | auctions (+ deposit invariants), participants, deposits, bids |
| 0012 | `auction_settlement.sql` | results, invoices, payments, refunds, settlements, disputes, default reviews |
| 0013 | `rpc_functions.sql` | all business SQL functions (split per module as needed) |
| 0014 | `rls_policies.sql` | RLS for every table (SELECT/INSERT/UPDATE/DELETE separately) |
| 0015 | `cron_jobs.sql` | pg_cron schedules |

## `core` schema

| Table | Key columns | Constraints / notes |
|---|---|---|
| profiles | id (=auth.users.id), display_name, phone_e164, email (citext), city, state, status (`ACTIVE`,`SUSPENDED`,`DELETION_REQUESTED`,`DELETED`) | unique email/phone; PII minimal |
| roles | key (`super_admin`,`admin`,`poolx_manager`,`auction_manager`,`finance_manager`,`seller_manager`,`customer_support`,`content_manager`,`seller`,`customer`,`bidder`), is_staff | seeded |
| permissions | key (e.g. `auction.deposit.refund.manual`), description, is_sensitive | seeded |
| role_permissions | role_key, permission_key | PK both |
| user_roles | user_id, role_key, granted_by, granted_at, revoked_at | partial unique (user_id, role_key) where revoked_at is null |
| user_verifications | user_id, level (`EMAIL`,`PHONE`,`BIDDER_KYC`,`SELLER_KYC`), status (`PENDING`,`APPROVED`,`REJECTED`,`EXPIRED`), doc refs (private storage paths), reviewed_by, reviewed_at, reason | doc numbers stored masked + hashed, never raw in logs |
| security_events | user_id, kind, ip_hash, ua, created_at | brute force / login monitoring |
| audit_logs | id bigserial, actor_id, actor_role, action, entity_schema, entity_table, entity_id, before jsonb, after jsonb, reason, ip_hash, created_at | **append-only**: trigger raises on UPDATE/DELETE; no grants |
| notifications | user_id, domain (`core`,`poolx`,`auction`), event_key, title, body, link, read_at | no payment details in body |
| notification_preferences | user_id, event_key, channel, enabled | |
| notification_deliveries | notification_id, channel, provider, status, attempts, last_error | |
| outbox | id, topic, payload jsonb, available_at, processed_at, attempts | transactional outbox for realtime/notifications/refund jobs |
| payment_attempts | id, domain (`poolx`,`auction`), purpose (`POOL_CONTRIBUTION`,`POOL_ORDER_BALANCE`,`AUCTION_DEPOSIT`,`AUCTION_PURCHASE`), reference_id, user_id, amount_paise >0, currency, provider, provider_order_id, provider_payment_id, status (`CREATED`,`PENDING`,`CAPTURED`,`FAILED`,`EXPIRED`,`REVERSED`), idempotency_key, expires_at | UNIQUE(idempotency_key); UNIQUE(provider, provider_order_id); UNIQUE(provider, provider_payment_id); CHECK domain/purpose pairing |
| payment_webhook_events | id, provider, provider_event_id, signature_valid, received_at, payload jsonb (redacted), processed_at, result | UNIQUE(provider, provider_event_id) → replay/duplicate protection |
| provider_refunds | id, payment_attempt_id, provider_refund_id, amount_paise, status, raw_status, updated_at | mirror of provider refund objects |
| rate_limits | key, window_start, count | token bucket |

## `ledger` schema (double entry)

| Table | Notes |
|---|---|
| accounts | code (e.g. `auction:deposit_liability`, `auction:gateway_clearing`, `poolx:contribution_liability`), domain, type (`ASSET`,`LIABILITY`,`REVENUE`,`EXPENSE`,`EQUITY`), normal side |
| journals | id, domain, kind, reference_type, reference_id, idempotency_key UNIQUE, posted_at, posted_by, memo |
| entries | journal_id, account_code, user_id NULL, debit_paise ≥0, credit_paise ≥0, CHECK exactly one side >0 |
| (trigger) | deferred constraint trigger: Σdebit = Σcredit per journal; every entry's account domain = journal domain (prevents cross-module posting) |

Ledger rows are insert-only (no UPDATE/DELETE grants; corrections via reversing journals).

## `cms` schema

| Table | Notes |
|---|---|
| theme_versions | id, version_no, status (`DRAFT`,`PUBLISHED`,`ARCHIVED`), tokens jsonb (validated: allowlisted keys, colour regex, font enum), created_by, published_by, published_at | partial unique: one `PUBLISHED`; rollback = publish copy of old version |
| homepage_layouts | version, sections jsonb (ordered list of `{type, enabled, props}` from allowlisted section types) |
| banners, nav_items, footer_blocks, faqs, pages, posts, seo_settings | structured fields only (Markdown rendered with sanitising renderer; no raw HTML/JS) |
| system_settings | key, value jsonb, validated per key (e.g. `auction.deposit.global_min_paise` CHECK > 0) |

## `poolx` schema

| Table | Key columns / constraints |
|---|---|
| pool_categories | slug UNIQUE, name, parent_id, sort, is_active |
| pool_sellers | profile_id / org name, verification status, gstin (masked) |
| pools | slug UNIQUE, title, category_id, seller_id, kind (`PUBLIC`,`PRIVATE`), status (`DRAFT`,`PENDING_APPROVAL`,`ACTIVE`,`THRESHOLD_MET`,`NEGOTIATING`,`LOCKED`,`ORDERING`,`COMPLETED`,`CANCELLED`,`EXPIRED`), reference_price_paise, base_unit_price_paise >0, min_members, target_members ≥ min_members, min_qty, max_qty, platform_fee_bps 0..10000, contribution_mode (`FULL`,`FIXED`,`PERCENT`) + value, starts_at, deadline_at > starts_at, completion_rule jsonb |
| pool_products | pool_id, name, specs jsonb, media |
| pool_discount_tiers | pool_id, threshold_type (`MEMBERS`,`QUANTITY`), threshold ≥1, discount_bps 1..9000 | UNIQUE(pool_id, threshold_type, threshold); discount strictly increasing (trigger) |
| pool_requests | requester_id, all request fields, status (`SUBMITTED`,`UNDER_REVIEW`,`APPROVED`,`REJECTED`), resulting_pool_id |
| pool_members | pool_id, user_id, quantity, status (`PENDING_PAYMENT`,`ACTIVE`,`WITHDRAWN`,`REMOVED`,`FULFILLED`) | UNIQUE(pool_id,user_id) |
| pool_contributions | member_id, payment_attempt_id, amount_paise >0, status (`PENDING`,`CONFIRMED`,`FAILED`,`REFUND_PENDING`,`REFUNDED`,`APPLIED`) | UNIQUE(payment_attempt_id) |
| pool_negotiations | pool_id, seller_id, offered_unit_price_paise, terms, status, recorded_by |
| pool_orders / pool_order_items | per-member order after lock; final price snapshot, balance due, status lifecycle |
| pool_shipments | order_id, carrier, tracking_no, status, events jsonb |
| pool_refunds | contribution_id UNIQUE per reason, amount, status (same refund states as auction), provider_refund_id |
| pool_disputes | order_id, raised_by, status, resolution |

## `auction` schema

| Table | Key columns / constraints |
|---|---|
| auction_categories | slug UNIQUE, name, parent_id, is_vehicle bool, is_active |
| auction_sellers | profile_id, kind (`PLATFORM`,`THIRD_PARTY`), verification status |
| auction_assets | seller_id, category_id, name, brand, model, year, condition, description, location (city/state/pincode), pickup_terms, charges jsonb |
| vehicle_details | asset_id PK, manufacturer, variant, reg_state, reg_number_enc (encrypted) + reg_number_masked, fuel, transmission, odometer_km, owners_count, insurance_valid_until, rc_status (`NOT_VERIFIED`,`MANUALLY_VERIFIED`,`PROVIDER_VERIFIED`), rc_verified_by/at/evidence, puc_status, accident_disclosure, damage_disclosure, service_history |
| auction_asset_media | asset_id, storage_path, kind (`IMAGE`,`VIDEO`,`DOCUMENT`), visibility (`PUBLIC`,`PRIVATE`), alt_text, sort |
| auction_inspection_reports | asset_id, inspector, inspected_at, location, summary, report_path (private), is_verified |
| auctions | slug UNIQUE, asset_id, type (`TIMED_ENGLISH`,`RESERVE`), status (`DRAFT`,`PENDING_APPROVAL`,`SCHEDULED`,`LIVE`,`CLOSING`,`CLOSED`,`CANCELLED`), starting_price_paise >0, reserve_price_paise NULL or ≥ starting, reserve_disclosure (`HIDDEN`,`MET_FLAG`,`AMOUNT`), min_increment_paise >0, starts_at, ends_at > starts_at, original_ends_at, anti_snipe_window_s, anti_snipe_extend_s, max_extensions, **deposit_mode (`FIXED`,`PERCENT_OF_STARTING`) NOT NULL, deposit_value NOT NULL, deposit_amount_paise bigint NOT NULL CHECK (> 0)**, deposit_terms_version, winner_payment_deadline_h, current_bid_paise, current_leader_bid_id, bid_count, bidder_count |
| auction_participants | auction_id, user_id, terms_accepted_at, terms_version, status (`REGISTERED`,`DEPOSIT_PENDING`,`ACTIVE`,`SUSPENDED`,`WITHDRAWN`) | UNIQUE(auction_id,user_id) |
| auction_deposits | participant_id UNIQUE, auction_id, user_id, amount_paise >0, status (14 states — see AUCTION_DEPOSIT_RULES.md), payment_attempt_id UNIQUE, paid_at, refund_id | UNIQUE(auction_id,user_id); CHECK status='PAID' ⇒ payment_attempt_id NOT NULL AND paid_at NOT NULL; FK pair (auction_id,user_id) → participants |
| auction_deposit_transitions | deposit_id, from_status, to_status, actor, reason, at | append-only history |
| auction_bids | auction_id, participant_id, user_id, amount_paise >0, idempotency_key, accepted_at (= `clock_timestamp()` inside locked txn), seq bigserial, status (`ACCEPTED`,`VOIDED`) | UNIQUE(auction_id, idempotency_key); trigger: participant must be `ACTIVE` with deposit `PAID`, user ≠ asset seller, auction `LIVE` |
| auction_results | auction_id UNIQUE, outcome (`WON`,`RESERVE_NOT_MET`,`NO_BIDS`,`CANCELLED`), winning_bid_id UNIQUE NULL, winner_user_id, final_price_paise, closed_at |
| auction_invoices | result_id UNIQUE, winner_user_id, hammer_price_paise, deposit_credit_paise, charges jsonb (itemised), taxes jsonb, total_payable_paise, due_at, status (`ISSUED`,`PARTIALLY_PAID`,`PAID`,`OVERDUE`,`DEFAULT_REVIEW`,`CANCELLED`) | CHECK deposit_credit_paise ≤ hammer+charges; UNIQUE deposit adjustment via `deposit_adjustments` |
| auction_deposit_adjustments | deposit_id UNIQUE, invoice_id UNIQUE, amount_paise, journal_id | guarantees deposit credited **exactly once** |
| auction_payments | invoice_id, payment_attempt_id UNIQUE, amount_paise, status |
| auction_refunds | deposit_id, reason (`LOST`,`NO_BID`,`CANCELLED`,`SELLER_CANCELLED`,`RESERVE_NOT_MET`,`NO_WINNER`,`MANUAL`,`DEFAULT_RESOLVED`), amount_paise (= deposit amount; CHECK equal for non-manual), status, idempotency_key UNIQUE, provider_refund_id, attempts, last_error, initiated_by, approved_by | partial UNIQUE(deposit_id) WHERE status NOT IN ('REFUND_FAILED_FINAL') — one live refund per deposit |
| auction_settlements | auction_id, seller_id, gross, commission, fees, net, status |
| auction_disputes | auction_id, raised_by, kind, status, resolution |
| auction_default_reviews | invoice_id UNIQUE, opened_at, reviewer_id, decision (`EXTEND`,`REFUND`,`FORFEIT`), policy_version, reason, second_approver_id | FORFEIT requires approved policy version + reason + two distinct approvers (CHECK) |
| auction_restrictions | user_id, scope, reason, until, created_by |

## Critical invariants → enforcement map

| Invariant | DB enforcement |
|---|---|
| One deposit per user per auction | UNIQUE(auction_id,user_id) on deposits |
| Every published auction has positive deposit | `deposit_amount_paise NOT NULL CHECK (>0)` + trigger: status ∉ {DRAFT} requires deposit ≥ `system_settings.auction.deposit.global_min_paise` (itself CHECK >0) |
| PAID deposit references verified payment | CHECK + trigger requiring attempt `CAPTURED`, same user, same amount, purpose `AUCTION_DEPOSIT`, reference = this deposit |
| Bid only by authorised participant | trigger on `auction_bids` + only insert path is `auction.place_bid()` |
| Seller cannot bid own auction | trigger compares asset seller profile with bidder |
| No bids on CLOSED/CANCELLED | trigger + locked status check in function |
| Single winner | UNIQUE(auction_id) on results, UNIQUE(winning_bid_id) |
| Idempotent refunds | UNIQUE idempotency_key + partial unique per deposit |
| Deposit adjusted once | UNIQUE(deposit_id), UNIQUE(invoice_id) on adjustments |
| Financial rows never deleted | no DELETE grants; trigger blocks DELETE on financial tables |
| Users can't see others' financial records | RLS `user_id = auth.uid()` OR `has_permission('finance.read')` |

## Indexes (initial)
auctions(status, ends_at), auctions(category_id, status), auction_bids(auction_id, amount_paise desc, seq),
deposits(user_id, status), deposits(status) where status in refund states, pools(status, deadline_at),
pool_members(user_id), payment_attempts(status, expires_at), outbox(processed_at, available_at),
notifications(user_id, read_at), full-text GIN on pools/assets search vectors.
