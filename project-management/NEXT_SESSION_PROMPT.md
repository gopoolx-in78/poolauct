# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phases 4–5 (Auctions + deposit & refund engine) — core built and verified locally.
**Last completed milestone:** auction end to end — staff publish (deposit frozen) → sandbox deposit → bid / outbid → cron close → loser refunded in full (provider-confirmed) → winner invoice with deposit credited once → paid.
**Git:** branch `phase-4-auctions` — Phase 4–5 work may be uncommitted; check `git status` / `git log`. Not merged to `master`. No remote.
**Database changes:** migrations 0001–0011 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 47 · pgTAP 238 · integration 3 (`pnpm test:integration`, needs local stack + `.env.local`) · build · e2e (full suite with `--workers=1`, TD-38) — see TESTING_REPORT.
**Known gaps:** media uploads (no images anywhere yet); inspection/RC staff UI; seller self-listing; notifications (Phase 8); acceptance test 20 (Phase 7); Razorpay (OD-02) — no live payments; cron schedule (OD-06); deposit values OD-04, bidder KYC OD-05, forfeiture policy OD-11.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 238/238) → report status.

## Next exact tasks (ask the owner which first)
1. **Media pipeline (shared, 4.8 / 3.11):** Supabase Storage buckets `public-media` (images, public read) and `private-docs`
   (KYC/RC/inspection PDFs; owner + permitted staff via RLS on `storage.objects`); `core.media_assets`; signed upload route that
   checks MIME by magic bytes and size, re-encodes images to WebP (sharp) with width/height; alt text required. Attach to auction
   assets and PoolX pools; show galleries on detail pages and cards.
2. **Inspection report + RC verification UI (4.9)** in `/admin/auctions/[id]` (tables already exist).
3. **Phase 6 (admin & finance):** role management UI, seller management/verification, settlements for `*:seller_payable`,
   ledger views and exports — see PROJECT_ROADMAP.md.

## Patterns to follow
- HTTP surface = `api.*` functions only; explicit grants; pgTAP permission checks (`set local role anon` for anon assertions).
- Integrity/constraint trigger functions are SECURITY DEFINER (TD-40). Same-event triggers fire alphabetically — name guards so
  the state-machine check runs first (`deposits_zz_guard_forfeit`).
- Errors: `raise exception 'CODE: text' using errcode = 'P0001'`; map in the module's error-message function.
- Forms: `useActionState`; return `values` on error. Server-action files (`"use server"`) export async functions only — keep
  shared constants (e.g. `LISTING_FIELDS`) in a module file.
- Display time via `await requestNow()`; session / `usePathname()` reads inside `<Suspense>`.
- pgTAP: scope assertions to the test's own rows; tests that need a "clean" setting may disable its no-delete trigger inside the
  rolled-back transaction.
- E2E helpers: `becomeStaffWithMfa(page, email, "auction_manager")`, `registerAndConfirm`, `sql()`, `readLocalEnv("CRON_SECRET")`.
- Editing: prefer the Edit tool or a Python script file over shell heredocs containing quotes; files may be CRLF (`core.autocrlf=true`).

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Enable forfeiture without an approved policy and two approvers.
- Present sandbox payments or demo seed values as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
