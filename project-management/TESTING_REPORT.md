# Testing Report

Last updated: 2026-11-13

## Planned suites
| Suite | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5.1 | `tests/unit` | ✔ active |
| DB / RLS / invariants | pgTAP via `supabase test db` | `supabase/tests` | written, **not yet run** (Docker) |
| Integration / API | Vitest + local Supabase + sandbox provider | `tests/integration` | from Phase 2 |
| E2E + a11y + SEO + headers | Playwright 1.65 + @axe-core/playwright 4.14 | `tests/e2e` | ✔ active (Chromium desktop 1440 + Pixel 7) |
| Security | OWASP ZAP baseline, gitleaks, pnpm audit | CI | audit run locally; gitleaks/ZAP in CI only |
| Performance | Lighthouse CI | CI | not yet |
| Backup | restore drill | DEPLOYMENT_GUIDE | Phase 10 |

## Run log

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
