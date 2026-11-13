# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 1 complete and verified locally (incl. DB) → Phase 2 (Auth & users).
**Last completed milestone:** Phase 1 foundation (lint/typecheck/unit/build/e2e all green).
**Last completed task:** Docs checkpoint after Phase 1.
**Files recently modified:** `src/**`, `tests/**`, `supabase/config.toml`, `supabase/migrations/20261113000001_core_extensions_and_schemas.sql`, `supabase/tests/0001_schemas.test.sql`, `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`, project-management docs.
**Database changes:** migration 0001 (schemas core/poolx/auction/ledger/cms, default-privilege lockdown, helper trigger functions) — applied locally, pgTAP 12/12 ✔.
**Tests executed:** unit 11/11 ✔, e2e 26/26 ✔, build ✔, pgTAP 12/12 ✔, health reports database ok.
**Known bugs:** none.
**Unresolved:** no commits/remote (CI unverified); Lighthouse not measured; OD-01…OD-15.

## Start-of-session protocol
Read AGENTS.md (note the Next.js 16 block: read `node_modules/next/dist/docs/` before using unfamiliar APIs), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file → `git status` → report status.

## Next exact tasks
1. Start the local stack on this project's ports (563xx; other local Supabase projects use the defaults): `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit`, then `pnpm test:db` (expect 12/12). `.env.local` already exists (gitignored); regenerate from `supabase status -o env` if keys change.
2. Phase 2 tasks 2.1–2.11 (PENDING_TASKS.md). Before writing auth code read
   `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` and the Proxy docs —
   with Cache Components, request-time APIs (`cookies()`, `headers()`) must sit under `<Suspense>` or behind `connection()`.
3. Permissions seed must mirror ADMIN_PERMISSION_MATRIX.md exactly.

## Acceptance criteria for Phase 2
Users can register, verify email, log in/out, reset password, edit profile, view/revoke sessions; staff routes require AAL2 TOTP;
pgTAP proves each RLS policy (SELECT/INSERT/UPDATE/DELETE) for own vs other user vs staff; audit_logs reject UPDATE/DELETE;
Playwright auth journeys pass; all Phase 1 checks still green.

## Do NOT
- Redo Phase 0/1 work. - Add `export const runtime` (unsupported with Cache Components). - Use `middleware.ts` (renamed `proxy.ts`).
- Invent brand/legal/fee/deposit values. - Use localStorage for business data. - Add a deposit on/off switch.
- Claim DB tests pass without running them.
