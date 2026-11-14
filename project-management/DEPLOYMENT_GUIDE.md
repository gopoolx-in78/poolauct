# Deployment Guide

> Status: **runbooks and server files ready — nothing deployed.** Hosting decided (OD-06): Hostinger KVM VPS + Supabase
> Cloud Mumbai; nothing bought or created yet. Last updated: 2026-11-14.

## Environments
local (Supabase CLI + Docker, sandbox payments) → staging (Hostinger VPS + separate Supabase project, provider test keys) → production (Hostinger VPS + Supabase Cloud Mumbai, live keys only after legal & provider approval).

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

## Payments and scheduled jobs
- Local/test: `PAYMENT_PROVIDER=sandbox` + `SANDBOX_WEBHOOK_SECRET` (32+ random chars). The test checkout page lives at
  `/payments/sandbox/[attemptId]` and is refused when `APP_ENV=production`.
- Webhook URL to register with a real provider: `https://<domain>/api/webhooks/payments/<provider>` (Razorpay adapter pending OD-02).
- Schedule `GET /api/cron/poolx` with header `Authorization: Bearer $CRON_SECRET` every 5 minutes (closes pools past their
  deadline and processes PoolX refunds). Locally you can run it with curl. On the VPS all three jobs run from
  `/etc/cron.d/poolx` via `deploy/cron/poolx-cron.sh` against `127.0.0.1:3000`; Nginx returns 404 for `/api/cron/*`.
- Schedule `GET /api/cron/auctions` every minute (LIVE flip, closing, overdue invoices, deposit refunds, reminders) and
  `GET /api/cron/notifications` every minute (sends queued e-mails), both with `Authorization: Bearer $CRON_SECRET`.
- E-mail: `EMAIL_PROVIDER=none` (default — deliveries are recorded as SKIPPED) or, locally only, `EMAIL_PROVIDER=mailpit` with
  `EMAIL_FROM` and `MAILPIT_URL` (the Mailpit address from `supabase status`). A production provider adapter needs OD-07.
- Generate secrets with `openssl rand -hex 32`; never reuse the same value for `CRON_SECRET` and webhook secrets.

## Creating a pool (staff)
`/admin/poolx/new` → fill details (prices in rupees; times in IST) → **Create draft** → set tiers → **Publish**. Drafts are
editable; tiers and prices freeze on publish. Cancelling refunds every confirmed member in full (reason required, audited).

