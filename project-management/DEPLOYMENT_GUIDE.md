# Deployment Guide

> Status: **planned — nothing deployed.** Hosting choice pending (OD-06). Last updated: 2026-11-13.

## Environments
local (Supabase CLI + Docker, sandbox payments) → staging (separate Supabase project, provider test keys) → production (Supabase Cloud Mumbai, live keys only after legal & provider approval).

## Local setup
1. Install Node 24+, pnpm 9+, Docker Desktop.
2. `pnpm install`
3. Start Supabase. This project uses ports **563xx** (API `http://127.0.0.1:56321`, DB `56322`, Mailpit `http://127.0.0.1:56324`)
   so it can run alongside other local Supabase projects. Lean start (keeps Mailpit for auth emails):
   `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime`.
   Docker Desktop needs several GB free on the drive holding its disk image.
4. Create `.env.local` (gitignored) from `pnpm exec supabase status -o env` (ANON_KEY, API_URL, SERVICE_ROLE_KEY, DB_URL) —
   see the CI workflow step "Write .env.local" for the exact mapping.
5. `pnpm db:reset` (applies migrations + dev seed), then `pnpm test:db`.
6. `pnpm dev` → http://localhost:3000. Sign-up emails arrive in Mailpit (http://127.0.0.1:56324).
7. Tests: `pnpm test`, `pnpm test:db`, `pnpm build && pnpm test:e2e`.

## Bootstrapping the first staff account
Roles are granted only by an operator from SQL (no HTTP path exists until the Phase 6 role UI):
1. The person signs up and confirms their email normally.
2. Operator runs (local: `docker exec -it supabase_db_poolx psql -U postgres`; hosted: Supabase SQL editor):
   `select core.operator_grant_role('person@example.com', 'super_admin', 'initial platform owner');`
   This is written to `core.audit_logs` as a system action.
3. On next visit to `/admin` they must enrol an authenticator app (TOTP); staff permissions only work in MFA sessions.

## Hosted Supabase auth settings (must mirror `supabase/config.toml`)
`config.toml` only configures the local stack. For staging/production set in the dashboard:
email confirmations **on**; minimum password length **10** with lower/upper/digits; secure password change **on**; require
current password **on**; TOTP MFA enroll/verify **on**; Site URL + redirect allow-list = the real domain(s); email templates
from `supabase/templates/` (confirmation, recovery, email change); exposed API schemas `public, graphql_public, api`;
custom SMTP provider (OD-07) with sensible send limits.

## Production checklist (Phase 10)
- [ ] Domain + DNS (OD-01), HTTPS auto-renew, HSTS
- [ ] Supabase prod project, PITR backups enabled, restore drill completed and recorded
- [ ] Storage buckets: `public-media`, `private-docs` (RLS), backups of storage
- [ ] Secrets in host secret manager; `APP_ENV=production` (sandbox payments refused)
- [ ] Payment provider live keys + webhook URL + secret; legal fund-flow approval (OD-02/03)
- [ ] pg_cron jobs and host cron jobs enabled; `CRON_SECRET` set
- [ ] Sentry DSN, uptime monitor, alert routing
- [ ] WAF/CDN rules, rate limits
- [ ] GA4 + consent mode, Search Console verified, sitemap submitted
- [ ] CI: lint, typecheck, unit, db, e2e, audit, gitleaks must pass before deploy; preview deployments; one-click rollback documented
- [ ] Remove demo data, test accounts
- [ ] RPO/RTO agreed with owner and documented
