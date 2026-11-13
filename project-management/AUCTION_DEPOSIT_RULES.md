# Auction Participation Deposit Rules (NON-NEGOTIABLE)

> Status: rules approved by master prompt §7; **implemented** in migrations 0010–0011 and verified locally by pgTAP `0005_auction_acceptance.test.sql`, `tests/integration/auction-concurrency.test.ts` and Playwright `auction.spec.ts` (sandbox payments only). Forfeiture stays blocked pending OD-11. Last updated: 2026-11-13.

## 1. Invariants

| ID | Invariant | Enforced in |
|---|---|---|
| D-1 | Every auction that is not `DRAFT` has `deposit_amount_paise > 0`. | DB CHECK + publish trigger + `auction.publish_auction()` + zod |
| D-2 | No configuration (global or per-auction) can set a zero or negative deposit, and **no setting exists to disable deposits**. | DB CHECKs on `system_settings` key and `auctions`; no such flag in schema/UI |
| D-3 | Deposit amount is computed on the server and frozen at publish (`deposit_amount_paise`). Later config changes don't alter live auctions' amounts. | `auction.publish_auction()` |
| D-4 | A user may bid only if `auction_deposits.status = 'PAID'` for **that** `(auction_id, user_id)`. | `place_bid()` + bid trigger |
| D-5 | One deposit per user per auction; deposits are not transferable or reusable across auctions or users. | UNIQUE(auction_id,user_id); deposit row carries both ids immutably (trigger forbids update of those columns) |
| D-6 | `PAID` requires a provider-verified captured payment whose amount, currency, user and reference equal the deposit. | `confirm_deposit_payment()` + trigger |
| D-7 | Pending/failed/abandoned/reversed payments never grant bidding. | `place_bid()` checks status = `PAID` only; reversal sets participant `SUSPENDED` |
| D-8 | An earlier `PAYMENT_PENDING` attempt is reconciled with the provider before a new charge is created. | `start_deposit()` flow |
| D-9 | Every eligible non-winner gets a **full** refund (no fee, commission or penalty deducted). | `auction_refunds.amount_paise = deposit.amount_paise` CHECK for non-manual reasons |
| D-10 | Winner's deposit is credited against the invoice exactly once. | `auction_deposit_adjustments` uniques + ledger idempotency key |
| D-11 | Deposits are liabilities, never revenue. Forfeiture only via approved policy + 2-person review. | Ledger account types; `auction_default_reviews` CHECK |

## 2. Configuration

| Setting | Scope | Rule |
|---|---|---|
| `auction.deposit.global_default` | global | `{mode: FIXED|PERCENT_OF_STARTING, value}` — value > 0 |
| `auction.deposit.global_min_paise` | global | > 0 (hard floor; DB CHECK) |
| `auction.deposit.global_max_paise` | global | ≥ min |
| per-auction override | auction | mode + value; computed amount clamped to [min, max]; result must be > 0 |
| Percentage basis | — | **starting price** (`PERCENT_OF_STARTING`, value in basis points). Rounded **up** to the nearest rupee (100 paise). Documented on the listing. |
| Currency | — | INR only (CHECK) |
| Deposit terms / refund rules | versioned CMS document | participant stores `terms_version` accepted |

Actual default numbers (e.g. ₹2,000 fixed, min ₹500) are **owner decisions (OD-04)** — not invented here.

## 3. Bidder workflow (exact)
1. Open auction → 2. review details, terms, deposit, refund conditions → 3. log in/register →
4. complete bidder verification (level per OD-05) → 5. accept participation terms (versioned) →
6. start deposit payment → 7. provider processes → 8. server verifies via signed webhook (or
authenticated provider API fetch during reconciliation) → 9. deposit `PAID` → 10. participant
`ACTIVE` → 11. bid any number of times in that auction.

## 4. State machine

```
CREATED ──▶ PAYMENT_PENDING ──▶ PAID ──▶ REFUND_ELIGIBLE ──▶ REFUND_INITIATED ──▶ REFUND_PROCESSING ──▶ REFUNDED
                 │                │  │                              │    ▲               │
                 ▼                │  │                              ▼    │ (retry)       ▼
           PAYMENT_FAILED         │  │                         REFUND_FAILED ◀────────────┘
                                  │  ▼
                                  │ WINNER_ADJUSTMENT_PENDING ──▶ ADJUSTED
                                  │            │
                                  │            ▼
                                  │      DEFAULT_REVIEW ──▶ ADJUSTED | REFUND_ELIGIBLE | FORFEITED*
                                  ▼
                           PAYMENT_REVERSED
```

Allowed transitions (anything else raises in `auction.transition_deposit()`):

| From | To | Trigger |
|---|---|---|
| CREATED | PAYMENT_PENDING | provider order created |
| PAYMENT_PENDING | PAID | verified capture webhook / reconciliation |
| PAYMENT_PENDING | PAYMENT_FAILED | provider failure, or attempt expired after reconciliation |
| PAYMENT_FAILED | PAYMENT_PENDING | user retries (new payment attempt on same deposit row) |
| PAID | REFUND_ELIGIBLE | auction closed (non-winner / no bid / reserve not met / no winner), cancelled, seller withdrawal, asset unavailable |
| PAID | WINNER_ADJUSTMENT_PENDING | close: user is winner |
| PAID | PAYMENT_REVERSED | provider chargeback/reversal → participant SUSPENDED, bids reviewed |
| REFUND_ELIGIBLE | REFUND_INITIATED | refund worker or authorised manual action |
| REFUND_INITIATED | REFUND_PROCESSING / REFUNDED / REFUND_FAILED | provider response |
| REFUND_PROCESSING | REFUNDED / REFUND_FAILED | provider webhook / reconciliation |
| REFUND_FAILED | REFUND_INITIATED | retry (recoverable error, same idempotency key family) |
| WINNER_ADJUSTMENT_PENDING | ADJUSTED | invoice issued & deposit credit posted |
| WINNER_ADJUSTMENT_PENDING | DEFAULT_REVIEW | payment deadline passed |
| WINNER_ADJUSTMENT_PENDING | REFUND_ELIGIBLE | sale voided not due to buyer (seller cancels, asset unavailable) |
| DEFAULT_REVIEW | ADJUSTED / REFUND_ELIGIBLE | review outcome |
| DEFAULT_REVIEW | FORFEITED* | **only** with approved & published forfeiture policy version, documented reason, two distinct authorised approvers, audit record |

*`FORFEITED` is blocked in the DB until `system_settings.auction.forfeiture_policy_approved_version`
is set by a Super Admin (itself audited) — pending legal review (OD-11).

Note on "ADJUSTED": once the deposit is credited to the winner's invoice it becomes part of the purchase
payment; any later purchase cancellation is refunded through the purchase-refund flow, not the deposit
flow (prevents double refunds).

## 5. Treatment by outcome (defaults from §7.5)

| Outcome | Deposit |
|---|---|
| Lost / participated but did not win | Full refund |
| Paid but never bid | Full refund after close |
| Admin cancels auction | Full refund (all PAID; PENDING ones refunded on capture) |
| Seller cancels / asset unavailable | Full refund |
| Reserve not met | No winner; full refund to all |
| No valid winner | Full refund to all |
| Winner completes purchase | Credited to invoice (ADJUSTED) |
| Winner fails to pay | DEFAULT_REVIEW → only legally approved, pre-disclosed rules |

Late capture: if a payment is captured after the auction closed/cancelled, the deposit goes
`PAID → REFUND_ELIGIBLE` immediately; it never grants bidding.
