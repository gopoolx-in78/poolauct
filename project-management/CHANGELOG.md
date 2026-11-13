# Changelog

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
