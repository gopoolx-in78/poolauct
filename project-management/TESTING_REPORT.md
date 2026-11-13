# Testing Report

Last updated: 2026-11-13

## Planned suites
| Suite | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5.1 | `tests/unit` | ✔ active |
| DB / RLS / invariants | pgTAP via `supabase test db` | `supabase/tests` | ✔ active (112 assertions) |
| Integration / API | Webhook/payment integration is covered end-to-end (Playwright `request` against the real route + local DB) and in pgTAP; no separate Vitest integration suite yet | `tests/e2e`, `supabase/tests` | ◐ |
| E2E + a11y + SEO + headers + auth | Playwright 1.65 + @axe-core/playwright 4.14; Mailpit for email links; RFC 6238 TOTP helper for MFA | `tests/e2e` | ✔ active (Chromium desktop 1440 + Pixel 7; auth journeys desktop-only) |
| Security | OWASP ZAP baseline, gitleaks, pnpm audit | CI | audit run locally; gitleaks/ZAP in CI only |
| Performance | Lighthouse CI | CI | not yet |
| Backup | restore drill | DEPLOYMENT_GUIDE | Phase 10 |

## Run log

### 2026-11-13 — Phase 3 (payments core + PoolX)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 7 files, 47 tests — adds pricing mirror (incl. pgTAP-matching examples + property tests), sandbox webhook verification (valid / tampered / wrong secret / stale / missing headers / refund idempotency), PoolX validation (rupees→paise, IST datetimes, admin pool rules, requests), sandbox-secret env rule |
| `pnpm test:db` | ✔ 3 files, 112 assertions — new `0003_payments_poolx.test.sql` (54): staff need aal2 + permission; reference price needs a source; non-monotonic tiers rejected; tiers frozen after publish; drafts invisible; public list/search/category; base vs tier price; anon cannot join; quantity bounds; pending attempt reused (no duplicate charge); user cannot choose provider; amount-mismatch capture not applied; capture confirms; duplicate event no-op; second capture no-op; unknown order; one capture journal; ACTIVE member cannot pay twice; cross-user RLS on members/contributions/ledger; price drops with confirmed members; half-up rounding; ledger balanced; no cross-domain entries; cross-domain journal rejected; unbalanced journal rejected; ledger immutable; withdraw → full refund; claim once; provider-confirmed refund; recording again no-op; one refund journal; no double full refund; late capture → refund; cancel refunds confirmed members; users cannot submit payment events. Isolated from leftover e2e data. |
| `pnpm build` | ✔ 41 routes |
| `playwright test --workers=1` | ✔ **46 passed**, 20 skipped by design (desktop-only journeys on the mobile project), 0 failed. New `poolx.spec.ts` (8): public listing/detail/JSON-LD; join → test checkout → membership + tier price; failed payment → retry (no duplicate membership); webhook forged 400 / stale 400 / valid → confirmed / duplicate → `DUPLICATE` / unknown provider 404 / one journal; withdraw (unconfirmed → error) → cron 401 without secret → refunded; staff create → tiers (bad tiers rejected, input kept) → publish → public page + 3 audit rows; pool request → reviewer approves → note visible; sitemap contains pools/categories. Plus `auth.spec.ts` sign-up rate-limit test. |

Bugs found by these tests and fixed: (1) pool-request price field name mismatch made every request fail validation;
(2) tier editor lost typed values after a validation error (React 19 resets uncontrolled forms after actions) — actions now echo
values; (3) "please confirm" on withdraw rendered as a success notice; (4) header navs used `usePathname()` outside Suspense,
breaking the build for dynamic routes; (5) pool listing passed a non-`pools` row type to `pool_json` (would fail at runtime);
(6) a temp table inside a STABLE function. Environment findings: the full suite registers >10 accounts from one IP, so the app's
own sign-up limiter (10/h) correctly throttled later tests — the helper now resets the local window and a dedicated test proves
the limiter; intermittent 3 s anon statement timeouts / 1.8 s Supabase Auth lookups come from the shared local Docker VM (no lock
waits observed with `log_lock_waits` enabled) — TD-38.

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
