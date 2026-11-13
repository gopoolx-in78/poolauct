# Financial Architecture

> Status: ledger, payment attempts, webhook processing and **PoolX** capture/refund journals **implemented** (migrations
> 0006–0008, pgTAP-verified) with a **test-only sandbox provider**. Auction journals, seller settlements, invoices and a real
> provider are not built. Last updated: 2026-11-13.
>
> Implemented journals: `CONTRIBUTION_CAPTURED` (Dr `poolx:gateway_clearing` / Cr `poolx:contribution_liability`, key
> `poolx:capture:<attempt>`), `CONTRIBUTION_REFUNDED` (Dr `poolx:contribution_liability` — or `poolx:seller_payable` for a
> post-order dispute refund — / Cr `poolx:gateway_clearing`, key `poolx:refund:<refund>`), `ORDER_CREATED` at lock (Dr
> `poolx:contribution_liability` / Cr `poolx:seller_payable` + `poolx:platform_fee_revenue`, key `poolx:order:<order>`).
> PoolX contribution model: TD-29; lock pricing: TD-39; dispute accounting: TD-41. Seller settlement payouts are not built.
> **Legal notice:** nothing here makes the platform an escrow agent or authorises it to hold
> customer funds. The legally suitable fund-flow structure (payment aggregator marketplace /
> split settlement / escrow arrangement with a regulated entity) must be confirmed by the owner's
> legal counsel and the payment provider before live payments are enabled (OD-02, OD-03).
> UI copy will say "held per our payment partner's settlement terms", not "escrow", until confirmed.

## 1. Money representation
- `bigint` paise in DB; TS branded type `Paise` (bigint) with helpers in `src/lib/money.ts`
  (`formatINR` uses `Intl.NumberFormat('en-IN')` → ₹5,63,000). No `number` arithmetic on money.
- Percentages as basis points (`bps`, integer). Rounding rule stated per computation (deposit: round up to whole rupee; discounts: round half-up to paise; taxes: per tax rules OD-12).

## 2. Separate financial domains

| Domain | Flows |
|---|---|
| PoolX | contributions, order balance payments, pool refunds, seller settlements, platform fees |
| Auction | participation deposits, deposit refunds, winner deposit adjustments, purchase payments, commissions/buyer premium (if approved), seller settlements |

`payment_attempts.domain` + `purpose` route every payment to one domain. Ledger accounts are
domain-prefixed and a trigger rejects journals mixing domains. Dashboards never sum the two.

## 3. Chart of accounts (initial)

| Code | Type | Meaning |
|---|---|---|
| `auction:gateway_clearing` | ASSET | funds captured by provider, not yet settled |
| `auction:deposit_liability` | LIABILITY | refundable participation deposits owed to bidders |
| `auction:buyer_receivable` | ASSET | winner invoice balance |
| `auction:seller_payable` | LIABILITY | owed to seller after sale |
| `auction:commission_revenue` | REVENUE | only if commission approved (OD-10) |
| `poolx:gateway_clearing` | ASSET | |
| `poolx:contribution_liability` | LIABILITY | member contributions pending order |
| `poolx:seller_payable` | LIABILITY | |
| `poolx:platform_fee_revenue` | REVENUE | only disclosed fees |

## 4. Journal templates

| Event | Debit | Credit |
|---|---|---|
| Deposit captured | auction:gateway_clearing | auction:deposit_liability |
| Deposit refunded (provider confirmed) | auction:deposit_liability | auction:gateway_clearing |
| Invoice issued (hammer + charges) | auction:buyer_receivable | auction:seller_payable (+ commission_revenue) |
| Winner deposit adjusted | auction:deposit_liability | auction:buyer_receivable |
| Purchase balance captured | auction:gateway_clearing | auction:buyer_receivable |
| Contribution captured | poolx:gateway_clearing | poolx:contribution_liability |
| Pool refund confirmed | poolx:contribution_liability | poolx:gateway_clearing |

Every journal has a unique idempotency key derived from its business event id → replaying a webhook
or job cannot double-post.

## 5. Winner invoice example (from requirements)
| Line | Amount |
|---|---|
| Winning bid | ₹5,65,000 |
| Less: participation deposit already paid | −₹2,000 |
| Remaining product amount | ₹5,63,000 |
| + itemised disclosed charges (e.g. documentation) | per auction config |
| + applicable taxes | per OD-12 |
| **Total payable** | computed server-side |

## 6. Payment security
Signed webhooks (HMAC-SHA256 over raw body), event-id de-duplication, amount/currency/reference
verification against our record, idempotency keys on provider calls, server-computed amounts only,
no card data stored (provider-hosted checkout), reconciliation jobs, audit logs on every manual action.

## 7. Metrics definitions (admin)
Gross bid value ≠ collections ≠ revenue. Admin dashboard shows separately: deposits received,
deposits outstanding (liability), refunds completed/pending, deposits adjusted, purchase collections,
commission revenue, PoolX contributions held, PoolX fees. Deposits are never shown as revenue.
