# Current Status

**Date:** 2026-11-13
**Phase:** 2 — Authentication & users (**complete and verified locally**; phone OTP deferred to OD-07)
**Git:** branch `phase-2-auth` (from `master` @ `b5e73c4`); Phase 2 work **not committed yet**. No remote.

## What exists and is verified
### Phase 1 (unchanged)
Next.js 16.4.6 app (Cache Components), design tokens, layout shell, six public pages, error pages, `/api/health`, SEO routes,
security headers, env validation, money utils. See git history / CHANGELOG.

### Phase 2
- **Database** (migrations 0002–0005): profiles (auto-created on sign-up), 11 roles, 35 permissions seeded from
  ADMIN_PERMISSION_MATRIX.md, user_roles, `core.has_permission()` (staff permissions only at aal2), append-only audit log,
  security events, verifications table, Postgres rate limiter, account API in the `api` schema (only HTTP-exposed schema).
- **Auth flows**: register (email confirmation required, no enumeration), sign in (rate-limited, generic errors), sign out,
  email-link confirmation via `/auth/confirm` (token_hash, single-use), forgot/reset password (signs out other sessions),
  email change (double-confirmed).
- **Account area** (`/account`, `/profile`, `/security`, `/sessions`, `/delete`): profile edit, TOTP enrolment/verification,
  session list + revoke + sign out others, deletion request/cancel.
- **Staff**: `/admin` requires staff role + aal2 + `admin.dashboard.view`; `/admin/mfa` enrol/verify; non-staff see 404 UI.
- **Header user menu** (only sections that exist), streamed behind Suspense.
- **Proxy** (`src/proxy.ts`): session refresh + optimistic redirect for `/account`, `/admin`, `/seller`.
- **Local auth config** (`supabase/config.toml`): confirmations on, password ≥10 with upper/lower/digit, secure password change,
  TOTP on, custom email templates, `api` schema exposed, mailpit enabled.

## Verification results (local, 2026-11-13)
`pnpm lint` ✔ · `pnpm typecheck` ✔ · `pnpm format:check` ✔ · `pnpm test` ✔ 29/29 · `pnpm test:db` ✔ 58/58 (also after a clean
`db reset`) · `pnpm build` ✔ · `pnpm test:e2e` ✔ 37 passed, 11 skipped (auth journeys run on desktop only, by design).

## Not verified / known gaps
- CI workflow updated but never run (no remote).
- Phone OTP verification not built (needs SMS provider, OD-07).
- In-place password change needs a reauthentication UI — currently via emailed reset link (TD-25).
- Protected pages return HTTP 200 with 404 UI under PPR (TD-23) — no data leak, documented.
- CSP still `'unsafe-inline'` for scripts (TD-16) — revisit before launch.
- Hosted Supabase auth settings must mirror `config.toml` (DEPLOYMENT_GUIDE) — not applicable until staging exists.
- Lighthouse not measured; no visual screenshot review.
- Local Docker VM is small (3.8 GB, ~49 containers across projects): Playwright limited to 3 workers.
