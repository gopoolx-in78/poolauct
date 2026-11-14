# API Documentation

> Status: Phase 2 account/auth and Phase 3 payments/PoolX surfaces **implemented** (section "Implemented"); everything else is a planned contract.
> Last updated: 2026-11-13.

## Implemented (Phase 2)

### Database RPC — PostgREST schema `api` (call with `supabase.schema("api").rpc(...)`)
| Function | Caller | Behaviour |
|---|---|---|
| `get_my_account()` → jsonb | authenticated | `{id,email,displayName,phone,city,state,status,deletionRequestedAt,createdAt,aal,isStaff,roles[],permissions[]}`; staff permissions listed only at aal2 |
| `update_my_profile(p_display_name, p_city, p_state)` → jsonb | authenticated, active | Trims, blanks→null; constraint-checked; audited when changed |
| `list_my_sessions()` → table | authenticated, active | `id, created_at, last_active_at, user_agent, ip_hint (coarse), aal, is_current` — own sessions only |
| `revoke_my_session(p_session_id uuid)` → boolean | authenticated, active | Deletes own non-current session; `false` if not found/not owned; audited + security event |
| `request_account_deletion(p_reason text)` → jsonb | authenticated, active | Sets `DELETION_REQUESTED`; idempotent; audited |
| `cancel_account_deletion()` → jsonb | authenticated, active | Back to `ACTIVE`; audited |
| `rate_limit_hit(p_bucket, p_max, p_window_seconds)` → boolean | **service_role only** | Fixed-window counter |
| `record_security_event(p_kind, p_user, p_subject_hash)` | **service_role only** | Append-only security event |

Not exposed over HTTP: `core.operator_grant_role(email, role, reason)` — operator bootstrap via SQL (see DEPLOYMENT_GUIDE).

### Next.js routes and server actions
| Kind | Path / action | Notes |
|---|---|---|
| Page | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | noindex; forms post to server actions (built-in Origin check) |
| Route | `GET /auth/confirm?token_hash&type&next` | `type ∈ signup|email|recovery|email_change`; server-side `verifyOtp`; `next` sanitised by `safeNextPath`; failure → `/login?error=link` |
| Action | `signInAction`, `signUpAction`, `forgotPasswordAction`, `resetPasswordAction`, `signOutAction` | zod-validated; rate-limited (TD-28); generic errors (no account enumeration) |
| Page | `/account`, `/account/profile`, `/account/security`, `/account/sessions`, `/account/delete` | noindex; data loaded behind Suspense via DAL |
| Action | `updateProfileAction`, `changeEmailAction`, `revokeSessionAction`, `signOutOtherSessionsAction`, `requestDeletionAction`, `cancelDeletionAction`, `startTotpEnrollmentAction`, `verifyTotpAction` | each re-checks the session (`requireAccount`) |
| Page | `/admin` (staff + aal2 + `admin.dashboard.view`), `/admin/mfa` (staff only) | non-staff see 404 UI (TD-23) |
| Proxy | `src/proxy.ts` | refreshes session cookies; 307 to `/login?next=` for signed-out access to `/account`, `/admin`, `/seller`; skips `/api/webhooks`, `/api/cron`, `/api/health` |

### Phase 3 — payments and PoolX (implemented)

**RPC (schema `api`)**

