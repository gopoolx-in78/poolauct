# Pending Tasks

## Open owner decisions
OD-01 … OD-15 (DECISION_LOG.md). Phase 3 can start; live payments still need OD-02/OD-03.

## Phase 1 leftovers
- [x] 1.4b DB verified: migration 0001 applied, pgTAP 12/12, health reports database ok
- [ ] 1.13b Push to a private remote so CI runs (owner to provide/approve remote)
- [ ] 1.15 Lighthouse baseline (LCP/INP/CLS) on production build; record in TESTING_REPORT
- [ ] 1.16 Visual review of pages in light/dark at 320/768/1440 (now incl. auth + account pages)
- [ ] Toast, Tabs, Table, Pagination primitives — build when first used rather than as unused code

## Phase 2 — Auth & users
- [x] 2.1 Supabase server + service-role clients (`server-only`), `src/proxy.ts` session refresh (no browser client needed yet)
- [x] 2.2 Migration 0002: profiles, roles, permissions, role_permissions, user_roles, helpers, matrix seed
- [x] 2.3 Migration 0003: audit_logs (append-only), security_events, user_verifications, rate limits — *notifications tables moved to Phase 8 (first needed there)*
- [x] 2.4 RLS + pgTAP (own vs other vs staff aal1/aal2; no end-user writes; api privileges) — 58/58
- [x] 2.5 Register / login / logout / email confirmation / forgot + reset / `/auth/confirm` / email change
- [ ] 2.6 Phone OTP verification — **blocked on OD-07** (SMS provider)
- [x] 2.7 Account area + user menu (existing sections only); profile; sessions list/revoke; deletion request/cancel
- [x] 2.8 Staff TOTP enrolment + aal2 gate (DB + page); admin shell
- [x] 2.9 Rate limiting (sign-in, sign-up, reset) — fail closed; server actions carry Next.js Origin checks
- [ ] 2.10 CSP nonces for private areas — investigated: incompatible with PPR shells (TD-16/TD-23); keep risk decision, re-evaluate at Phase 9 hardening
- [x] 2.11 Tests: unit (29), pgTAP (58), Playwright auth journeys (11)
- [ ] 2.12 In-place password change with reauthentication (TD-25) — optional, before launch
- [ ] 2.13 Staff UI to grant/revoke roles (`roles.manage`) — Phase 6; until then use `core.operator_grant_role` via SQL

## Phase 3 — PoolX module (next)
Depends on a minimal payments core; do 5a first or alongside:
- [ ] 5a.1 `core.payment_attempts`, `core.payment_webhook_events`, `core.provider_refunds` + RLS + pgTAP
- [ ] 5a.2 `ledger` accounts/journals/entries + balance + domain-isolation triggers + pgTAP
- [ ] 5a.3 Payment provider interface + `sandbox` adapter (local/test only) + signed-webhook route `/api/webhooks/payments/[provider]`
- [ ] 3.1 Migrations: pool_categories (seed list), pool_sellers, pools, pool_products, pool_discount_tiers (strictly increasing), pool_requests
- [ ] 3.2 Shared pricing function (TS + SQL) with property tests proving they agree
- [ ] 3.3 Public: `/poolx` with real featured pool card, `/poolx/pools` (search/filter/sort/paginate), `/poolx/pools/[slug]`, category pages; sitemap entries
- [ ] 3.4 Join flow: `api.join_pool` (unique membership, server-computed contribution) → sandbox payment → webhook → `poolx.confirm_contribution`
- [ ] 3.5 Withdraw per published rules; refunds via PoolX refund rows (separate from auction)
- [ ] 3.6 Pool requests (custom/private) + admin review
- [ ] 3.7 Lifecycle: threshold → negotiation records → lock → orders → shipments → delivery confirmation; expiry/cancel → refunds
- [ ] 3.8 `/account/poolx/*` pages + user-menu entries; PoolX admin (`/admin/poolx/*`) gated by `poolx.*` permissions
- [ ] 3.9 Tests: pgTAP (invariants, RLS), integration (webhook idempotency), e2e join journey

## Later phases
See PROJECT_ROADMAP.md phases 4–10.
