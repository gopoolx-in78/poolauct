# PoolX Requirements

Source: Master prompt §5 + `POOLX_REBUILD_PROMPT.md`. Last updated: 2026-11-13.
Status: ◐ catalogue, join/pay (sandbox), withdraw/refunds, requests, account and admin **built**; lifecycle after the
deadline (negotiation, lock, price-adjustment refunds, orders, shipments, delivery, disputes), product images, private pools
and seller-verification UI **pending** — see PENDING_TASKS.md 3.7–3.13. Contribution model: DECISION_LOG TD-29 (pending OD-03/OD-10).

## Positioning & voice
Tagline "Power of People. Power of Pooling." · "Join buying pools, combine purchasing power and negotiate like a corporation."
Tone: confident, plain-spoken, numbers-forward. **Do not** publish "15–40% off", "0% convenience fee for life" or
savings figures as promises unless the owner confirms and real data backs them (OD-10).

## Pages
| Route | Content |
|---|---|
| `/poolx` | Hero + **live pool participation card** (real featured pool: product, current unit price, verified reference price, members/target, progress, current tier, next milestone, deadline, Join) with "price steps down as members join" animation; value prop; search; featured pools; categories; real active-pool & member stats; how it works (5 steps: Discover & Join → Secure Contribution → Negotiation → Deal Locked → Direct Delivery); why pooling ("buying alone is expensive" 4 points); verified sellers; security & payments; testimonials (only genuine — section hidden if none); FAQ; create/join CTA |
| `/poolx/pools` | Grid with search, category filter, status filter, sort (ending soon, most joined, biggest discount, newest), pagination, empty state |
| `/poolx/pools/[slug]` | Full detail, tier ladder, progress, terms, contribution requirement, join flow, share (WhatsApp/Instagram/copy link) |
| `/poolx/categories/[slug]` | Category landing |
| `/poolx/how-it-works`, `/poolx/use-cases`, `/poolx/trust` | Content pages (from old site page list) |
| `/poolx/request` | Private/custom pool request form (auth) |
| `/account/poolx/*` | My pools, requests, contributions, orders, deliveries, refunds |
| `/admin/poolx/*` | Admin management (§5.9) |

Demo/seed data never appears as live participation in production (seed restricted to local env and labelled).

## Pool card fields
image, name, description, category, unit price, reference price, discount %, members/target, progress, remaining time,
seller verification, status, Join, share.

## Categories (seed)
Electronics, Smartphones, Laptops, Groceries, Construction materials, Cement and steel, Society purchases,
Office supplies, Household products, Commercial supplies, Services, Custom group purchases — admin add/edit/disable/reorder.

## Pool request fields
title, product/service, description, category, est. quantity, target participants, expected price, specs,
preferred seller, delivery location, deadline, supporting documents → status SUBMITTED → admin review → may create pool.

## Membership
Join → confirm quantity (min/max) → review terms → see server-computed contribution → pay → confirmation → track →
withdraw per published rules (e.g. allowed while `ACTIVE`, refund of contribution) → milestone notifications.
One membership per user per pool (UNIQUE). Idempotent join; reconcile pending payment before new charge.

## Discount mechanism
Tiers per pool (`MEMBERS` or `QUANTITY` threshold → discount bps), strictly increasing. Current tier computed from
**confirmed** contributions only. Displayed price = base unit price × (1 − tier) — computed in one shared pure function
(`modules/poolx/domain/pricing.ts`) mirrored by SQL for authoritative order pricing; property-tested to agree.
Admin controls: tiers, min/target members, min/max qty, deadline, unit price, negotiation terms, platform fee, completion conditions.

## Contribution modes (OD-03/OD-10 decide which is legal & used)
`FULL` (pay full discounted price at join; difference refunded if a deeper tier unlocks), `FIXED` token, `PERCENT` advance with balance on lock.

## Lifecycle
DRAFT → PENDING_APPROVAL → ACTIVE → (THRESHOLD_MET) → NEGOTIATING → LOCKED → ORDERING → COMPLETED;
ACTIVE → EXPIRED (deadline, min not met → refunds) ; any pre-LOCKED → CANCELLED (refunds).
After LOCKED: per-member order, balance payment if any, reconciliation, individual delivery, tracking, delivery confirmation, disputes, refunds.

## Admin (§5.9)
Pools, members, applications, products, discounts, sellers, negotiation records, deadlines, contributions, orders, shipping, refunds, disputes, analytics.

## Data model note
The reference `Pool` TS interface (string `discount`, `progress`, `iconType`, social links) is retained only as a
**view model** derived from normalised tables — `progress` and `currentMembers` are computed, never stored from client input.
