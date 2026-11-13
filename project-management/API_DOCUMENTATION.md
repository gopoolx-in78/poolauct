# API Documentation

> Status: **planned contracts — none implemented.** Last updated: 2026-11-13.
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
