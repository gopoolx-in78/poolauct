# Technical Architecture

> Status: **PROPOSED — awaiting owner approval** (Phase 0). Nothing below is implemented yet.
> Last updated: 2026-11-13

## 1. Starting point (discovery findings)

- `D:\poolx` contains only two reference documents: `POOLX_REBUILD_PROMPT.md` and
  `ultimate_universal_website_app_development_master_prompt.txt`.
- The `poolx78-main` React/Vite codebase mentioned in the PoolX reference is **not present**.
  This is therefore a **greenfield** build using the master-prompt stack. Nothing existing is
  overwritten. If the old codebase is later supplied, it is treated as a design/content reference only
  (its `localStorage` persistence is explicitly disallowed as a source of truth).
- Local tooling found: Node 24.15, npm 12.1, pnpm 9.15, Git 2.54, Docker 29.7.
  Supabase CLI is not installed globally; it will be used via `pnpm dlx supabase` / dev dependency.
- The folder was not a Git repository at discovery time.

## 2. High-level architecture

```
                        ┌──────────────────────────────────────────────────┐
 Browser ──HTTPS──▶ CDN/WAF ──▶ Next.js (App Router, Node runtime)           │
                        │   ├─ Public pages (RSC, SSG/ISR)                    │
                        │   ├─ Account / Seller / Admin (RSC, noindex)        │
                        │   ├─ Route handlers  /api/*  (typed, zod-validated) │
                        │   ├─ Server actions (forms)                         │
                        │   └─ Cron endpoints (auction close, reconcile)      │
                        └───────┬───────────────────────┬──────────────────┘
                                │ anon/user JWT (RLS)   │ service role (server only)
                                ▼                       ▼
                        ┌──────────────────────────────────────────────────┐
                        │ Supabase                                          │
                        │  Postgres: schemas core | poolx | auction | ledger│
                        │            | cms  (+ RLS, constraints, RPC fns)   │
                        │  Auth (email/phone OTP, TOTP MFA)                 │
                        │  Storage (public media / private KYC & RC docs)   │
                        │  Realtime (broadcast of auction bid snapshots)    │
                        │  pg_cron (scheduled jobs → SQL functions)         │
                        └──────────────────────────────────────────────────┘
                                ▲
 Payment provider ──signed webhook──▶ /api/webhooks/payments/[provider]
 (Razorpay proposed)  ◀── server API calls (orders, payments, refunds)
```

### Guiding principles
1. **Postgres is the source of truth** for every business and financial state. Realtime, UI timers and
   provider redirects are never authoritative.
2. **Business mutations run inside SQL functions** (`SECURITY DEFINER`, fixed `search_path`, explicit
   permission checks) invoked from server code. This gives atomic transactions, row locks
   (`SELECT … FOR UPDATE`) and a single place to enforce invariants. Clients never `INSERT/UPDATE`
   financial or bid tables directly — RLS denies it.
3. **Module isolation**: PoolX and Auction live in separate Postgres schemas, separate TypeScript
   modules, separate API namespaces and separate ledger accounts. Cross-module foreign keys are
   forbidden except to `core` (users, media, notifications) and `ledger`.
4. **Money is `bigint` paise** everywhere (DB + TS `bigint`/branded integer type). No floats.
5. **Defence in depth**: zod validation at the edge → permission check in server code →
   permission + invariant check in SQL function → RLS → constraints/triggers.
6. **Design is data, not code**: themes/CMS are validated JSON mapped onto an allowlist of CSS
   variables and section components. They cannot reach business tables.

