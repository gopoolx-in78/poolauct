# Deployment Guide

> Status: **planned — nothing deployed.** Hosting choice pending (OD-06). Last updated: 2026-11-13.

## Environments
local (Supabase CLI + Docker, sandbox payments) → staging (separate Supabase project, provider test keys) → production (Supabase Cloud Mumbai, live keys only after legal & provider approval).

## Local setup (will be valid after Phase 1)
1. Install Node 24+, pnpm 9+, Docker Desktop.
2. `pnpm install`
3. `cp .env.example .env.local` and fill local values printed by `pnpm supabase start`.
   This project uses ports **563xx** (API `http://127.0.0.1:56321`, DB `56322`) so it can run alongside other local
   Supabase projects. Lean start: `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit`.
   Docker Desktop needs several GB free on the drive holding its disk image.
4. `pnpm db:reset` (applies migrations + dev seed), then `pnpm test:db`.
5. `pnpm dev` → http://localhost:3000
6. Tests: `pnpm test`, `pnpm test:db`, `pnpm test:e2e`.

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
