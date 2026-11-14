# Changelog

## 2026-11-14 — Session 1 (Phase 10: header unread badge) — branch `phase-10-unread-badge`
- Header bell link to the inbox with an unread badge (8.11): `NotificationsLink` (client) gets the first count from the
  server (`api.notifications_unread_count`) and re-reads `GET /api/notifications/unread` on navigation and tab focus,
  because the root layout is not re-rendered on client navigation.
- Tests: `notifications.spec.ts` checks the badge, its clearing after "Mark all as read" and the 401 for signed-out callers.

## 2026-11-14 — Session 1 (Phase 10: blog covers) — branch `phase-10-cms-covers`
- Migration 0018: `cms.document_covers`, `api.cms_admin_cover_{set,remove,get}`, public document functions return `cover`;
  pgTAP `0012_cms_covers.test.sql` (16).
- `POST /api/media` target `cms`; `removeCoverAction`; `CoverManager` on the admin content page (reusable `UploadForm`).
- Post / page hero image, JSON-LD `image`, Open Graph + Twitter large image (`pageMetadata` `image`); blog list thumbnails.
- Tests: third `media.spec.ts` journey (set, replace, remove cover; old files gone; post, og:image and blog list).

## 2026-11-14 — Session 1 (Phase 10: media pipeline) — branch `phase-10-media`
- Migration 0017: `public-media` bucket, `core.media_assets`, `auction.asset_media`, `poolx.pool_media`, staff and public media
  functions; pgTAP `0011_media.test.sql` (38).
- `POST /api/media` (re-encode with sharp, two WebP sizes), `src/modules/core/media.ts`, `src/modules/core/server/media.ts`,
  `src/lib/http.ts` (capped body reader shared with the payment webhook, same-origin check); `sharp` added as a direct dependency.
- Staff photo manager on the admin auction and pool pages; galleries on public auction / pool pages; card covers.
- Nginx: `/api/media` accepts up to 11 MB (everything else stays at 2 MB).
- Tests: `tests/unit/media.test.ts` (8), `tests/e2e/media.spec.ts` (2).

## 2026-11-14 — Session 1 (Phase 10: deployment & launch, part 2) — branch `phase-10-launch`
- Hosting decided (OD-06): Hostinger KVM VPS + Supabase Cloud Mumbai (TD-73).
- `deploy/`: Nginx site (`nginx/poolx.conf`), hardened systemd unit (`systemd/poolx.service`), cron job runner + schedule
  (`cron/poolx-cron.sh`, `cron/poolx.cron`), `deploy.sh` (release dirs, build, launch check, health-checked switch with
  automatic rollback), `rollback.sh`, `sudoers.poolx`; `.gitattributes` keeps these files LF.
- DEPLOYMENT_GUIDE: Hostinger VPS setup, deploy and rollback runbook; Vercel references replaced.

## 2026-11-14 — Session 1 (Phase 10: deployment & launch, part 1) — branch `phase-10-launch`
- Migration 0016: `api.launch_readiness()`; pgTAP `0010_launch_readiness.test.sql` (10).
- `scripts/launch-check.mts` + `pnpm launch:check`; `src/modules/core/launch-checks.ts` (+ unit tests, 5);
  `tsconfig` `allowImportingTsExtensions` so the script runs under plain Node.
- `src/instrumentation.ts` (`onRequestError` → structured, redacted JSON) and `src/lib/redact.ts` (+ unit tests, 6).
- Local backup / restore drill; DEPLOYMENT_GUIDE runbooks (launch check, backups, deploy / rollback, incidents).

## 2026-11-14 — Session 1 (Phase 9: testing & hardening, part 2) — branch `phase-9-hardening`
- Migration 0015: explicit service_role statement / lock timeouts (TD-69); pgTAP `0009_hardening.test.sql` (4).
- Dark-mode axe checks in `foundation.spec.ts` and `a11y-private.spec.ts`; fixed danger-button contrast in dark mode with a
  `--color-danger-ink` token (BUG-005).
- CSP SRI experiment documented and reverted (TD-70); performance investigation recorded under 9.13.
- Fresh `supabase db reset` (owner approved): all migrations apply cleanly; full regression green.