## 3. Technology choices

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + React + TypeScript (strict) | Latest stable at Phase 1 start, pinned |
| Styling | Tailwind CSS (installed via PostCSS, not CDN) + CSS variables | Tokens in `DESIGN_SYSTEM.md` |
| Package manager | pnpm | lockfile committed |
| Validation | zod | shared request/response schemas |
| DB / Auth / Storage / Realtime | Supabase (Postgres 15+) | local via Supabase CLI + Docker |
| DB client | `@supabase/ssr` (cookie sessions) + `supabase-js`; typed via generated types | |
| Migrations | Supabase CLI SQL migrations in `supabase/migrations` | single source of schema truth |
| DB tests | pgTAP (`supabase test db`) | RLS + invariants |
| Unit/integration | Vitest | |
| E2E | Playwright | incl. mobile viewports, axe accessibility |
| Payments | Provider abstraction; **Razorpay adapter proposed**; `sandbox` adapter for dev/test only | owner decision OD-02 |
| Email | Provider abstraction (Resend / SES / Postmark) | OD-07 |
| SMS / WhatsApp | Provider abstraction, disabled until configured | OD-07 |
| Rate limiting | Postgres-backed token bucket (no extra infra) → Upstash Redis optional later | |
| Monitoring | Sentry (errors) + structured JSON logs (pino) + health endpoint | OD-08 |
| Hosting | Hostinger KVM VPS (Node 24, `next start` under systemd, Nginx + certbot) + Supabase Cloud (Mumbai `ap-south-1`) — decided | OD-06, TD-73 |
| CDN/WAF | Nginx limits on the VPS; Cloudflare optional (configure `real_ip` first) | TD-73 |
| Scheduling | `pg_cron` calling SQL functions; VPS system cron (`deploy/cron`) calling `/api/cron/*` on 127.0.0.1 for jobs that need provider API calls | TD-73 |

## 4. Repository layout (planned)

```
/                         AGENTS.md, README.md, .env.example
/project-management/      continuity docs (this folder)
/supabase/
  config.toml
  migrations/             ordered SQL migrations
  seed/                   dev-only seed (clearly marked demo; never run in prod)
  tests/                  pgTAP tests (RLS, invariants, state machines)
/src/
  app/
    (public)/             home, about, contact, how-it-works, legal, blog
    (public)/poolx/       PoolX public pages
    (public)/auctions/    Auction public pages
    (auth)/               login, register, verify, reset
    account/              unified user dashboard (noindex)
    seller/               seller portal (noindex)
    admin/                super admin (noindex, MFA-gated)
    api/                  route handlers (see API_DOCUMENTATION.md)
    sitemap.ts robots.ts manifest.ts not-found.tsx error.tsx global-error.tsx
  modules/
    core/                 auth, profiles, rbac, notifications, audit, media
    poolx/                domain/ (pure logic), server/ (queries, actions), ui/
    auction/              domain/ (bid rules, state machines), server/, ui/
    ledger/               posting helpers, reports
    payments/             provider interface + adapters (razorpay, sandbox)
    cms/                  pages, banners, nav, SEO settings
    theme/                theme schema, CSS-variable compiler, preview
  components/ui/          design-system primitives
  lib/                    env validation, logger, rate-limit, errors, money
/tests/
  unit/ integration/ e2e/ security/
```

## 5. Module boundaries

| Layer | Shared (`core`) | PoolX (`poolx`) | Auction (`auction`) |
|---|---|---|---|
| Identity | profiles, roles, permissions, verifications, sessions | — | — |
| Catalog | media assets, categories? **No** — each module owns its categories | pool_categories, pools, products, tiers | auction_categories, assets, media links |
| Participation | — | pool_members, pool_contributions | auction_participants, auction_deposits, bids |
| Orders/settlement | — | pool_orders, shipments, refunds, disputes | results, invoices, payments, refunds, settlements, disputes |
| Payments | payment_attempts, webhook_events (tagged with `domain`) | references attempts | references attempts |
| Ledger | `ledger` schema with domain-scoped accounts | `poolx:*` accounts | `auction:*` accounts |

A `payment_attempts.domain` column (`poolx` | `auction`) plus a `purpose` enum routes every webhook
to exactly one module handler. A PoolX handler cannot receive an auction attempt and vice-versa
(CHECK constraint on `(domain, purpose)` pairs).

## 6. Key flows

