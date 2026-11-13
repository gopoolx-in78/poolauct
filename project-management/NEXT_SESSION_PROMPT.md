# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 2 (Auth & users) complete and verified locally → next: payments core (5a) + Phase 3 (PoolX).
**Last completed milestone:** Phase 2 — accounts, RBAC, staff MFA, account area.
**Last completed task:** Phase 2 docs checkpoint.
**Git:** branch `phase-2-auth`; check `git status` / `git log` — Phase 2 may or may not be committed yet. No remote.
**Files recently modified:** `supabase/migrations/2026111300000{2..5}_*.sql`, `supabase/tests/0002_identity_rbac.test.sql`,
`supabase/config.toml`, `supabase/templates/*`, `src/proxy.ts`, `src/lib/supabase/*`, `src/lib/safe-redirect.ts`,
`src/modules/core/**`, `src/app/(auth)/**`, `src/app/auth/confirm/route.ts`, `src/app/account/**`, `src/app/admin/**`,
`src/components/auth/totp.tsx`, `src/components/layout/user-menu*.tsx`, `tests/**`, `playwright.config.ts`, `.github/workflows/ci.yml`.
**Database changes:** migrations 0001–0005 (see DATABASE_SCHEMA.md "Applied migrations").
**Tests executed:** unit 29/29 ✔ · pgTAP 58/58 ✔ (incl. clean reset) · build ✔ · e2e 37 passed / 11 skipped by design ✔.
**Known bugs:** none open. Known accepted gaps: TD-16 (CSP inline scripts), TD-23 (HTTP 200 + 404 UI under PPR), TD-25.
**Unresolved:** no remote (CI unverified); OD-01…OD-15; phone OTP blocked on OD-07.

## Start-of-session protocol
Read AGENTS.md (Next.js 16: read `node_modules/next/dist/docs/` before unfamiliar APIs), PROJECT_OVERVIEW, CURRENT_STATUS,
PENDING_TASKS, this file → `git status` → start the stack:
`pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db` (expect 58/58)
→ report status.

## Next exact tasks (PENDING_TASKS.md "Phase 3")
1. **5a.1–5a.3 payments core** — payment_attempts, webhook_events, provider_refunds; ledger (accounts/journals/entries with
   balance + domain-isolation triggers); provider interface + `sandbox` adapter (refused in production by env validation);
   signed webhook route with event-id de-duplication. pgTAP + Vitest integration tests (duplicate webhook → one state change).
2. **3.1–3.9 PoolX** per POOLX_REQUIREMENTS.md, using `api.*` RPCs (security definer, `core.require_active_user()`),
   no direct client writes, money in bigint paise, tiers from confirmed contributions only.

## Patterns to follow (established in Phase 2)
- HTTP surface = functions in schema `api` only; grant EXECUTE explicitly; add pgTAP `has_function_privilege` checks.
- Session reads only via `getAccount()/requireAccount()/requireStaff()` (calls `connection()`); render them inside `<Suspense>`.
- Forms: client component + `useActionState` + server action returning `FormState`; zod schemas in `src/modules/*/validation.ts`.
- E2E: scope assertions to `page.getByRole("main")` (Next adds a global `role=alert` announcer); use `uniqueEmail()`,
  `registerAndConfirm()`, `sql()` helpers; auth-heavy specs desktop-only.
- Staff features: gate with `requireStaff(path, permission)`; permission names must exist in `core.permissions`.

## Acceptance criteria for Phase 3 (+5a)
Duplicate webhook delivery causes exactly one state change; a pool's displayed price/tier equals the SQL-computed price from
confirmed contributions; a user cannot join the same pool twice or read another user's contributions; ledger journals always
balance and never mix poolx/auction accounts; all prior checks stay green.

## Do NOT
- Redo Phases 0–2. - Add `export const runtime`. - Use `middleware.ts`. - Read cookies outside Suspense.
- Invent brand/legal/fee/deposit values. - Present demo data as live. - Let the sandbox provider run in production.
- Claim tests pass without running them.
