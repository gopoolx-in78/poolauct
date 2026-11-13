# Current Status

**Date:** 2026-11-13
**Phase:** 3 — PoolX module + payments core (5a) — **full pool lifecycle built and verified locally** (join → pay → close → negotiate → lock → orders → ship → deliver/dispute → complete). Remaining Phase 3 items are extras (images, private pools, seller-verification UI, payouts).
**Git:** branch `phase-3-poolx`: core committed as `16ca7af`; the 3.7 lifecycle work is **not committed yet**. No remote.

## What exists and is verified
### Earlier phases
Foundation (Phase 1) and accounts/RBAC/staff MFA (Phase 2) — see CHANGELOG and git history.

### Phase 3 (this session)
- **Payments core:** provider-agnostic payment attempts (provider set by server only), webhook event store (de-duplicated),
  provider refunds mirror; `api.payments_process_event` single entry point (idempotent, amount-checked, domain-routed).
- **Ledger:** double-entry, insert-only, balanced and domain-isolated by triggers; capture and refund journals posted idempotently.
- **Sandbox provider (test only):** signed HMAC webhooks with replay window; test checkout page clearly labelled; refused in
  production. Razorpay adapter **not built** (OD-02).
- **PoolX database:** categories, sellers, pools, tiers, requests, members, contributions, refunds with CHECKs/triggers
  (amount formula, monotonic tiers, refunds ≤ paid, one membership per user, one live contribution per membership).
- **PoolX behaviour:** server-priced join from confirmed members; reuse of pending attempt; verified capture → membership;
  failed payment → retry; withdraw → full refund; late capture → automatic refund; admin cancel → refunds; deadline job →
  THRESHOLD_MET or EXPIRED (+ refunds); refund worker with retry/backoff.
- **Public pages:** `/poolx` (live hero card + real stats, illustration only when no pool is open), `/poolx/pools`
  (search/filter/sort/paginate), `/poolx/pools/[slug]` (tiers, rules, fee disclosure, join panel, share links, Product JSON-LD),
  `/poolx/categories/[slug]`, `/poolx/request`; sitemap includes categories and pools.
- **Account:** `/account/poolx` (memberships, contributions, refunds, requests, two-step withdraw); menu entry added.
- **Admin:** `/admin/poolx` list, create/edit draft, tier editor, publish, cancel-with-refunds, add seller, request review.
- **Jobs:** `GET /api/cron/poolx` (Bearer `CRON_SECRET`).
- **Lifecycle (3.7):** close joining early; append-only negotiation log; lock with seller confirmation (final price TD-39,
  price-adjustment refunds, one order per member, seller-payable + fee journals, idempotent); shipping with tracking; member
  delivery confirmation / staff delivery with evidence; disputes (no-action by PoolX staff, refunds by finance only); pool
  auto-completes; public page shows the locked price. Integrity triggers now SECURITY DEFINER (TD-40, bug found by e2e).

## Verification (local, 2026-11-13)
lint ✔ · typecheck ✔ · format ✔ · unit ✔ 47/47 · pgTAP ✔ 148/148 · build ✔ · full e2e (1 worker) ✔ 47 passed, 21 skipped by design, 0 failed ·
local parallel runs can flake on the shared Docker VM (TD-38).

## Not built yet / known gaps (Phase 3 remainder)
- Seller payouts/settlements for `poolx:seller_payable` (Phase 6 finance).
- Notifications for lock/adjustment/shipment/dispute (Phase 8).
- Seller verification UI (SQL function exists; `sellers.manage` UI comes with Phase 6 seller management).
- Product images (needs storage + upload pipeline).
- Private pools (schema supports `kind`; no invite flow).
- Razorpay adapter and real fund-flow (OD-02/OD-03) — **no live payments possible**.
- Cron scheduler wiring (hosting, OD-06).

## Environment notes
- Local Docker VM is intermittently slow (e.g. a 1.8 s Supabase Auth user lookup); consider moving Docker’s disk image off C: (≈12 GB free) and stopping other projects’ stacks when running the full suite.
