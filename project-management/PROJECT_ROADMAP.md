# Project Roadmap

Last updated: 2026-11-13. Each phase ends with tests + doc checkpoint. Phases 3 and 4 may overlap once Phase 2 is done; Phase 5 gates any auction release.

| Phase | Name | Key deliverables | Depends on | Exit criteria | Status |
|---|---|---|---|---|---|
| 0 | Discovery & planning | Requirements, architecture, DB, financial model, deposit invariants, refund states, sitemap, roadmap, continuity docs, owner-decision list | — | **Owner approves architecture & roadmap** | ☑ approved |
| 1 | Design system & foundation | Git, Next.js + TS strict + Tailwind (PostCSS) + ESLint/Prettier, env validation (zod), Supabase local, migration 0001, tokens + light/dark, fonts, layout shell, header/mobile nav, footer, home skeleton, 404/500, security headers, health endpoint, Vitest + Playwright scaffolding, CI workflow | 0 | build/typecheck/lint/tests green; Lighthouse baseline recorded | ☑ (local) |
| 2 | Auth & users | Supabase Auth (email+password, email verify, phone OTP), reset, profile, sessions list/revoke, account deletion request, RBAC tables + `has_permission`, staff MFA (TOTP, AAL2 gate), RLS baseline, audit log, user dashboard shell, rate limits | 1 | RLS pgTAP suite green; auth E2E green | ☑ (local) |
| 3 | PoolX module | Categories, pools, tiers, pricing fn, listing/search, detail, join flow (sandbox payments), requests, withdrawals, orders, shipments, refunds, disputes, PoolX dashboard & admin | 2 (+ payments core from 5a) | PoolX E2E + pgTAP green | ☑ (local; media pending) |
| 4 | Auction module | Categories, assets, vehicle fields, media, seller portal, approval, scheduling, detail page, participation, bidding engine, realtime, close job, results, invoices, auction dashboard & admin | 2, 5a | bidding concurrency tests green | ◐ core done; media, seller portal, realtime pending |
| 5 | Deposit & refund engine (critical) | 5a: payment provider abstraction, sandbox + Razorpay adapters, webhooks, payment_attempts, ledger. 5b: deposits, state machine, refund engine, retries, reconciliation, winner adjustment, default review, notifications, admin deposit dashboard | 2 | **All 20 acceptance tests pass**; independent review | ◐ 20/20 automated (test 20 in Phase 7); Razorpay pending |
| 6 | Central admin | Separated metrics dashboard, user/seller/payment/deposit/refund mgmt, disputes, reports/exports, audit viewer | 3, 4, 5 | permission tests per matrix | ☑ (local; settlements need OD-03) |
| 7 | Theme & CMS | Theme editor (20 controls), live preview, draft/publish, versions, rollback, homepage section editor, banners, nav/footer, FAQ, blog, pages, SEO settings | 1, 2 | Acceptance test 20; XSS/CSS-injection tests | ☑ (local; featured picker and CMS images pending) |
| 8 | Notifications | Outbox processor, in-app, email adapter, SMS/WhatsApp adapters (disabled until configured), preferences, delivery logs | 2 | event coverage tests | ☐ |
| 9 | Testing & hardening | Full unit/integration/DB/API/RLS/payment/refund/concurrency/security (ZAP baseline)/a11y (axe)/responsive/perf/SEO/regression | 1–8 | TESTING_REPORT complete; no open critical/high | ☐ |
| 10 | Deployment & launch | Staging + prod projects, secrets, domain, HTTPS, WAF, backups + restore test, Sentry, uptime, CI/CD + rollback, Search Console, GA4 + consent, final audit | 9 + owner decisions | Security/Quality/Launch gates | ☐ ⚑ |

## Sitemap (planned)
**Public (indexable):** `/`, `/how-it-works`, `/about`, `/contact`, `/faq`, `/blog`, `/blog/[slug]`,
`/poolx`, `/poolx/pools`, `/poolx/pools/[slug]`, `/poolx/categories/[slug]`, `/poolx/how-it-works`, `/poolx/use-cases`, `/poolx/trust`,
`/auctions`, `/auctions/browse`, `/auctions/category/[slug]`, `/auctions/[slug]`, `/auctions/how-it-works`, `/auctions/sell`,
`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/refund-cancellation`, `/legal/shipping-delivery`, `/legal/auction-terms`, `/legal/poolx-terms`, `/legal/disclaimer`.
**Auth (noindex):** `/login`, `/register`, `/verify`, `/forgot-password`, `/reset-password`.
**Account (noindex):** `/account`, `/account/profile`, `/account/security`, `/account/sessions`, `/account/verification`,
`/account/poolx/{pools,requests,contributions,orders,refunds}`, `/account/auctions/{participating,bids,won,lost,deposits,refunds,payments}`,
`/account/orders`, `/account/transactions`, `/account/notifications`, `/account/support`.
**Seller (noindex):** `/seller`, `/seller/onboarding`, `/seller/listings`, `/seller/auctions`, `/seller/sales`, `/seller/settlements`.
**Admin (noindex, MFA):** `/admin`, `/admin/users`, `/admin/sellers`, `/admin/verification`, `/admin/poolx/*`, `/admin/auctions/*`,
`/admin/finance/{deposits,refunds,payments,ledger,reports}`, `/admin/disputes`, `/admin/cms/*`, `/admin/theme`, `/admin/seo`, `/admin/settings`, `/admin/audit`, `/admin/roles`.
