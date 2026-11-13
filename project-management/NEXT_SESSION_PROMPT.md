# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 3 (PoolX) — full lifecycle done. **Next: Phase 4 + 5 (Auctions with the mandatory deposit & refund engine)**, starting with a shared media-upload pipeline (also closes PoolX 3.11 images).
**Last completed milestone:** PoolX end to end — join/pay (sandbox) → close → negotiate → lock (price-adjustment refunds) → orders → ship → deliver/dispute → complete.
**Git:** branch `phase-3-poolx` — `16ca7af` committed; 3.7 lifecycle may be uncommitted — check `git status`/`git log`. Not merged to `master`. No remote.
**Database changes:** migrations 0001–0009 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 47 ✔ · pgTAP 148 ✔ · build ✔ · e2e 47 passed / 21 skipped by design / 0 failed (run full suite with `--workers=1` locally, TD-38).
**Known gaps:** Razorpay adapter (OD-02) — no live payments; seller payouts; notifications (Phase 8); private pools; seller-verification UI; cron schedule (OD-06).

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 148/148) → report status.

## Next exact tasks
1. **Media pipeline (shared):** Supabase Storage buckets `public-media` (images, public read) and `private-docs` (KYC/RC/inspection,
   owner + permitted staff via RLS on `storage.objects`); `core.media_assets` table; signed upload route that checks MIME by magic
   bytes, size limits, re-encodes images (sharp) to WebP with width/height; alt text required. Use it for PoolX pool images (3.11).
2. **Phase 4/5 Auctions** per AUCTION_REQUIREMENTS.md and AUCTION_DEPOSIT_RULES.md, reusing payments core:
   - Migrations: auction categories/sellers/assets/vehicle_details (reg number encrypted + masked)/media/inspection reports;
     `auction.auctions` with `deposit_amount_paise NOT NULL CHECK (> 0)` + publish trigger enforcing global min (system setting
     with CHECK > 0) — **no disable switch**; participants; deposits (14-state machine, transition function + history table);
     bids (`api.auction_place_bid` with row lock, 10 validation rules, idempotency key, anti-snipe); results (unique per auction);
     invoices; deposit adjustments (unique deposit + invoice); auction refunds; default reviews (FORFEITED blocked until policy).
   - Payments: purposes `AUCTION_DEPOSIT`, `AUCTION_PURCHASE` in `api.payments_process_event` → `auction.on_deposit_captured`.
   - Ledger: `auction:*` accounts only (never poolx).
   - Closing: `api.auction_close_due` (FOR UPDATE SKIP LOCKED, idempotent winner selection) + `/api/cron/auctions`.
   - **All 20 acceptance tests in AUCTION_REQUIREMENTS.md must be automated** (pgTAP + Playwright), including concurrent bids
     (parallel connections) and the theme-change test once Phase 7 exists.

## Patterns to follow (learned in Phases 2–3)
- HTTP surface = `api.*` functions only; explicit grants; pgTAP `has_function_privilege` checks.
- **Integrity/constraint trigger functions must be SECURITY DEFINER** (deferred triggers run as the committing user under RLS — TD-40).
  Add a pgTAP check that fires deferred constraints *as a non-privileged role* (`set constraints … immediate`, then restore `deferred`).
- Postgres regex repetition counts max 255; use length checks separately.
- Errors: `raise exception 'CODE: text' using errcode = 'P0001'`; map in the module's error-message function.
- Forms: `useActionState`; return `values` on error (React resets forms after actions).
- Display time via `await requestNow()`; anything using `usePathname()`/session inside `<Suspense>`.
- pgTAP: scope assertions to the test's own rows (e2e leaves data behind); watch `sum()` returning numeric.
- E2E helpers: `createPoolFixture({ sellerName })`, `becomeStaffWithMfa()`, `signSandboxEvent()`, `readLocalEnv()`, `sql()`.
- When editing files from `node -e`, avoid `$$` in replacement strings (JS `replace` turns `$$` into `$`) — use the Edit tool.

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Present sandbox payments as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
