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
- [x] 3.7 Lifecycle after joining closes (migration 0009, pgTAP 36, e2e journey):
  - [x] 3.7a close joining early (≥ min members); negotiation log (append-only) + NEGOTIATING
  - [x] 3.7b lock (needs ACCEPTED offer): final price TD-39; PRICE_ADJUSTMENT refunds; idempotent
  - [x] 3.7c per-member orders + ORDER_CREATED journals (seller payable + fee revenue)
  - [x] 3.7d shipments with carrier/tracking/https link; member confirms delivery; staff delivery with evidence; auto-complete
  - [x] 3.7e disputes: member reports; NO_ACTION (orders.manage) or REFUND (refunds.manual, ≤ refundable)
- [ ] 3.14 Seller settlement payouts (pay `poolx:seller_payable` to sellers; settlement records) — with Phase 6 finance
- [x] 3.15 Member notifications (joined, contribution, milestones, target, shipment, delivery, refunds, completion) — Phase 8
- [x] 3.8 `/account/poolx` + menu entry; `/admin/poolx/*` gated by `poolx.*` permissions
- [x] 3.9 Tests: pgTAP 54 new; unit 18 new; PoolX e2e 8 journeys
- [ ] 3.10 Seller verification UI (`sellers.manage`) — fold into Phase 6 seller management
- [ ] 3.11 Product images (Supabase Storage bucket, signed uploads, re-encode) — needed before launch
- [ ] 3.12 Private pools (invite link / allow-list) — schema has `kind`, no flow yet
- [ ] 3.13 Schedule `/api/cron/poolx` (every 5 min) once hosting is chosen (OD-06)

## Phases 4–5 — Auctions + deposit & refund engine
- [x] 4.1 Migration 0010: settings/deposit policy, catalogue, auctions, participants, deposits + state machine, bids, results, invoices, adjustments, refunds, default reviews; RLS
- [x] 4.2 Migration 0011: deposit computation, payment routing, refund engine, closing, member/public/admin API
- [x] 4.3 Public pages (`/auctions`, browse, category, sell, detail) + sitemap
- [x] 4.4 Deposit → sandbox payment → bid; anti-snipe; idempotent bids; bid history aliases
- [x] 4.5 `/account/auctions` (My Auction Deposits, invoices + pay, bids, refunds)
- [x] 4.6 Admin: listings, publish, cancel, close; deposits dashboard + refund retry; deposit policy; default reviews
- [x] 4.7 Tests: pgTAP 90 (acceptance 1–7, 9–19 + defaults + ledger); integration (acceptance 8, concurrency); Playwright auction journey
- [ ] 4.8 Media pipeline (Storage buckets, signed uploads, re-encode) — images for auctions and pools (also 3.11)
- [ ] 4.9 Inspection report + RC verification staff UI
- [ ] 4.10 Seller self-listing flow (needs OD-13 and seller KYC OD-05)
- [x] 4.11 Acceptance test 20 (theme / CMS changes cannot alter business data) — pgTAP `0007_cms_theme.test.sql`
- [x] 4.12 Outbid / won / lost / refund / deposit / overdue notifications — Phase 8
- [ ] 4.13 Schedule `/api/cron/auctions` every minute once hosting is chosen (OD-06)

## Phase 6 — Central admin
- [x] 6.1 Migration 0012: suspension, role/permission management, sellers, finance lists, ledger overview, exports, audit list
- [x] 6.2 `/admin` dashboard with separated PoolX / Auction metrics and permission-filtered module nav
- [x] 6.3 Users: search, detail, suspend / reactivate (sessions ended), end sessions, grant / revoke roles
- [x] 6.4 Roles: staff list, editable permission matrix (staff roles; Super Admin fixed)
- [x] 6.5 Sellers (both modules): status changes with note
- [x] 6.6 Finance: payments, refunds, per-module ledger, CSV exports (audited); audit viewer
- [x] 6.7 Tests: pgTAP 0006 (54), unit csv (4), Playwright `admin.spec.ts` (3)
- [ ] 6.8 Seller settlements / payouts (needs OD-03)
- [ ] 6.9 Reconciliation report against provider settlement files (needs Razorpay adapter, OD-02)
- [ ] 6.10 Verification queue UI for BIDDER_KYC / SELLER_KYC documents (needs media pipeline 4.8 and OD-05)

## Later phases
See PROJECT_ROADMAP.md phases 7–10.

## Phase 7 — Theme & CMS
- [x] 7.1 Migration 0013: theme versions, documents + revisions, FAQs, SEO entries; SQL allowlist + contrast validator; audited API
- [x] 7.2 Theme module: zod schema, templates, CSS compiler; admin pinned to shipped tokens
- [x] 7.3 Theme editor with live light/dark preview; draft / publish (note) / discard / restore earlier version
- [x] 7.4 Homepage section order + visibility, hero text, banners, menu and footer links, module visibility and hero style
- [x] 7.5 Pages (`/info/[slug]`), blog, FAQ, SEO settings for 8 public routes; sitemap
- [x] 7.6 Tests: pgTAP 71 (incl. acceptance 20), unit theme 12 + Markdown XSS 5, Playwright `cms.spec.ts` 3
- [ ] 7.7 Featured pools / auctions picker for the homepage (R-B5)
- [ ] 7.8 Images in CMS content and blog covers — needs media pipeline 4.8
- [ ] 7.9 Optional second approver for theme publishing (owner decision; currently reason + audit)
- [ ] 7.10 Visual review of the three templates in light/dark at 320/768/1440 (with 1.16)

## Phase 8 — Notifications
- [x] 8.1 Migration 0014: event catalogue (28 events), preferences, notifications, deliveries, error log; module triggers
- [x] 8.2 Delivery worker + `/api/cron/notifications`; retries with back-off; SKIPPED when a channel is not configured
- [x] 8.3 E-mail adapter interface; `mailpit` test inbox (dev/test only); SMS / WhatsApp disabled
- [x] 8.4 `/account/notifications` inbox + preferences; menu entries
- [x] 8.5 `/admin/notifications` delivery log, trigger errors, re-send with reason
- [x] 8.6 Auction reminders (starting soon / ending soon) from the auction job
- [x] 8.7 Tests: pgTAP 0008 (80, every event from its real source), unit (9), Playwright `notifications.spec.ts` (2)
- [ ] 8.8 Real e-mail provider adapter — **blocked on OD-07** (provider, sender domain, SPF/DKIM)
- [ ] 8.9 SMS / WhatsApp adapters — **blocked on OD-07** and phone verification (2.6)
- [ ] 8.10 Schedule `/api/cron/notifications` every minute (OD-06)
- [ ] 8.11 Unread badge in the site header (request-time fetch inside Suspense)
- [ ] 8.12 Retention policy for old notifications / deliveries (owner decision with the DPDP review)
- [ ] 8.13 Notify sellers about PoolX pool events once PoolX sellers have accounts (sellers are records only today)
