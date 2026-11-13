# Testing Report

Last updated: 2026-11-13

## Planned suites
| Suite | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5.1 | `tests/unit` | ✔ active |
| DB / RLS / invariants | pgTAP via `supabase test db` | `supabase/tests` | ✔ active (58 assertions) |
| Integration / API | Vitest + local Supabase + sandbox provider | `tests/integration` | from Phase 3/5a (payments) |
| E2E + a11y + SEO + headers + auth | Playwright 1.65 + @axe-core/playwright 4.14; Mailpit for email links; RFC 6238 TOTP helper for MFA | `tests/e2e` | ✔ active (Chromium desktop 1440 + Pixel 7; auth journeys desktop-only) |
| Security | OWASP ZAP baseline, gitleaks, pnpm audit | CI | audit run locally; gitleaks/ZAP in CI only |
| Performance | Lighthouse CI | CI | not yet |
| Backup | restore drill | DEPLOYMENT_GUIDE | Phase 10 |

## Run log

### 2026-11-13 — Phase 2 (auth & users)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 4 files, 29 tests — adds `safe-redirect.test.ts` (open-redirect vectors) and `validation.test.ts` (password policy, sign-up, profile, TOTP) |
| `pnpm test:db` | ✔ 2 files, 58 assertions — sign-up trigger; matrix seed (super_admin has all, admin lacks roles.manage / manual refunds, no disable/bypass permission, customers hold no admin perms); profiles/user_roles/roles RLS for own vs other user; INSERT/UPDATE/DELETE denied to end users; staff permissions only at aal2; account API; sessions (cross-user revoke denied, current session protected); deletion request; audit log private + append-only; api execute privileges; api schema has no tables. Re-run after clean `db reset` ✔ |
| `pnpm build` | ✔ 30 routes; public pages Partial Prerender (static shell + streamed user menu) |
| `pnpm test:e2e` | ✔ 37 passed, 11 skipped (auth on mobile by design). Auth journeys: sign-up requires confirmation; confirmation link single-use; no enumeration on duplicate sign-up; inline validation keeps values; generic wrong-password error; protected redirect + return; `next=//evil.example` ignored; profile persists; sign-out; password reset via email, old password rejected; non-staff → 404 UI with no admin content; staff MFA enrol (bad code rejected, good code → /admin), new session must step up; role grant audited; deletion request/cancel; auth pages noindex |

Issues found and fixed during the run: (1) migration 0005 not yet applied → rate limiter failed closed (correct behaviour) → applied; (2) `Date.now()` during App-Shell prerender of session-reading routes → `connection()` in the DAL (TD-27); (3) non-staff `/admin` returns HTTP 200 under PPR → documented (TD-23), test asserts no content leak; (4) parallel e2e starved the small local Docker VM → 3 local workers, raised timeouts.

### 2026-11-13 — Phase 1 (Windows 11, Node 24.15, pnpm 9.15)
| Command | Result |
|---|---|
| `pnpm lint` | ✔ 0 problems |
| `pnpm typecheck` | ✔ |
| `pnpm test` | ✔ 2 files, 11 tests (money formatting/rounding incl. property tests; env validation) |
| `pnpm build` | ✔ 17 routes; all public pages static; `/api/health` dynamic |
| `pnpm test:e2e` | ✔ 26/26 — per page: HTTP 200, single h1, title, description ≥50 chars, canonical, axe (WCAG 2.0/2.1/2.2 A+AA) no serious/critical, no horizontal overflow; unique titles; 320px overflow; main nav (desktop + mobile drawer); module entry points; security headers; 404; robots/sitemap/manifest/health/icon |
| `pnpm format:check` | ✔ |
| `pnpm audit --audit-level high` | ✔ pass — 1 moderate (`minimatch` ReDoS via eslint-config-next, dev-only) |
| `pnpm test:db` | ✖ not run at first — Docker Desktop not running (see re-run below) |

### 2026-11-13 — Phase 1 database verification
| Command | Result |
|---|---|
| `supabase start -x …` (ports 563xx) | ✔ stack healthy (db, auth, rest, realtime, storage, kong, pg_meta) |
| `supabase db reset` | ✔ migration `20261113000001` applied, seed applied |
| `pnpm test:db` | ✔ 1 file, 12/12 — schemas exist; anon/authenticated have no usage on core/auction/ledger; service_role usage; helper functions exist. (First attempt hit a connection race right after reset; passed on immediate retry.) |
| `GET /api/health` (prod build, local stack) | ✔ `{"status":"ok","checks":{"app":"ok","database":"ok"}}` 200 |
| `pnpm test:e2e` (rebuilt with `.env.local`) | ✔ 26/26 |
| CSP `connect-src` | ✔ includes the local Supabase API origin only |

Environment issues met: Docker engine crashed during the first image pull (C: had ~12 GB free); default Supabase ports were taken by other local projects → moved to 563xx.

Fixed during run: canonical assertion expected a trailing slash on `/` (Next emits origin without it) — test corrected; `/api/health` was being prerendered statically — fixed with `connection()`.

## Known gaps
No Firefox/WebKit runs yet; no Lighthouse numbers; no visual screenshot review.