## Launch-readiness check (Phase 10)
Run against the exact environment a production deploy will use (never commit that file):

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.production scripts/launch-check.mts
```

(`pnpm launch:check` runs the same script with whatever environment the shell has.) Exit code 1 blocks the deploy.
Environment checks: server settings valid, `APP_ENV=production`, live payment provider (OD-02), real e-mail provider (OD-07),
service-role key and `CRON_SECRET` set, site and Supabase URLs on https public hosts, brand name set (OD-01). Database checks
(`api.launch_readiness()`, service role only): deposit policy set by staff through `/admin/auctions/policy` (OD-04), no
`.test` accounts, no sandbox payments, an active Super Admin with a verified authenticator, RLS on every application table,
service-role timeouts. Details are counts only — never e-mails, ids or secrets.

## Backups and restore
- **Hosted (to set up with OD-06):** enable Point-in-Time Recovery on the production Supabase project; keep daily logical
  dumps (`pg_dump -Fc` of `extensions`, `core`, `poolx`, `auction`, `ledger`, `cms`, `api`, `auth` with
  `-e citext -e pgcrypto -e uuid-ossp`) in separate, encrypted storage; back up Storage buckets once media exists (4.8).
- **Restore drill (do before launch and then quarterly):** restore the latest dump into a new, empty project or database;
  compare per-table row counts with the source; check the ledger balances (`sum(debit_paise) = sum(credit_paise)` overall
  and per journal); run `pnpm test:db` against a restored staging copy; record date, duration and result in TESTING_REPORT.
- **Local drill 2026-11-14:** dump → scratch database → 82/82 tables with identical row counts (1,386 rows), ledger net 0
  across 34 journals with 0 unbalanced; only 6 harmless default-privilege errors for Supabase-managed roles. Lesson: a
  per-schema dump must include the extensions (`-e citext …`) or `core.profiles` fails to restore.
- **RPO / RTO:** to be agreed with the owner (proposal: RPO ≤ 5 min with PITR, RTO ≤ 4 h). Not decided — do not publish.

## Hostinger VPS (OD-06, TD-73)
Decided 2026-11-14: the app runs on a **Hostinger KVM VPS** (Ubuntu LTS); the database, auth and storage stay on
**Supabase Cloud, Mumbai (`ap-south-1`)** — one project for staging, one for production. Plan size, price and the Supabase
paid tier still need the owner's approval; nothing has been bought or created yet. Files live in `deploy/`.

Layout on the server: user `poolx` · bare repo `/srv/poolx/repo.git` · releases `/srv/poolx/releases/<time>-<sha>` ·
active release symlink `/srv/poolx/current` · settings `/etc/poolx/poolx.env` (root:poolx, 0640) · app on `127.0.0.1:3000`
behind Nginx.

**One-time server setup** (as root; staging first, then production on its own VPS or at least its own env file and user):
1. Updates and firewall: `apt update && apt upgrade`; `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`
   (port 3000 is never opened — the app only listens on 127.0.0.1). SSH keys only (`PasswordAuthentication no`),
   `unattended-upgrades` on.
2. Packages: Node.js 24 LTS (NodeSource or `nvm` system-wide), `corepack enable` (pnpm 9 from `packageManager`), `git`,
   `nginx`, `certbot python3-certbot-nginx`, `curl`.
3. User and folders: `adduser --system --group --home /srv/poolx --shell /bin/bash poolx`;
   `git init --bare /srv/poolx/repo.git`; `mkdir -p /srv/poolx/releases /etc/poolx`; `chown -R poolx:poolx /srv/poolx`.
   Add the deployer's SSH public key to `/srv/poolx/.ssh/authorized_keys`.
4. Settings: create `/etc/poolx/poolx.env` from `.env.example` with production values (`APP_ENV=production`, Supabase
   URL / anon / service-role keys of the Mumbai project, `CRON_SECRET` and webhook secrets from `openssl rand -hex 32`,
   payment and e-mail provider settings, `NEXT_PUBLIC_SITE_URL=https://<domain>`). Plain `KEY=value` lines, no quotes
   (read by systemd, Node `--env-file` and Next.js). `chown root:poolx` and `chmod 0640`.
5. Service: `cp deploy/systemd/poolx.service /etc/systemd/system/`; `systemctl daemon-reload`; `systemctl enable poolx`.
   Restart permission for deploys: `visudo -cf deploy/sudoers.poolx && install -m 0440 deploy/sudoers.poolx /etc/sudoers.d/poolx`.
6. Nginx + HTTPS: copy `deploy/nginx/poolx.conf` to `/etc/nginx/sites-available/poolx`, replace `__DOMAIN__` (OD-01),
   first get a certificate (`certbot certonly --webroot -w /var/www/certbot -d <domain> -d www.<domain>` with a temporary
   port-80 server, or `certbot certonly --standalone` before Nginx starts), enable the site, `nginx -t`,
   `systemctl reload nginx`. Certbot's timer renews automatically; check with `certbot renew --dry-run`.
7. Cron: `cp deploy/cron/poolx.cron /etc/cron.d/poolx` (root, 0644) after the first successful deploy. Logs:
   `journalctl -t poolx-cron`.

**Each deploy** (from your machine, after CI is green):
1. Database first: `pnpm exec supabase link --project-ref <ref>` then `pnpm exec supabase db push` (staging, test, then
   production). Migrations must work with the release that is still running.
