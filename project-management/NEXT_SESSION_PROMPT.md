# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 3 (PoolX + payments core) — core journeys done; **lifecycle after the deadline (3.7) is next**.
**Last completed milestone:** PoolX join/pay/withdraw/refund with signed (sandbox) webhooks, double-entry ledger, admin pool management.
**Last completed task:** Phase 3 docs checkpoint.
**Git:** branch `phase-3-poolx` (from `master` @ `eddb372`) — check `git status`/`git log`; may not be committed yet. No remote.
**Files recently modified:** `supabase/migrations/2026111300000{6,7,8}_*.sql`, `supabase/tests/0003_payments_poolx.test.sql`
(+ 0001 adjusted, TD-37), `src/modules/payments/**`, `src/modules/poolx/**`, `src/lib/{time,supabase/public}.ts`, `src/app/poolx/**`,
`src/app/payments/**`, `src/app/api/{webhooks,cron}/**`, `src/app/account/poolx/**`, `src/app/admin/poolx/**`,
`src/components/poolx/**`, `src/components/layout/{site-header,main-nav}.tsx`, `src/app/sitemap.ts`, `tests/**`, `.env.example`, CI.
**Database changes:** migrations 0001–0008 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 47/47 ✔ · pgTAP 112/112 ✔ · build ✔ · full e2e (1 worker) 46 passed / 20 skipped by design / 0 failed ✔.
**Known gaps:** Razorpay adapter (OD-02); no live payments; images; private pools; seller-verification UI; cron schedule (OD-06).
**Environment:** local Docker disk I/O is very slow (TD-38) — use `--workers=1` for full e2e runs locally.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file
→ `git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` →
`pnpm test:db` (expect 112/112) → report status.

## Next exact task: 3.7 PoolX lifecycle after the deadline
1. Migration: `poolx.negotiations` (pool, seller, offered unit price paise, terms, status, recorded_by, created_at; RLS staff),
   `poolx.orders` (one per ACTIVE member at lock: final unit price, quantity, amount, status `CREATED/CONFIRMED/SHIPPED/DELIVERED/
   CANCELLED/DISPUTED`), `poolx.shipments` (order, carrier, tracking no., status, events jsonb), `poolx.disputes`.
2. `api.poolx_admin_record_negotiation`, `api.poolx_admin_lock(pool)`: only from THRESHOLD_MET/NEGOTIATING; final price =
   `poolx.discounted_price(base, discount at final confirmed count)`; create orders; for each member whose contribution
   unit price > final, insert `PRICE_ADJUSTMENT` refund for `(paid_unit − final_unit) × qty` (+ fee difference); post seller
   payable journal (Dr `poolx:contribution_liability` / Cr `poolx:seller_payable` [+ `poolx:platform_fee_revenue`]).
3. Shipments + member delivery confirmation; disputes with admin resolution (MANUAL refund requires reason, audited).
4. Account + admin UI for these states; e2e: pool reaches threshold → lock → adjustment refund visible → order shipped → delivered.
5. pgTAP: lock is idempotent; adjustment refunds never exceed paid (existing trigger); ledger balanced; orders only for ACTIVE members.

## Patterns to follow
- HTTP surface = `api.*` functions only, explicit grants, pgTAP `has_function_privilege` checks.
- Errors from SQL: `raise exception 'CODE: text' using errcode = 'P0001'`; map in `poolxErrorMessage`.
- Forms: `useActionState`; **return `values` on error** (React resets uncontrolled forms after actions).
- Server components needing "now" for display: `await requestNow()`; never `Date.now()` in render.
- Dynamic routes: anything using `usePathname()`/session must sit inside `<Suspense>`.
- pgTAP: never assume an empty database — scope assertions to the test's own rows (e2e leaves data behind).
- E2E: `createPoolFixture()`, `becomeStaffWithMfa()`, `signSandboxEvent()`, `readLocalEnv()` in `tests/e2e/support/helpers.ts`.

## Do NOT
- Redo Phases 0–3 work. - Add `export const runtime`. - Use `middleware.ts`. - Present sandbox/test payments as real.
- Mark refunds REFUNDED without provider confirmation. - Mix PoolX and Auction ledger accounts. - Claim tests pass without running them.
