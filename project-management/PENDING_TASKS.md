# Pending Tasks

## Open owner decisions
OD-01 … OD-15 (DECISION_LOG.md). Live payments need OD-02/OD-03; the PoolX contribution model (TD-29) needs OD-03/OD-10 confirmation.

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

## Phase 3 — PoolX module (in progress)
- [x] 5a.1 `core.payment_attempts`, `core.payment_webhook_events`, `core.provider_refunds` + RLS + pgTAP
- [x] 5a.2 `ledger` accounts/journals/entries + balance + domain-isolation + insert-only triggers + pgTAP
- [x] 5a.3 Provider interface + `sandbox` adapter (test only) + signed webhook route + in-process test checkout
- [ ] 5a.4 Razorpay adapter — **blocked on OD-02** (account, keys, webhook secret)
- [x] 3.1 Migrations: categories (seeded), sellers, pools (product fields inline — no separate products table), tiers, requests
- [x] 3.2 Pricing in SQL + TS mirror; unit tests replicate pgTAP examples; property tests on TS
- [x] 3.3 Public pages from real data; sitemap entries
- [x] 3.4 Join → sandbox payment → verified webhook → ACTIVE membership; pending attempt reuse; failed → retry
- [x] 3.5 Withdraw (ACTIVE while pool open → full refund; PENDING → cancel); refund worker + cron route
- [x] 3.6 Pool requests + admin review (approve / under review / reject with note)
- [ ] 3.7 Lifecycle after deadline — **next**:
  - [ ] 3.7a negotiation records (`poolx.negotiations`) + `NEGOTIATING` state
  - [ ] 3.7b lock: final price from tiers at lock; `PRICE_ADJUSTMENT` partial refunds for members who paid more (TD-29)
  - [ ] 3.7c per-member orders (`poolx.orders`) with seller settlement payable ledger entries
  - [ ] 3.7d shipments (`poolx.shipments`, tracking number/carrier/status), delivery confirmation by member
  - [ ] 3.7e disputes (`poolx.disputes`) + admin resolution (refund via MANUAL refund with reason)
- [x] 3.8 `/account/poolx` + menu entry; `/admin/poolx/*` gated by `poolx.*` permissions
- [x] 3.9 Tests: pgTAP 54 new; unit 18 new; PoolX e2e 8 journeys
- [ ] 3.10 Seller verification UI (`sellers.manage`) — fold into Phase 6 seller management
- [ ] 3.11 Product images (Supabase Storage bucket, signed uploads, re-encode) — needed before launch
- [ ] 3.12 Private pools (invite link / allow-list) — schema has `kind`, no flow yet
- [ ] 3.13 Schedule `/api/cron/poolx` (every 5 min) once hosting is chosen (OD-06)

## Later phases
See PROJECT_ROADMAP.md phases 4–10.
