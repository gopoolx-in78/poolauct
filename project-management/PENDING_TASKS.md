# Pending Tasks

## Open owner decisions
OD-01 … OD-15 (DECISION_LOG.md). None block Phase 2.

## Phase 1 leftovers
- [x] 1.4b DB verified: migration 0001 applied, pgTAP 12/12, health reports database ok
- [ ] 1.13b First commit + push to a private remote so CI runs (owner to provide/approve remote)
- [ ] 1.15 Lighthouse baseline (LCP/INP/CLS) on production build; record in TESTING_REPORT
- [ ] 1.16 Visual review of pages in light/dark at 320/768/1440
- [ ] Toast, Tabs, Table, Pagination primitives — build when first used (Phase 2/3) rather than as unused code

## Phase 2 — Auth & users (next)
- [ ] 2.1 `@supabase/ssr` clients (browser, server, service-role `server-only`), `src/proxy.ts` for session refresh
- [ ] 2.2 Migration 0002: profiles, roles, permissions, role_permissions, user_roles, `core.has_permission()`, `core.is_staff()`; seed roles/permissions from ADMIN_PERMISSION_MATRIX.md
- [ ] 2.3 Migration 0003/0004: verifications, security_events, audit_logs (append-only), notifications skeleton
- [ ] 2.4 RLS policies (separate SELECT/INSERT/UPDATE/DELETE) + pgTAP cross-user tests
- [ ] 2.5 Register / login / logout / email verification / forgot + reset password / auth callback route
- [ ] 2.6 Phone OTP verification (provider pending OD-07 — local uses Supabase test OTP)
- [ ] 2.7 Account area shell (`/account/*`, noindex) with user menu items from §4; profile edit; sessions list/revoke; deletion request
- [ ] 2.8 Staff TOTP enrolment + AAL2 gate for `/admin/*`; admin shell
- [ ] 2.9 Rate limiting (Postgres token bucket) on auth + mutations; Origin checks on route handlers
- [ ] 2.10 Revisit CSP for dynamic private areas (TD-16)
- [ ] 2.11 Tests: unit, pgTAP RLS, Playwright auth journeys

## Later phases
See PROJECT_ROADMAP.md phases 3–10.
