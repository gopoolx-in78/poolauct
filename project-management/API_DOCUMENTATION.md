# API Documentation

> Status: Phase 2 account/auth surface **implemented** (section "Implemented"); everything else is a planned contract.
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
| Proxy | `src/proxy.ts` | refreshes session cookies; 307 to `/login?next=` for signed-out access to `/account`, `/admin`, `/seller` |

---

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

## Error codes (initial)
`UNAUTHENTICATED`, `FORBIDDEN`, `MFA_REQUIRED`, `VALIDATION_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`,
`DEPOSIT_REQUIRED`, `DEPOSIT_PENDING`, `VERIFICATION_REQUIRED`, `AUCTION_NOT_LIVE`, `BID_TOO_LOW`, `SELLER_CANNOT_BID`,
`RESTRICTED`, `POOL_FULL`, `POOL_NOT_ACTIVE`, `ALREADY_MEMBER`, `REFUND_EXISTS`, `INVALID_TRANSITION`, `PROVIDER_UNAVAILABLE`.