| Function | Caller | Behaviour |
|---|---|---|
| `poolx_list_categories()`, `poolx_list_pools(search, category, sort, limit≤48, offset)`, `poolx_get_pool(slug)`, `poolx_public_stats()` | anon, authenticated | Public pools only (no drafts/private); live counts from ACTIVE members; money as strings |
| `poolx_start_contribution(pool, quantity)` | authenticated, active | Server-computed amount; reuses a valid pending attempt (no duplicate charge); `ALREADY_MEMBER` for active members; errors `POOL_NOT_JOINABLE`, `INVALID_QUANTITY`, `SELLER_CANNOT_JOIN` |
| `poolx_withdraw(pool)` | authenticated | ACTIVE → full refund queued (only while pool ACTIVE); PENDING → payment cancelled |
| `poolx_my_membership(pool)`, `poolx_my_activity()`, `payments_get_my_attempt(id)` | authenticated | Own data only |
| `poolx_submit_request(...)` | authenticated | Max 5 open requests per user |
| `poolx_admin_list_pools / get_pool / save_pool / set_tiers / publish / cancel / list_sellers / create_seller / list_requests / review_request` | staff at aal2 with the matching `poolx.*` permission | Drafts editable only; tiers frozen after publish; cancel needs a reason and refunds every confirmed member; all audited |
| `poolx_admin_verify_seller(seller, note)` | `sellers.manage` | Documented manual verification |
| `payments_attach_order`, `payments_process_event`, `poolx_claim_refunds`, `poolx_record_refund_result`, `poolx_close_due_pools` | **service_role only** | Payment orchestration and jobs |

**Lifecycle RPC (migration 0009)**

| Function | Caller | Behaviour |
|---|---|---|
| `poolx_admin_close_joining(pool)` | `poolx.pools.manage` | ACTIVE → THRESHOLD_MET once min members confirmed |
| `poolx_admin_record_negotiation(pool, offered_unit_price_paise, terms, outcome)` | `poolx.pools.manage` | append-only log; needs a seller; → NEGOTIATING |
| `poolx_admin_lock(pool)` | `poolx.pools.manage` | needs ACCEPTED offer; final price (TD-39); orders + PRICE_ADJUSTMENT refunds + ledger; idempotent (`alreadyLocked`) |
| `poolx_admin_ship_order(order, carrier, tracking, tracking_url)` / `poolx_admin_mark_delivered(order, note)` | `poolx.orders.manage` | CREATED → SHIPPED → DELIVERED (staff delivery needs evidence note); pool auto-completes |
| `poolx_confirm_delivery(order)` / `poolx_open_dispute(order, reason)` | order owner | SHIPPED → DELIVERED; one open dispute per order |
| `poolx_admin_resolve_dispute(dispute, 'REFUND' \| 'NO_ACTION', refund_paise, note)` | REFUND: `poolx.refunds.manual`; NO_ACTION: `poolx.orders.manage` | refund ≤ remaining refundable; audited |
| `poolx_admin_lifecycle(pool)`, `poolx_admin_list_disputes()` | staff | reads |

Pages: `/admin/poolx/[id]` Fulfilment section (close joining, negotiation log/form, lock, ship/deliver per order), `/admin/poolx/disputes`;
member order panel in `/account/poolx` (confirm delivery, report a problem). Actions: `closeJoiningAction`, `recordNegotiationAction`,
`lockPoolAction`, `shipOrderAction`, `markDeliveredAction`, `resolveDisputeAction`, `confirmDeliveryAction`, `openDisputeAction`.

