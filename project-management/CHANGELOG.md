# Changelog

## 2026-11-13 — Session 1 (Phase 6: central admin) — branch `phase-6-admin`
- Migration 0012: `has_permission` checks profile status; suspension columns + CHECK; `user_roles.revoke_reason`; new security
  event kinds; `ledger.account_balance`; `api.admin_metrics`, `admin_list_users`, `admin_get_user`, `admin_set_user_status`,
  `admin_revoke_user_sessions`, `admin_list_roles`, `admin_grant_role`, `admin_revoke_role`, `admin_set_role_permission`,
  `admin_list_sellers`, `admin_set_seller_status`, `admin_list_payments`, `admin_list_refunds`, `admin_ledger_overview`,
  `admin_export`, `admin_list_audit`.
- Pages: `/admin` (rewritten), `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/sellers`,
  `/admin/finance/{payments,refunds,ledger,exports}`, `/admin/audit`; route `/admin/finance/exports/csv`; shared
  `admin-kit.tsx` / `action-kit.ts`; `src/lib/csv.ts`.
- Tests: pgTAP `0006_admin_central.test.sql` (54); unit `csv.test.ts` (4); Playwright `admin.spec.ts` (3).
- Fixes found by tests: last-Super-Admin guard counted the target user; empty CSV exports had no header row; dashboard nav
  headings duplicated section headings; audit e2e matched rows from earlier runs.

## 2026-11-13 — Session 1 (Phases 4–5: auctions, deposits, refunds) — branch `phase-4-auctions`
- Migrations 0010–0011: deposit policy settings (no switch, no default), auction catalogue, auctions with mandatory frozen
  deposits, deposit state machine + history, bids (trigger + row-locked API, idempotent, anti-snipe), results, invoices,
  deposit adjustments, full-amount refunds, default reviews (forfeit blocked); payment routing for AUCTION_DEPOSIT /
  AUCTION_PURCHASE; refund engine; idempotent closing; public, member and admin API; reserved slugs.
- Pages: `/auctions` (live data), `/auctions/browse`, `/auctions/category/[slug]`, `/auctions/sell`, `/auctions/[slug]`,
  `/account/auctions`, `/admin/auctions` (+ new, [id], deposits, defaults, policy); `/api/cron/auctions`; sitemap entries;
  sandbox checkout handles auction deposits and invoices.
- Tests: pgTAP `0005_auction_acceptance.test.sql` (90); Vitest integration suite `tests/integration` (concurrent bidding) +
  CI step; Playwright `auction.spec.ts` (full journey).
- Fixes found by tests: forfeit guard fired before the transition check (trigger renamed to sort later); refund claim returned
  rows claimed by other runs; PoolX duplicate-refund test picked an arbitrary row; bid history needed the anon client.

## 2026-11-13 — Session 1 (Phase 3.7: PoolX lifecycle) — branch `phase-3-poolx`
- Migration 0009: final price/lock columns; negotiations (append-only), orders, shipments, disputes; lock with price-adjustment
  refunds and seller-payable/fee journals; shipping, delivery confirmation, disputes, auto-completion; member activity and
  public pool JSON extended; integrity triggers switched to SECURITY DEFINER (TD-40).
- Admin: Fulfilment section on `/admin/poolx/[id]` (close joining, negotiation log/form, lock, ship / mark delivered per order),
  `/admin/poolx/disputes`; dashboard link. Member: order panel in `/account/poolx` (tracking, confirm delivery, report a problem).
- Public pool page shows "Deal locked at …".
- Tests: pgTAP `0004_poolx_lifecycle.test.sql` (36); Playwright `poolx-lifecycle.spec.ts` (full journey).
- Fixes found by tests: tracking-URL CHECK used a regex repetition count above Postgres' 255 limit; deferred ledger/refund
  integrity triggers ran under RLS at COMMIT (false "unbalanced" when staff locked a pool); members could be under-charged if
  withdrawals dropped the tier (orders now capped at the price paid); admin fallback error message clarified.

