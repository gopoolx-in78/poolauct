# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 6 (Central admin) — built and verified locally.
**Last completed milestone:** central admin — separated PoolX / Auction dashboard, user suspension (sessions ended) and role management, editable permission matrix, seller management, payments / refunds / per-module ledger, audited CSV exports, audit viewer.
**Git:** branch `phase-6-admin` (from `master` at `742819a`) — Phase 6 work may be uncommitted; check `git status` / `git log`. Not merged to `master`. No remote.
**Database changes:** migrations 0001–0012 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 51 · pgTAP 292 · integration 3 (`pnpm test:integration`, needs local stack + `.env.local`) · build · e2e (full suite with `--workers=1`, TD-38) — see TESTING_REPORT.
**Known gaps:** media uploads (no images anywhere yet); inspection/RC staff UI; seller self-listing; seller settlements (OD-03); notifications (Phase 8); acceptance test 20 (Phase 7); Razorpay (OD-02) — no live payments; cron schedule (OD-06); deposit values OD-04, bidder KYC OD-05, forfeiture policy OD-11.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 292/292) → report status.

## Next exact tasks (ask the owner which first)
1. **Phase 7 — Theme & CMS:** theme tokens as validated data (allowlisted keys/values, no raw CSS), draft / publish / versions /
   rollback, homepage sections, banners, nav/footer, FAQ, blog, pages, SEO settings; acceptance test 20 (a theme change cannot
   alter deposit or bid rules) plus XSS / CSS-injection tests.
2. **Media pipeline (shared, 4.8 / 3.11):** Storage buckets `public-media` / `private-docs` with RLS on `storage.objects`,
   `core.media_assets`, signed uploads with magic-byte MIME check, WebP re-encode, required alt text; galleries on auctions and pools.
   Unblocks the KYC verification queue (6.10) and inspection/RC UI (4.9).
3. **Phase 8 — Notifications** (outbox processor, in-app, email adapter; SMS/WhatsApp disabled until configured).

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
- Admin pages: `requireStaff(path, permission)` inside `<Suspense>`; simple forms post to a server action that redirects with
  `?notice=` / `?error=` (`action-kit.ts` `outcome()`, `sqlMessage()`); shared UI in `src/app/admin/admin-kit.tsx`.
- E2E: make any text you assert in shared lists (audit log, tables) unique per run.
- E2E helpers: `becomeStaffWithMfa(page, email, "auction_manager")`, `registerAndConfirm`, `sql()`, `readLocalEnv("CRON_SECRET")`.
- Editing: prefer the Edit tool or a Python script file over shell heredocs containing quotes; files may be CRLF (`core.autocrlf=true`).

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Enable forfeiture without an approved policy and two approvers.
- Present sandbox payments or demo seed values as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