## 2026-11-14 — Session 1 (Phase 9: testing & hardening, part 1) — branch `phase-9-hardening`
- Tests: Playwright `a11y-private.spec.ts` (2) — axe + one h1 + no horizontal overflow on 9 account and 27 admin pages at
  320 / 768 / 1440; `foundation.spec.ts` gains a webhook body-limit test (declared, chunked, wrong method).
- Fixes: `/admin/sellers` and `/admin/finance/ledger` overflowed at 320 px (BUG-003, BUG-004); all `overflow-x-auto` boxes
  are `relative` (TD-67).
- Hardening: payment webhook reads the body with a 64 KB byte cap while streaming; server Supabase clients time out after
  15 s (TD-66); `Cross-Origin-Resource-Policy: same-origin` header (TD-68).
- Baselines: Lighthouse 12.8.2 on 7 public pages; OWASP ZAP baseline FAIL 0 / WARN 7 (triaged).

## 2026-11-14 — Session 1 (Phase 8: notifications) — branch `phase-8-notifications`
- Migration 0014: `core.notification_events` (28 seeded), `notification_preferences`, `notifications`, `notification_deliveries`,
  `notification_errors`; `core.notify`, `core.notify_subscribers`, `core.mask_reference`; triggers on `poolx.pools`, `requests`,
  `members`, `contributions`, `orders`, `refunds` and `auction.auctions`, `bids`, `deposits`, `results`, `refunds`,
  `deposit_adjustments`, `invoices`; API `notifications_list`, `_unread_count`, `_mark_read`, `_preferences`,
  `_set_preference`, `_claim_deliveries`, `_record_delivery`, `auction_notify_due`, `admin_notification_overview`,
  `admin_list_notification_deliveries`, `admin_retry_notification_delivery`.
- Code: `src/modules/notifications` (wording catalogue, e-mail builder, channel registry, delivery worker);
  `/api/cron/notifications`; `/api/cron/auctions` queues reminders; env `EMAIL_PROVIDER` (none | mailpit), `EMAIL_FROM`,
  `MAILPIT_URL`.
- Pages: `/account/notifications`, `/account/notifications/preferences`, `/admin/notifications`; menu entries.
- Fix: account menu caused horizontal scrolling on phones (`min-w-0`).
- Tests: pgTAP `0008_notifications.test.sql` (80); unit `notifications.test.ts` (9); Playwright `notifications.spec.ts` (2).

## 2026-11-14 — Session 1 (Phase 7: theme & CMS) — branch `phase-7-theme-cms`
- Migration 0013: `cms.theme_versions`, `cms.documents`, `cms.document_revisions` (append-only), `cms.faqs`, `cms.seo_entries`;
  validators `cms.theme_config_problem`, `has_exact_keys`, `is_plain_text`, `is_internal_href`, `is_hex`, `contrast`;
  public API `cms_public_site`, `cms_public_faqs`, `cms_public_documents`, `cms_public_document`, `cms_public_seo`; staff API
  `cms_theme_*`, `cms_admin_*` (all audited).
- Theme: `src/modules/theme` (schema, templates, compiler, `ADMIN_THEME_CSS`); `globals.css` font / scale / brand-ink /
  secondary tokens; IBM Plex Serif added; header / footer / banners driven by the published design; primary button uses
  `bg-brand text-brand-ink`.
- Pages: `/faq`, `/blog`, `/blog/[slug]`, `/info/[slug]`; homepage sections in configured order; SEO overrides on public pages;
  admin `/admin/theme`, `/admin/theme/editor`, `/admin/content` (+ new, [id], faqs), `/admin/seo`.
- Dependencies: `react-markdown` 10.1.0, `rehype-sanitize` 6.0.0.
- Tests: pgTAP `0007_cms_theme.test.sql` (71); unit `theme.test.ts` (12), `markdown.test.ts` (5); Playwright `cms.spec.ts` (3).
- Test fixes: two pgTAP assertions assumed an empty dev database (blog post count; number of auctions closed by the job) —
  now scoped to the test's own rows.