**HTTP**

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/webhooks/payments/[provider]` | provider signature | ≤64 KB raw body; 400 bad/stale signature; 404 unknown provider; 500 → provider retries; body `{received, result}` (`CONTRIBUTION_CONFIRMED`, `DUPLICATE`, `ALREADY_CAPTURED`, `AMOUNT_MISMATCH`, `LATE_CAPTURE_REFUND`, …) |
| GET | `/api/cron/poolx` | `Authorization: Bearer CRON_SECRET` | closes due pools + processes refunds; 401 otherwise |

**Pages / actions**: `/poolx`, `/poolx/pools` (`q`, `category`, `sort=ending|popular|newest`, `page`), `/poolx/pools/[slug]`,
`/poolx/categories/[slug]`, `/poolx/request` (auth), `/payments/sandbox/[attemptId]` (test mode only, owner only), `/account/poolx`,
`/admin/poolx`, `/admin/poolx/new`, `/admin/poolx/[id]`, `/admin/poolx/requests`. Actions: `joinPoolAction`, `withdrawFromPoolAction`,
`submitPoolRequestAction`, `sandboxCompleteAction`, `savePoolAction`, `saveTiersAction`, `publishPoolAction`, `cancelPoolAction`,
`createSellerAction`, `reviewRequestAction`.

---

### Phases 4–5 — auctions, deposits and refunds (implemented)

**RPC (schema `api`)** — money as strings (paise); errors `CODE: message` (P0001)

| Function | Caller | Behaviour |
|---|---|---|
| `auction_list(view, category, search, limit, offset)`, `auction_get(slug)`, `auction_bid_history(slug)`, `auction_list_categories()`, `auction_public_stats()` | anon, authenticated | Published auctions only; bidders shown as "Bidder N"; reserve shown as met/not met or hidden, never the amount |
| `auction_start_deposit(auction, terms_version)` | authenticated | Requires the current terms version and bidder verification; server-computed deposit; reuses a pending attempt |
| `auction_place_bid(auction, amount_paise, idempotency_key)` | authenticated | Row-locked; live window; PAID deposit for this auction; ≥ minimum next bid; not the seller; idempotent; anti-snipe extension |
| `auction_start_invoice_payment(invoice)`, `auction_my_status(auction)`, `auction_my_activity()`, `payments_get_my_attempt(id)` | authenticated | Own data only |
| `auction_admin_save_listing / publish / cancel / close / list / get` | `auction.listings.manage` / `.approve`, `auction.cancel`, `auction.close.force` (staff, aal2) | Drafts editable only; publish freezes deposit + terms version (`DEPOSIT_REQUIRED`, `DEPOSIT_POLICY_NOT_CONFIGURED`, `ENDS_TOO_SOON`); cancel refunds every paid deposit |
| `auction_admin_deposits_overview()`, `auction_admin_retry_refund(refund, reason)` | `auction.deposit.read` / `auction.deposit.refund.retry` | Counts/amounts by state, ledger liability, recent deposits; retry only REFUND_FAILED |
| `auction_admin_get_deposit_policy()`, `auction_admin_set_deposit_policy(min, max, reason)` | `auction.deposit.config` | min > 0 required; audited |
| `auction_admin_list_default_reviews()`, `auction_admin_decide_default(review, decision, reason, hours)` | `auction.default.review` (+ `auction.default.forfeit`) | EXTEND / REFUND; FORFEIT blocked without an approved policy and needs two approvers |
| `auction_claim_refunds(limit)`, `auction_record_refund_result(...)`, `auction_close_due()` | service_role | Refund worker and scheduled closing |

**Routes:** `/auctions`, `/auctions/browse`, `/auctions/category/[slug]`, `/auctions/sell`, `/auctions/[slug]`, `/account/auctions`,
`/admin/auctions` (+ `new`, `[id]`, `deposits`, `defaults`, `policy`), `GET /api/cron/auctions` (Bearer `CRON_SECRET`: close due
auctions, flag overdue invoices, run refunds). Server actions: `src/app/auctions/actions.ts`, `src/app/admin/auctions/actions.ts`.

### Phase 6 — central admin (implemented)
All are `api.*` SECURITY DEFINER functions, callable by `authenticated` only, checked with `core.require_permission` (staff
permissions need aal2 and an active profile). Every write takes a reason / note and writes `core.audit_logs`.

| Function | Permission | Notes |
|---|---|---|
| `admin_metrics()` | `admin.dashboard.view` | `{users?, poolx, auction}`; users only with `users.read`; money fields null without `finance.ledger.read` |
| `admin_list_users(p_search, p_status, p_role, p_limit, p_offset)` | `users.read` | `{total, items}` |
| `admin_get_user(p_user)` | `users.read` | profile, roles history, verifications, activeSessions, mfaFactors, securityEvents, activity counts |
| `admin_set_user_status(p_user, p_status ACTIVE/SUSPENDED, p_reason)` | `users.suspend` (+ `roles.manage` for staff) | reason ≥ 10; not self; suspension ends all sessions |
| `admin_revoke_user_sessions(p_user, p_reason)` | `users.sessions.revoke` | returns count |
| `admin_list_roles()` | `roles.manage` | roles + permissions + member counts, all permissions, staff list |
| `admin_grant_role` / `admin_revoke_role(p_user, p_role, p_reason)` | `roles.manage` | not self; not `customer`; `ALREADY_GRANTED` / `NOT_GRANTED` / `LAST_SUPER_ADMIN` |
| `admin_set_role_permission(p_role, p_permission, p_granted, p_reason)` | `roles.manage` | staff roles only; Super Admin fixed |
| `admin_list_sellers()` | `sellers.manage` | `{poolx, auction, settlementsVisible}`; gross figures only with `sellers.settlements` |
| `admin_set_seller_status(p_domain, p_seller, p_status, p_note)` | `sellers.manage` | note ≥ 10; sets verifier on VERIFIED |
| `admin_list_payments(p_domain, p_status, p_search, p_limit, p_offset)` | `finance.ledger.read` | |
| `admin_list_refunds(p_domain, p_status, p_limit, p_offset)` | `finance.ledger.read` | PoolX + auction refunds |
| `admin_ledger_overview(p_domain, p_limit, p_offset)` | `finance.ledger.read` | trial balance + journals for one domain; `INVALID_REQUEST` otherwise |
| `admin_export(p_kind payments/refunds/ledger, p_domain, p_from, p_to)` | `finance.reports.export` | ≤ 366 days; audited `finance.export` |
| `admin_list_audit(p_action_prefix, p_actor_email, p_entity_id, p_limit, p_offset)` | `audit.read` | |

Routes: `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/sellers`, `/admin/finance/{payments,refunds,ledger,exports}`,
`/admin/audit` (server actions in each folder's `actions.ts`, redirecting with `?notice=` / `?error=`);
`GET /admin/finance/exports/csv?kind=&domain=&from=YYYY-MM-DD&to=YYYY-MM-DD` → `text/csv` (404 without permission, 400 invalid).

### Phase 7 — theme & CMS (implemented)
Public functions are granted to `anon` and `authenticated` and return published data only. Staff functions are SECURITY
DEFINER, `authenticated` only, checked with `core.require_permission`, and write `core.audit_logs`.

| Function | Permission | Notes |
|---|---|---|
| `cms_public_site()` | public | published design `{id, config, publishedAt}` or null (site falls back to the shipped design) |
| `cms_public_faqs()` / `cms_public_seo()` | public | published FAQs; SEO overrides by route key |
| `cms_public_documents(p_kind, p_limit, p_offset)` / `cms_public_document(p_kind, p_slug)` | public | `{total, items}`; one published document with body |
| `cms_theme_overview()` | `cms.theme.edit` or `cms.theme.publish` | published, draft, version history |
| `cms_theme_save_draft(p_config, p_label)` | `cms.theme.edit` | `INVALID_THEME: <problem>` |
| `cms_theme_discard_draft(p_reason)` | `cms.theme.edit` | |
| `cms_theme_publish(p_note)` | `cms.theme.publish` | note ≥ 10; audited `cms.theme.published` |
| `cms_theme_rollback(p_version, p_reason)` | `cms.theme.publish` | publishes a copy as a new version; `INVALID_REQUEST` if already live, `NOT_FOUND` if never published |
| `cms_admin_list_documents(p_kind)` / `cms_admin_get_document(p_id)` | `cms.content.manage` | with revisions |
| `cms_admin_save_document(p_id, p_kind, p_slug, p_title, p_summary, p_body, p_seo_title, p_seo_description, p_note)` | `cms.content.manage` | new revision; `INVALID_SLUG`, `SLUG_TAKEN`, `SLUG_LOCKED` |
| `cms_admin_document_action(p_id, p_action PUBLISH/UNPUBLISH/RESTORE, p_revision, p_reason)` | `cms.content.manage` | |
| `cms_admin_list_faqs()` / `cms_admin_save_faq(p_id, p_topic, p_question, p_answer, p_sort, p_status)` | `cms.content.manage` | audited `cms.faq.saved` |
| `cms_admin_list_seo()` / `cms_admin_save_seo(p_route, p_title, p_description)` | `seo.manage` | audited `cms.seo.saved` |

Routes: public `/faq`, `/blog`, `/blog/[slug]`, `/info/[slug]`; admin `/admin/theme`, `/admin/theme/editor`, `/admin/content`
(+ `/new`, `/[id]`, `/faqs`), `/admin/seo` (server actions in each folder's `actions.ts`; publish actions call `updateTag`).

### Phase 8 — notifications (implemented)
| Function | Caller | Notes |
|---|---|---|
| `notifications_list(p_unread_only, p_limit ≤ 50, p_offset)` | authenticated | own in-app notifications `{total, unread, items[{id, event, domain, data, link, readAt, createdAt}]}` |
| `notifications_unread_count()` | authenticated | |
| `notifications_mark_read(p_id)` | authenticated | `null` = all; returns rows changed (0 for someone else's id) |
| `notifications_preferences()` | authenticated | every event with label, description, audience, essential, effective inApp / email |
| `notifications_set_preference(p_event, p_in_app, p_email)` | active user | `NOT_FOUND`, `INVALID_REQUEST`, `ESSENTIAL` |
| `notifications_claim_deliveries(p_limit ≤ 100)` | service_role | marks SENDING, counts the attempt; returns event, data, link, recipient e-mail + name + status |
| `notifications_record_delivery(p_delivery, p_status SENT/FAILED/SKIPPED, p_provider, p_message_id, p_error, p_retryable)` | service_role | `SENT` / `RETRY` / `FAILED` / `SKIPPED` / `IGNORED` (not SENDING) |
| `auction_notify_due()` | service_role | queues starting-soon / ending-soon reminders; returns count |
| `admin_notification_overview()` | `support.tickets` | 7-day counts by status, notifications, trigger errors, recent errors, event list |
| `admin_list_notification_deliveries(p_status, p_event, p_search, p_limit ≤ 100, p_offset)` | `support.tickets` | includes the customer e-mail |
| `admin_retry_notification_delivery(p_delivery, p_reason ≥ 10)` | `support.tickets` | FAILED / SKIPPED only; audited `notification.delivery.retried` |

Routes: `GET /api/cron/notifications` (Bearer `CRON_SECRET`, every minute) → `{deliveries: {sent, failed, retry, skipped}}`;
`GET /api/cron/auctions` now also returns `reminders`. Pages `/account/notifications`, `/account/notifications/preferences`,
`/admin/notifications` (server actions in each folder's `actions.ts`).

## Planned contracts
> All endpoints: JSON, zod-validated, typed responses `{ data } | { error: { code, message } }`, no internal details in errors.
> Mutations: authenticated, Origin-checked, rate-limited, `Idempotency-Key` header required for payment/bid/refund mutations.
> Pagination: cursor-based `?cursor=&limit=` (limit ≤ 50). Times ISO-8601 UTC. Money as integer paise strings (`"500000"`).

## Shared
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | — | liveness + DB ping (no internals) |
| GET | `/api/users/me` | user | profile, roles, verification levels |
| PATCH | `/api/users/me` | user | profile fields |
| GET | `/api/users/me/sessions` · DELETE `/api/users/me/sessions/[id]` | user | |
| POST | `/api/users/me/deletion-request` | user | |
| GET/PATCH | `/api/users/me/notifications` · `/preferences` | user | |
| GET | `/api/users/me/transactions?domain=poolx|auction` | user | domain required — never combined |
| POST | `/api/webhooks/payments/[provider]` | provider signature | raw body HMAC, event de-dup |
| POST | `/api/uploads/sign` | user | returns signed upload URL for allowed kind |
| POST | `/api/contact` | — (rate-limited, anti-spam) | stores ticket |
| GET | `/api/cron/*` | `CRON_SECRET` bearer | refunds, reconcile, notifications |

## PoolX
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/poolx/pools` | — | search, filters, sort |
| GET | `/api/poolx/pools/[id]` | — | incl. tiers, live counts |
| POST | `/api/poolx/pools/[id]/join` | user | body `{quantity}` → membership + payment attempt |
| GET | `/api/poolx/pools/[id]/membership` | user | status poll |
| POST | `/api/poolx/pools/[id]/withdraw` | user | per published rules |
| POST | `/api/poolx/requests` | user | private/custom pool request |
| GET | `/api/users/me/poolx/{memberships,contributions,orders,refunds}` | user | |
| POST/PATCH | `/api/admin/poolx/pools[/id]` | `poolx.pools.manage` | |
| POST | `/api/admin/poolx/pools/[id]/{approve,lock,cancel,complete}` | per matrix | |
| PUT | `/api/admin/poolx/pools/[id]/tiers` | `poolx.tiers.manage` | |
| POST | `/api/admin/poolx/requests/[id]/review` | `poolx.requests.review` | |
| POST | `/api/admin/poolx/refunds/[id]/process` | `poolx.refunds.manual` + MFA | reason required |

## Auction (from §14)
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/auctions` | — | filters per §16 |
| GET | `/api/auctions/[id]` | — | public detail; reserve per disclosure |
| POST | `/api/auctions` | seller / `auction.listings.manage` | creates DRAFT |
| PATCH | `/api/auctions/[id]` | owner seller (DRAFT only) / staff | reserve edits need `auction.reserve.edit` |
| POST | `/api/auctions/[id]/publish` | `auction.listings.approve` | rejects without valid deposit |
| POST | `/api/auctions/[id]/register` | user | terms acceptance + verification check |
| POST | `/api/auctions/[id]/deposit` | user | server-computed amount; returns checkout params |
| GET | `/api/auctions/[id]/deposit-status` | user | own only |
| POST | `/api/auctions/[id]/bids` | user w/ PAID deposit | `{amountPaise}` + Idempotency-Key |
| GET | `/api/auctions/[id]/bids` | — | pseudonymised history |
| GET | `/api/auctions/[id]/result` | — / winner sees invoice link | |
| GET | `/api/users/me/auction-deposits` | user | |
| GET | `/api/users/me/auction-refunds` | user | |
| GET | `/api/users/me/auction-invoices/[id]` · POST `.../pay` | winner | |
| POST | `/api/admin/auctions/[id]/close` | `auction.close.force` + MFA | idempotent |
| POST | `/api/admin/auctions/[id]/cancel` | `auction.cancel` + MFA | triggers refunds |
| GET | `/api/admin/auction-deposits` | `auction.deposit.read` | filters by status |
| POST | `/api/admin/auction-refunds/[id]/process` | `auction.deposit.refund.manual` + MFA | reason, confirmation, duplicate check |
| POST | `/api/admin/auction-refunds/[id]/retry` | `auction.deposit.refund.retry` | |
| POST | `/api/admin/auction-default-reviews/[id]/decide` | `auction.default.review` (+ `.forfeit` & 2nd approver) | |
| GET | `/api/admin/reports/[kind].csv` | `finance.reports.export` | CSV-injection-safe |

## Phase 10 — launch readiness
| Function | Who | Returns |
|---|---|---|
| `api.auction_admin_media_add(p_auction, p)` / `api.poolx_admin_media_add(p_pool, p)` | staff with `auction.listings.manage` / `poolx.pools.manage` at aal2 | the new photo `{ id, alt, display {path,width,height}, thumb {...} }`; draft listings only, max 12; called by `POST /api/media` after re-encoding |
| `api.auction_admin_media_update(p_media, p_alt, p_move)` / `api.poolx_admin_media_update(...)` | same | void — new alt text and / or `up` / `down` |
| `api.auction_admin_media_remove(p_media)` / `api.poolx_admin_media_remove(p_media)` | same | void — unlinks and marks REMOVED; the server then deletes the files |
| `api.auction_admin_media_list(p_auction)` / `api.poolx_admin_media_list(p_pool)` | same | photos in order (any status) |
| `api.auction_media(p_slug)` / `api.poolx_pool_media(p_slug)` | anyone | photos of a published auction / publicly visible pool |
| `api.auction_media_covers(p_slugs)` / `api.poolx_media_covers(p_slugs)` | anyone | `{ slug: firstPhoto }` for list cards (≤ 60 slugs) |
| `api.cms_admin_featured_list()` / `api.cms_admin_featured_add(p_module, p_slug)` / `api.cms_admin_featured_move(p_id, p_move)` / `api.cms_admin_featured_remove(p_id)` | staff with `cms.content.manage` at aal2 | list `[{ id, module, slug, position }]`; add returns the row (ALREADY_FEATURED, TOO_MANY_FEATURED at 6, INVALID_MODULE, INVALID_SLUG); move `up` / `down`; remove (NOT_FOUND) |
| `api.cms_featured()` | anyone | `{ poolx: [slug], auction: [slug] }` in order |
| `api.poolx_pools_by_slugs(p_slugs)` / `api.auction_by_slugs(p_slugs)` | anyone | list-card JSON for the slugs that are open now (pool ACTIVE before its deadline; auction LIVE / SCHEDULED), in the given order, ≤ 12 |
| `api.cms_admin_cover_set(p_document, p)` | staff with `cms.content.manage` at aal2 | `{ media, replacedId }` — sets or replaces the cover; called by `POST /api/media` (target `cms`), which then deletes the replaced files |
| `api.cms_admin_cover_remove(p_document)` | same | removed media id or null; the server action deletes the files |
| `api.cms_admin_cover_get(p_document)` | same | current cover or null |
| `api.cms_public_documents(...)` / `api.cms_public_document(...)` | anyone | now also `cover` (photo or null) |
| `GET /api/notifications/unread` (route) | signed-in user | `{ unread }` (no-store, private) for the header badge; 401 without a session, 503 if the count cannot be read |
| `POST /api/media` (route) | staff at aal2, same origin | multipart `target` (auction / pool / cms), `id`, `alt`, `file` (JPEG / PNG / WebP ≤ 10 MB) → 201 `{ media }`; 400 invalid image or details, 403 not allowed / cross-site, 413 too large, 429 over 60 uploads / hour |
| `api.launch_readiness()` | service_role only | `{ ok, checks: [{ key, ok, detail }] }` — deposit policy set by staff, no `.test` accounts, no sandbox payments, Super Admin with MFA, RLS on all application tables, service-role timeouts. Counts only. |

## Error codes (initial)
`UNAUTHENTICATED`, `FORBIDDEN`, `MFA_REQUIRED`, `VALIDATION_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`,
`DEPOSIT_REQUIRED`, `DEPOSIT_PENDING`, `VERIFICATION_REQUIRED`, `AUCTION_NOT_LIVE`, `BID_TOO_LOW`, `SELLER_CANNOT_BID`,
`RESTRICTED`, `POOL_FULL`, `POOL_NOT_ACTIVE`, `ALREADY_MEMBER`, `REFUND_EXISTS`, `INVALID_TRANSITION`, `PROVIDER_UNAVAILABLE`.
