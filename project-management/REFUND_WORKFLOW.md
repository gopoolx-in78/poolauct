# Refund Workflow

> Status: designed, **not implemented**. Last updated: 2026-11-13.
> Applies to the Auction Refund Engine (deposits) and, with separate tables, PoolX refunds.
> The two engines share only the payment-provider adapter. They never share refund rows.

## 1. Auction refund engine

### Triggering
- `auction.close_auction()` / `auction.cancel_auction()` / seller-withdrawal / reserve-not-met set
  eligible deposits to `REFUND_ELIGIBLE` and insert one `auction_refunds` row each
  (`status=REFUND_ELIGIBLE`, `amount = deposit.amount`, `idempotency_key = 'dep-refund:' || deposit_id || ':' || attempt_no`)
  plus an `outbox` job — all in the same transaction as the close.
- Manual refund: `POST /api/admin/auction-refunds/:id/process` requires permission
  `auction.deposit.refund.manual`, AAL2 MFA, reason text, confirmation, and is rejected if a live refund already exists.

### Worker (`/api/cron/refunds`, every minute, also callable by admin "retry")
1. `SELECT … FROM auction_refunds WHERE status IN ('REFUND_ELIGIBLE') OR (status='REFUND_FAILED' AND retryable AND next_retry_at<=now()) FOR UPDATE SKIP LOCKED LIMIT n`.
2. Move to `REFUND_INITIATED` and commit **before** calling the provider.
3. Call provider `refund(paymentId, amount, idempotencyKey)` — the provider-side idempotency key guarantees a retried HTTP call cannot create a second refund.
4. Record provider refund id; map provider status → `REFUND_PROCESSING` / `REFUNDED` / `REFUND_FAILED`.
5. `REFUNDED` is set **only** on provider-confirmed `processed` status (webhook or authenticated fetch). Ledger journal (Dr deposit liability / Cr gateway clearing) is posted in the same transaction with idempotency key = refund id.
6. Failures: classify recoverable (timeouts, 5xx, rate limit) vs non-recoverable (invalid payment, already fully refunded → reconcile). Recoverable → exponential backoff (1m, 5m, 30m, 2h, 12h; max 5) then `REFUND_FAILED` + admin alert. Non-recoverable → `REFUND_FAILED`, alert finance, no auto-retry.
7. Notifications: eligible, initiated, completed, failed (no payment identifiers beyond masked reference).

### Reconciliation (`/api/cron/reconcile`, hourly)
- Any refund in `REFUND_INITIATED/PROCESSING` older than 30 min → fetch provider status.
- Any `PAYMENT_PENDING` attempt older than its expiry → fetch payment; capture → PAID path; else FAILED.
- Daily: compare provider settlement/refund reports against ledger; mismatches flagged `reconciliation_status='MISMATCH'` for finance review.

### Displayed timelines
UI shows "Refunds are initiated automatically after the auction closes. Your bank/payment provider
typically takes **[provider-dependent estimate from settings]** to credit it." — no guaranteed instant timeline.

## 2. PoolX refunds
Same mechanics on `poolx.pool_refunds` with reasons: `POOL_EXPIRED`, `POOL_CANCELLED`, `MEMBER_WITHDRAWAL`
(per published rules), `SELLER_FAILED`, `DISPUTE_RESOLUTION`, `OVERPAYMENT`. Partial refunds allowed only
for documented reasons (e.g. price dropped after tier unlock → difference refunded). Separate ledger accounts.

## 3. Test coverage required
Acceptance tests 10–17 (see AUCTION_REQUIREMENTS.md §Acceptance) + provider double-webhook, worker crash
between steps 2 and 3, provider returns "already refunded", concurrent admin retry vs worker.