## 2026-11-13 — Session 1 (Phase 6: central admin) — branch `phase-6-admin`
- Migration 0012: `has_permission` checks profile status; suspension columns + CHECK; `user_roles.revoke_reason`; new security
  event kinds; `ledger.account_balance`; `api.admin_metrics`, `admin_list_users`, `admin_get_user`, `admin_set_user_status`,
  `admin_revoke_user_sessions`, `admin_list_roles`, `admin_grant_role`, `admin_revoke_role`, `admin_set_role_permission`,
  `admin_list_sellers`, `admin_set_seller_status`, `admin_list_payments`, `admin_list_refunds`, `admin_ledger_overview`,
  `admin_export`, `admin_list_audit`.
- Pages: `/admin` (rewritten), `/admin/users`, `/admin/users/[id]`, `/admin/roles`, `/admin/sellers`,
  `/admin/finance/{payments,refunds,ledger,exports}`, `/admin/audit`; route `/admin/finance/exports/csv`; shared
  `admin-kit.tsx` / `action-kit.ts`; `src/lib/csv.ts`.
- Tests: pgTAP `0006_admin_central.test.sql` (54); unit `csv.test.ts` (4); Playwright `admin.spec.ts` (3).
- Fixes found by tests: last-Super-Admin guard counted the target user; empty CSV exports had no header row; dashboard nav
  headings duplicated section headings; audit e2e matched rows from earlier runs.

## 2026-11-13 — Session 1 (Phases 4–5: auctions, deposits, refunds) — branch `phase-4-auctions`
- Migrations 0010–0011: deposit policy settings (no switch, no default), auction catalogue, auctions with mandatory frozen
  deposits, deposit state machine + history, bids (trigger + row-locked API, idempotent, anti-snipe), results, invoices,
  deposit adjustments, full-amount refunds, default reviews (forfeit blocked); payment routing for AUCTION_DEPOSIT /
  AUCTION_PURCHASE; refund engine; idempotent closing; public, member and admin API; reserved slugs.
- Pages: `/auctions` (live data), `/auctions/browse`, `/auctions/category/[slug]`, `/auctions/sell`, `/auctions/[slug]`,
  `/account/auctions`, `/admin/auctions` (+ new, [id], deposits, defaults, policy); `/api/cron/auctions`; sitemap entries;
  sandbox checkout handles auction deposits and invoices.
- Tests: pgTAP `0005_auction_acceptance.test.sql` (90); Vitest integration suite `tests/integration` (concurrent bidding) +
  CI step; Playwright `auction.spec.ts` (full journey).
- Fixes found by tests: forfeit guard fired before the transition check (trigger renamed to sort later); refund claim returned
  rows claimed by other runs; PoolX duplicate-refund test picked an arbitrary row; bid history needed the anon client.

## 2026-11-13 — Session 1 (Phase 3.7: PoolX lifecycle) — branch `phase-3-poolx`
- Migration 0009: final price/lock columns; negotiations (append-only), orders, shipments, disputes; lock with price-adjustment
  refunds and seller-payable/fee journals; shipping, delivery confirmation, disputes, auto-completion; member activity and
  public pool JSON extended; integrity triggers switched to SECURITY DEFINER (TD-40).
- Admin: Fulfilment section on `/admin/poolx/[id]` (close joining, negotiation log/form, lock, ship / mark delivered per order),
  `/admin/poolx/disputes`; dashboard link. Member: order panel in `/account/poolx` (tracking, confirm delivery, report a problem).
- Public pool page shows "Deal locked at …".
- Tests: pgTAP `0004_poolx_lifecycle.test.sql` (36); Playwright `poolx-lifecycle.spec.ts` (full journey).
- Fixes found by tests: tracking-URL CHECK used a regex repetition count above Postgres' 255 limit; deferred ledger/refund
  integrity triggers ran under RLS at COMMIT (false "unbalanced" when staff locked a pool); members could be under-charged if
  withdrawals dropped the tier (orders now capped at the price paid); admin fallback error message clarified.

