# Auction Requirements

Source: Master prompt §6–§8, §24. Last updated: 2026-11-13. Status: ☐ not started.
Deposit/refund specifics: `AUCTION_DEPOSIT_RULES.md`, `REFUND_WORKFLOW.md`.

## Pages
| Route | Content |
|---|---|
| `/auctions` | Hero, live, upcoming, ending soon, featured vehicles, recently listed, categories, how bidding works, **mandatory refundable deposit explainer**, verified sellers, FAQ, register-as-bidder CTA, submit-asset CTA |
| `/auctions/browse` (+ `?status=live|upcoming|ending`) | Search & filters: name, brand, category, model, year, price, location, status, ending time, seller |
| `/auctions/category/[slug]` | Category landing |
| `/auctions/[slug]` | Detail (see below) |
| `/auctions/how-it-works`, `/auctions/sell` | Content + seller submission CTA |
| `/account/auctions/*` | participating, registered, my bids, won, lost, deposits, pending/completed refunds, purchase payments |
| `/seller/*` | seller portal |
| `/admin/auctions/*` | admin |

## Categories (seed)
Used Cars, Motorcycles, Scooters, Commercial Vehicles, Electronics, Laptops, Smartphones, Furniture, Industrial Machinery,
Commercial Equipment, Other Assets — admin can add categories & subcategories; `is_vehicle` flag enables vehicle fields.

## Listing fields
asset name, category, brand, model, year, description, condition, images, videos, location, seller, starting price, reserve,
min increment, start/end, inspection details, pickup/delivery, charges, terms, **deposit config (required to publish)**.

## Vehicle fields
manufacturer, model, variant, year, registration state, fuel, transmission, odometer, owners, insurance validity,
RC verification status, PUC, accident & damage disclosures, service history, inspection report, photos, walkaround video,
inspection location, ownership-transfer requirements.
Registration number stored encrypted + masked (e.g. `MH 12 •• ••34`); private docs only to owner/authorised staff via short-lived signed URLs.
RC/inspection badges shown **only** when `rc_status`/`is_verified` is set by documented manual verification or a legitimate provider, with evidence + verifier recorded.

## Auction types
Implemented: `TIMED_ENGLISH`, `RESERVE`. Engine uses a strategy interface (`validateBid`, `determineResult`) so
`SEALED_BID`, `REVERSE` can be added later. Any bidding format requires deposits. A future Buy Now is a separate
purchase workflow that cannot bypass an active auction.

## Detail page
title, media gallery, description, seller + verification, condition, location, starting price, current highest bid, minimum next bid,
reserve status (per disclosure setting), start/end, countdown (display only), bidder count, bid history (bidders pseudonymised e.g. "Bidder 7"),
inspection, **deposit amount prominently before payment**, refund conditions, charges, terms, "Register & Participate" →
state-aware CTA (Log in / Verify / Accept terms / Pay deposit ₹X / Payment pending / Place bid).

## 8.1 Bid validation (in `auction.place_bid`, all inside one locked transaction)
1 authenticated · 2 verification level met · 3 deposit `PAID` for this auction · 4 auction `LIVE` and `now()` in [starts_at, ends_at] ·
5 not restricted/suspended · 6 not the asset's seller (nor seller org member) · 7 amount ≥ max(starting, current + increment) ·
8 reserve/increment rules · 9 not closed/cancelled · 10 rate-limit & idempotency key unique.

## 8.2 Concurrency
Row lock on auction; `clock_timestamp()` for `accepted_at`; UNIQUE(auction_id, idempotency_key) blocks replays/double-submits;
amount taken only from request body integer paise, validated server-side; UTC storage, Asia/Kolkata display.

## 8.3 Realtime
Broadcast channel `auction:{id}` with snapshot {current_bid, bid_count, bidder_count, ends_at, status}. Clients re-fetch on reconnect.

## 8.4 Closing
pg_cron per minute; idempotent `close_auction`; reserve check; results; invoices; refund jobs; notifications; audit.
Anti-sniping (configurable per auction, default **on** pending OD): bid within last N s extends end by M s, max K extensions; rule shown on page.

## Seller portal (§10)
Toggle third-party sellers (OD-13). Registration, KYC docs, profile, submit listings (→ PENDING_APPROVAL), manage, sales history,
settlements, notifications. Conflict-of-interest checks: seller cannot bid own auction; flag bidders sharing phone/payment fingerprint/IP-hash with seller for review.

## Mandatory acceptance tests (§24) — must all be automated
| # | Case | Expected | Layer |
|---|---|---|---|
| 1 | Publish without deposit config | rejected | pgTAP + API |
| 2 | Zero deposit config | rejected | pgTAP + API |
| 3 | Bid without payment | rejected | pgTAP + API |
| 4 | Payment pending | no bidding | pgTAP + API |
| 5 | Verified payment | bidding enabled | integration (sandbox webhook) |
| 6 | Multiple bids same auction | one deposit | pgTAP |
| 7 | Reuse deposit in another auction | rejected | pgTAP |
| 8 | Simultaneous bids | atomic, valid highest | integration (parallel connections) |
| 9 | Bid after close | rejected | pgTAP |
| 10 | Loser | refund eligible + initiated | integration |
| 11 | Paid, never bid | full refund after close | integration |
| 12 | Admin cancels | full refunds all | integration |
| 13 | Reserve not met | no winner, refunds | integration |
| 14 | Winner | deposit credited once | pgTAP + integration |
| 15 | Duplicate webhook | one state change | integration |
| 16 | Refund retried | no duplicate | integration |
| 17 | Provider refund failure | failed/processing kept + admin alert | integration |
| 18 | Read another user's deposit | denied | pgTAP RLS + API |
| 19 | Seller bids own listing | rejected | pgTAP |
| 20 | Theme change | no business/financial change | integration (snapshot hash of business tables before/after) |