### 6.1 Auction deposit → bidding
1. `POST /api/auctions/:id/deposit` (auth, verified, terms accepted) →
   SQL `auction.start_deposit(auction_id, idem_key)`:
   locks participant row; if a deposit exists in `PAID` → return it; if `PAYMENT_PENDING` →
   reconcile with provider first; else create deposit (`CREATED→PAYMENT_PENDING`) with
   **server-computed amount** from the auction's frozen deposit config.
2. Server creates provider order (idempotency key = deposit attempt id) and returns checkout params.
3. Provider webhook (HMAC verified, event id de-duplicated) → `core.record_webhook_event` →
   `auction.confirm_deposit_payment(attempt_id, provider_payment_id, amount)` verifies amount/currency
   match, moves deposit `PAYMENT_PENDING→PAID`, posts ledger journal, activates participant
   (`bidding_enabled=true`), enqueues notifications. Client-side "success" only triggers a status poll.
4. `POST /api/auctions/:id/bids` → `auction.place_bid(auction_id, amount_paise, idem_key)` which,
   in one transaction: locks the auction row, checks the 10 validation rules (see
   `AUCTION_REQUIREMENTS.md §8.1`), inserts the bid, updates denormalised `current_bid`,
   `bid_count`, applies anti-snipe extension, writes audit/outbox rows. Realtime broadcast from the
   outbox after commit.

### 6.2 Auction close
`pg_cron` every minute → `auction.close_due_auctions()` selects auctions with
`status='LIVE' AND ends_at <= now()` using `FOR UPDATE SKIP LOCKED`, and per auction calls
`auction.close_auction(id)` (idempotent; unique `auction_results(auction_id)`):
determine winner (highest amount, earliest `accepted_at`, then lowest bid id), check reserve,
set winner deposit `WINNER_ADJUSTMENT_PENDING`, all other `PAID` deposits `REFUND_ELIGIBLE`,
create invoice, enqueue refund jobs + notifications. The refund worker (VPS cron →
`/api/cron/auctions`) calls the provider (needs network) and records results.

### 6.3 PoolX join
`poolx.join_pool(pool_id, quantity, idem_key)` → unique `(pool_id,user_id)` membership in
`PENDING_PAYMENT`, contribution row with server-computed amount from current pricing rules →
provider order → webhook → `poolx.confirm_contribution` → membership `ACTIVE`, recompute tier
(member/quantity counts derived from confirmed contributions only).

## 7. Security architecture (summary — full list in SECURITY_CHECKLIST.md)

- Supabase Auth with HttpOnly cookie sessions via `@supabase/ssr`; TOTP MFA required (AAL2) for any
  account holding a staff role; admin routes and staff SQL functions check `auth.jwt()->>'aal' = 'aal2'`.
- RBAC: `core.permissions`, `core.role_permissions`, `core.user_roles`; helper
  `core.has_permission(text)` used in RLS and SQL functions. Client-supplied roles are never trusted.
- Service-role key only in server env; a lint rule + build check forbids importing the admin client
  from client components.
- CSP (see TD-16), HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy` via `next.config.ts` headers (TD-16; `proxy.ts` replaces middleware in Next 16).
- CSRF: Server Actions (Origin check built-in) + Origin/`Sec-Fetch-Site` check on mutating route
  handlers; SameSite=Lax cookies.
- Uploads: signed upload URLs, MIME sniffing + extension + size allowlist, private bucket for KYC/RC,
  images re-encoded; malware scanning hook (OD-09).
- Webhooks: raw-body HMAC verification, timestamp/event-id replay protection, idempotent processing.
- Audit: append-only `core.audit_logs` (no UPDATE/DELETE grants; trigger blocks modification).

## 8. Environments

| Env | DB | Payments | Purpose |
|---|---|---|---|
| local | Supabase CLI (Docker) | `sandbox` adapter (labelled TEST) | development, tests |
| staging | Supabase project (separate) | provider **test mode** keys | UAT, E2E |
| production | Supabase project (Mumbai) | provider **live** keys — only after legal + provider approval | live |

`sandbox` adapter is refused at boot when `APP_ENV=production` (env validation fails).

## 9. Open architecture questions → see `DECISION_LOG.md` (pending owner decisions OD-01…OD-15)