2. Push the code: `git push vps <branch-or-tag>` (remote `vps` = `poolx@<server>:/srv/poolx/repo.git`).
3. Build and switch: `ssh poolx@<server> /srv/poolx/current/deploy/deploy.sh <ref>` (first deploy:
   `git --git-dir=/srv/poolx/repo.git show <ref>:deploy/deploy.sh | bash -s <ref>`). The script exports the commit into a
   new release, installs with the lockfile, builds with `NEXT_DEPLOYMENT_ID=<sha>` (open tabs reload instead of calling
   stale Server Actions), runs `pnpm launch:check` (staging only may pass `--skip-launch-check`), switches the symlink,
   restarts, waits for `/api/health`, and **rolls back automatically** if the new release is unhealthy. It keeps 5
   releases and appends to `/srv/poolx/deployments.log`.
4. A restart drops connections for a few seconds (single server, no blue/green). Deploy outside busy hours and never
   while an auction is about to close.

**Rollback:** `ssh poolx@<server> /srv/poolx/current/deploy/rollback.sh` (previous release) or `rollback.sh <release-dir>`.
Code only — migrations are never rolled back; fix forward.

## Deploy and rollback
1. CI green on the commit (lint, types, format, unit, pgTAP, integration, e2e, audit, gitleaks).
2. Apply new migrations to **staging**, run `pnpm test:db` against it, smoke-test, then run the launch check.
3. Migrations are forward-only and additive; never edit an applied migration. Apply to production before the app deploy.
4. Deploy the app (`deploy/deploy.sh`, see above); it checks `/api/health`; watch error logs
   (`journalctl -u poolx | grep request_error`) for 15 minutes.
5. **Rollback:** `deploy/rollback.sh` switches to the previous release. Database changes are not rolled back — fix forward
   with a new migration. Financial rows are never edited or deleted (use reversals).

## Incidents
- Payments or refunds misbehaving: stop the cron jobs (`mv /etc/cron.d/poolx /root/poolx.cron.disabled`), keep webhooks running (they are idempotent),
  check `/admin/finance/payments` and `/admin/finance/refunds`, then fix forward. Never mark a refund REFUNDED by hand.
- Suspected key leak: rotate the key at the provider / Supabase, update `/etc/poolx/poolx.env`, `systemctl restart poolx`
  (rebuild with `deploy.sh` if a `NEXT_PUBLIC_` value changed), review `core.audit_logs` and
  `core.security_events`.
- Server errors: each one is a JSON line `{"event":"request_error", digest, route, routeType, error, message}` with the
  message redacted (TD-72). The digest matches the reference shown on the user's error page. Next.js also prints its own
  raw error line, so code must never put personal data into error messages (current code throws codes only).

## Production checklist (Phase 10)
- [ ] Domain + DNS (OD-01), HTTPS auto-renew, HSTS
- [ ] Supabase prod project, PITR backups enabled, restore drill completed and recorded (local drill passed 2026-11-14)
- [ ] Storage buckets: `public-media` is created by migration 0017 (check it exists, is public and WebP-only after `db push`); `private-docs` waits for OD-05; back up Storage objects
- [ ] Secrets only in `/etc/poolx/poolx.env` (root:poolx 0640) on the VPS; `APP_ENV=production` (sandbox payments refused)
- [ ] Payment provider live keys + webhook URL + secret; legal fund-flow approval (OD-02/03)
- [ ] pg_cron jobs and host cron jobs enabled; `CRON_SECRET` set
- [ ] Error tracker (OD-08; structured `request_error` logs exist today), uptime monitor on `/api/health`, alert routing
- [ ] WAF/CDN rules, rate limits
- [ ] GA4 + consent mode, Search Console verified, sitemap submitted
- [ ] CI: lint, typecheck, unit, db, e2e, audit, gitleaks must pass before deploy; preview deployments; one-click rollback documented
- [ ] Remove demo data, test accounts — `launch:check` must pass
- [ ] RPO/RTO agreed with owner and documented
