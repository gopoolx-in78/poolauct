# Current Status

**Date:** 2026-11-13
**Phase:** 3 — PoolX module + payments core (5a) — **core journeys built and verified locally**; lifecycle after the deadline (negotiation → lock → orders → delivery) not yet built.
**Git:** branch `phase-3-poolx` (from `master` @ `eddb372`); Phase 3 work **not committed yet**. No remote.

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

## Verification (local, 2026-11-13)
lint ✔ · typecheck ✔ · format ✔ · unit ✔ 47/47 · pgTAP ✔ 112/112 · build ✔ · full e2e (1 worker) ✔ 46 passed, 20 skipped by design, 0 failed ·
local parallel runs can flake on the shared Docker VM (TD-38).

## Not built yet / known gaps (Phase 3 remainder)
- 3.7 lifecycle after deadline: seller negotiation records, lock, PRICE_ADJUSTMENT refunds, per-member orders, shipments,
  delivery confirmation, disputes.
- Seller verification UI (SQL function exists; `sellers.manage` UI comes with Phase 6 seller management).
- Product images (needs storage + upload pipeline).
- Private pools (schema supports `kind`; no invite flow).
- Razorpay adapter and real fund-flow (OD-02/OD-03) — **no live payments possible**.
- Cron scheduler wiring (hosting, OD-06).

## Environment notes
- Local Docker VM is intermittently slow (e.g. a 1.8 s Supabase Auth user lookup); consider moving Docker’s disk image off C: (≈12 GB free) and stopping other projects’ stacks when running the full suite.