## 2026-11-13 — Session 1 (Phase 3: payments core + PoolX) — branch `phase-3-poolx`
- Migrations 0006–0008: payment attempts / webhook events / provider refunds; double-entry ledger with balance,
  insert-only and domain-isolation triggers; PoolX schema (categories, sellers, pools, tiers, requests, members,
  contributions, refunds); PoolX business logic and HTTP API; payment-event orchestration.
- `src/modules/payments`: provider interface, sandbox provider (signed webhooks, test only), registry, webhook processing.
- `src/modules/poolx`: pricing mirror, types, validation, public queries, refund worker.
- Routes: `/api/webhooks/payments/[provider]`, `/api/cron/poolx`; pages: `/poolx` (live data), `/poolx/pools`,
  `/poolx/pools/[slug]`, `/poolx/categories/[slug]`, `/poolx/request`, `/payments/sandbox/[attemptId]`, `/account/poolx`,
  `/admin/poolx` (+ new, [id], requests). Dynamic sitemap entries.
- Header navs wrapped in Suspense (usePathname on dynamic routes); `requestNow()` display-time helper.
- Env: `SANDBOX_WEBHOOK_SECRET` (required for sandbox), `CRON_SECRET` used; CI generates both.
- Tests: pgTAP `0003_payments_poolx.test.sql` (54); unit pricing/sandbox/validation; Playwright `poolx.spec.ts` (8).
- Fixes found by tests: request form price field name mismatch; tier editor lost input after an error (React form reset);
  withdraw-without-confirmation showed as success; JSON-LD test; pgTAP isolation from e2e data.

## 2026-11-13 — Session 1 (Phase 2: authentication & users) — branch `phase-2-auth`
- Migrations 0002–0005: profiles, RBAC + permission matrix seed, append-only audit log, security events, verifications,
  rate limiter, `api` schema with account RPCs and service-role-only helpers.
- pgTAP: `supabase/tests/0002_identity_rbac.test.sql` (46 assertions).
- `@supabase/ssr` 0.12.7 + `@supabase/supabase-js` 2.119.0; server and service-role clients; `src/proxy.ts`.
- Auth pages and server actions (register, sign in/out, confirm, forgot/reset, email change); `/auth/confirm` route.
- Account area (overview, profile, security + TOTP, sessions, deletion) and header user menu.
- Staff admin shell `/admin` + `/admin/mfa` with aal2 gate.
- `supabase/config.toml`: stricter auth settings, email templates (`supabase/templates/`), `api` schema exposed.
- Tests: unit (safe redirects, validation), Playwright auth journeys with Mailpit + TOTP helpers, global setup.
- Playwright: 3 local workers, 60 s test / 15 s expect timeouts. CI split into static + integration jobs.

## 2026-11-13 — Session 1 (Phase 1: database verification)
- Moved this project's local Supabase ports from 543xx to 563xx (`supabase/config.toml`, `.env.example`) to avoid clashing with other local Supabase projects.
- Applied migration 0001 locally; pgTAP 12/12 pass. Generated gitignored `.env.local` from the local stack.

## 2026-11-13 — Session 1 (Phase 1: foundation)
- Scaffolded Next.js 16.4.6 / React 19.3 / TypeScript 5.9 / Tailwind 4.3 with pnpm; strict TS (`noUncheckedIndexedAccess`), target ES2022.
- Added design tokens, fonts, layout shell, six public pages, error pages, health endpoint, SEO metadata routes, icons, OG image.
- Added security headers/CSP (`next.config.ts`), env validation (`src/lib/env.ts`, `env.server.ts`), money utils (`src/lib/money.ts`).
- Added Supabase CLI config + migration `20261113000001_core_extensions_and_schemas.sql` + pgTAP test (not yet executed).
- Added Vitest, Playwright + axe tests, Prettier, GitHub Actions CI, `.claude/launch.json`.
- Removed scaffold placeholder assets (Next/Vercel SVGs, default favicon).

## 2026-11-13 — Session 1 (Phase 0: discovery)
- Added `/project-management/` continuity documentation (24 files), `AGENTS.md`, `README.md`, `.env.example`, `.gitignore`.
- Initialised local Git repository (no commits yet).
- No application code, migrations or dependencies added.