## 2026-11-13 — Session 1 (Phase 3: payments core + PoolX) — branch `phase-3-poolx`
- Migrations 0006–0008: payment attempts / webhook events / provider refunds; double-entry ledger with balance,
  insert-only and domain-isolation triggers; PoolX schema (categories, sellers, pools, tiers, requests, members,
  contributions, refunds); PoolX business logic and HTTP API; payment-event orchestration.
- `src/modules/payments`: provider interface, sandbox provider (signed webhooks, test only), registry, webhook processing.
- `src/modules/poolx`: pricing mirror, types, validation, public queries, refund worker.
- Routes: `/api/webhooks/payments/[provider]`, `/api/cron/poolx`; pages: `/poolx` (live data), `/poolx/pools`,
  `/poolx/pools/[slug]`, `/poolx/categories/[slug]`, `/poolx/request`, `/payments/sandbox/[attemptId]`, `/account/poolx`,
  `/admin/poolx` (+ new, [id], requests). Dynamic sitemap entries.
- Header navs wrapped in Suspense (usePathname on dynamic routes); `requestNow()` display-time helper.
- Env: `SANDBOX_WEBHOOK_SECRET` (required for sandbox), `CRON_SECRET` used; CI generates both.
- Tests: pgTAP `0003_payments_poolx.test.sql` (54); unit pricing/sandbox/validation; Playwright `poolx.spec.ts` (8).
- Fixes found by tests: request form price field name mismatch; tier editor lost input after an error (React form reset);
  withdraw-without-confirmation showed as success; JSON-LD test; pgTAP isolation from e2e data.

## 2026-11-13 — Session 1 (Phase 2: authentication & users) — branch `phase-2-auth`
- Migrations 0002–0005: profiles, RBAC + permission matrix seed, append-only audit log, security events, verifications,
  rate limiter, `api` schema with account RPCs and service-role-only helpers.
- pgTAP: `supabase/tests/0002_identity_rbac.test.sql` (46 assertions).
- `@supabase/ssr` 0.12.7 + `@supabase/supabase-js` 2.119.0; server and service-role clients; `src/proxy.ts`.
- Auth pages and server actions (register, sign in/out, confirm, forgot/reset, email change); `/auth/confirm` route.
- Account area (overview, profile, security + TOTP, sessions, deletion) and header user menu.
- Staff admin shell `/admin` + `/admin/mfa` with aal2 gate.
- `supabase/config.toml`: stricter auth settings, email templates (`supabase/templates/`), `api` schema exposed.
- Tests: unit (safe redirects, validation), Playwright auth journeys with Mailpit + TOTP helpers, global setup.
- Playwright: 3 local workers, 60 s test / 15 s expect timeouts. CI split into static + integration jobs.

## 2026-11-13 — Session 1 (Phase 1: database verification)
- Moved this project's local Supabase ports from 543xx to 563xx (`supabase/config.toml`, `.env.example`) to avoid clashing with other local Supabase projects.
- Applied migration 0001 locally; pgTAP 12/12 pass. Generated gitignored `.env.local` from the local stack.

## 2026-11-13 — Session 1 (Phase 1: foundation)
- Scaffolded Next.js 16.4.6 / React 19.3 / TypeScript 5.9 / Tailwind 4.3 with pnpm; strict TS (`noUncheckedIndexedAccess`), target ES2022.
- Added design tokens, fonts, layout shell, six public pages, error pages, health endpoint, SEO metadata routes, icons, OG image.
- Added security headers/CSP (`next.config.ts`), env validation (`src/lib/env.ts`, `env.server.ts`), money utils (`src/lib/money.ts`).
- Added Supabase CLI config + migration `20261113000001_core_extensions_and_schemas.sql` + pgTAP test (not yet executed).
- Added Vitest, Playwright + axe tests, Prettier, GitHub Actions CI, `.claude/launch.json`.
- Removed scaffold placeholder assets (Next/Vercel SVGs, default favicon).

## 2026-11-13 — Session 1 (Phase 0: discovery)
- Added `/project-management/` continuity documentation (24 files), `AGENTS.md`, `README.md`, `.env.example`, `.gitignore`.
- Initialised local Git repository (no commits yet).
- No application code, migrations or dependencies added.
