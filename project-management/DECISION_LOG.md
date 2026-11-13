# Decision Log

## Technical decisions (made in Phase 0 — proposed, pending architecture approval)

| ID | Date | Decision | Rationale |
|---|---|---|---|
| TD-01 | 2026-11-13 | Greenfield Next.js (App Router) + TS + Tailwind + Supabase | No existing codebase in `D:\poolx`; master prompt's preferred stack |
| TD-02 | 2026-11-13 | Separate Postgres schemas `core`, `poolx`, `auction`, `ledger`, `cms` | Hard module isolation (§2 core principle) |
| TD-03 | 2026-11-13 | All business/financial mutations via `SECURITY DEFINER` SQL functions; RLS denies direct writes | Atomicity, row locks, single enforcement point |
| TD-04 | 2026-11-13 | Money in `bigint` paise; percentages in basis points | No floating point |
| TD-05 | 2026-11-13 | Double-entry ledger with domain-scoped accounts and balance trigger | §12.2 auditable, balanced accounting |
| TD-06 | 2026-11-13 | Payment provider abstraction with `sandbox` adapter for local/test only (refused in production) | Lets the full flow be built & tested before credentials exist without faking live payments |
| TD-07 | 2026-11-13 | Deposit amount frozen on auction at publish; percent basis = starting price, rounded up to whole rupee | Deterministic, disclosed calculation |
| TD-08 | 2026-11-13 | Tie-break: highest amount, then earliest server `accepted_at` (`clock_timestamp()` under row lock), then lowest bid seq | Deterministic first-valid-bid rule |
| TD-09 | 2026-11-13 | Bids serialised by `SELECT … FOR UPDATE` on the auction row | Simple, correct concurrency; adequate for expected load |
| TD-10 | 2026-11-13 | Scheduling: `pg_cron` for pure-DB jobs (close auctions), Vercel Cron for jobs calling provider APIs (refunds, reconciliation) | DB can't call provider securely |
| TD-11 | 2026-11-13 | Realtime via Supabase broadcast of post-commit snapshots from an outbox | Realtime never authoritative |
| TD-12 | 2026-11-13 | Theme = validated JSON → allowlisted CSS variables; homepage = ordered allowlisted section types; Markdown with sanitiser for content | No code injection through CMS |
| TD-13 | 2026-11-13 | Admin UI uses a fixed, non-themable admin token set | Stable admin even if public theme breaks |
| TD-14 | 2026-11-13 | Design direction: **Editorial / modern marketplace** (option 1 of PoolX doc, adapted) | Requested by master prompt §4 |
| TD-15 | 2026-11-13 | Avoid the word "escrow" in UI until legal confirms structure | §5.7 / §12.3 |
| TD-16 | 2026-11-13 | CSP set as a static header in `next.config.ts` with `script-src 'self' 'unsafe-inline'` (no third-party script origins); all other directives strict. **Risk decision:** per-request nonces require fully dynamic rendering and are documented by Next.js 16 as incompatible with Cache Components/PPR. Mitigations: React escaping, no raw HTML rendering, sanitised Markdown only, JSON-LD escaped. Revisit in Phase 2 for private (dynamic) areas. | Next.js 16 CSP guide |
| TD-17 | 2026-11-13 | Next.js **16.4.6** with `cacheComponents` + `partialPrefetching` (scaffold defaults; future defaults). Middleware is now `proxy.ts`. Request-time handlers must call `await connection()` (e.g. `/api/health`). Error boundaries receive `{ error: unknown, retry }`. | Bundled docs in `node_modules/next/dist/docs` |
| TD-18 | 2026-11-13 | Interim display name "PoolX & Auctions" (`NEXT_PUBLIC_BRAND_NAME` overrides); interim neutral icon mark | OD-01 pending; descriptive, invents no company facts |
| TD-19 | 2026-11-13 | Tailwind v4 via `@tailwindcss/turbopack` loader in `next.config.ts` + tokens in `globals.css` `@theme inline` | Proper build-time config (no CDN) |
| TD-21 | 2026-11-13 | Local Supabase ports 563xx; start without studio/imgproxy/edge-runtime/logflare/vector/supavisor/mailpit until needed | Other local Supabase projects occupy default ports; limited free space on C: |
| TD-20 | 2026-11-13 | Domain schemas are not exposed via PostgREST; only `public`/`graphql_public` are exposed for now | Least privilege; exposure is decided per function in later phases |

## Approvals
| Date | Item | By |
|---|---|---|
| 2026-11-13 | Phase 0 architecture & roadmap approved; Phase 1 started | Owner (chat: "Approve, start Phase 1") |

## Pending owner decisions (do not invent — sensible configurable defaults used meanwhile)

| ID | Decision needed | Default used until decided | Blocks |
|---|---|---|---|
| OD-01 | Parent brand name, logo, domain, legal entity name, address, contact email/phone, GSTIN | Brand configurable via `system_settings`; placeholder text "[Brand]" in dev only; legal pages show "pending owner details" banner in non-prod | Phase 10 launch, legal pages |
| OD-02 | Payment provider (Razorpay proposed; Cashfree / PayU alternatives) + account & KYC | Build Razorpay adapter + sandbox | Live payments |
| OD-03 | Legal fund-flow structure for holding pool contributions and auction deposits (PA marketplace / split settlement / escrow via regulated partner) | No live collection | Live payments |
| OD-04 | Default auction deposit values (global default, min, max) | Seed values only in dev, marked DEMO | Auction launch |
| OD-05 | Bidder verification level (phone OTP + PAN? Aadhaar-offline-KYC? manual doc review?) and seller KYC | Phone + email verified + manual document review workflow | Auction launch |
| OD-06 | Hosting (Vercel + Supabase Cloud Mumbai proposed) and budget for paid tiers | Local dev only | Staging |
| OD-07 | Email / SMS / WhatsApp providers | In-app + email adapter interface; SMS/WhatsApp disabled | Notifications phase |
| OD-08 | Monitoring (Sentry) account | Structured logs only | Launch |
| OD-09 | Malware scanning for uploads (e.g. ClamAV service / provider) | Strict MIME allowlist, re-encode images, PDFs only in private bucket | Launch |
| OD-10 | Auction commission / buyer premium / seller fees; PoolX platform fee % and "0% convenience fee for early users" offer | Fields exist, default 0, must be disclosed | Launch |
| OD-11 | Winning bidder default & forfeiture policy (legal review) | FORFEITED blocked in DB | Auction launch (default handling) |
| OD-12 | GST / tax treatment of commissions, fees, invoices | Tax lines configurable, default none | Invoices in prod |
| OD-13 | Third-party sellers enabled at launch? | Configurable flag, default platform-only | — |
| OD-14 | Used-car auction regulatory requirements (e.g. dealer authorisation for registered-vehicle sales, ownership transfer process) | Disclosures + manual verification fields | Vehicle auctions in prod |
| OD-15 | Old PoolX codebase (`poolx78-main`) — supply it or confirm greenfield | Greenfield | — |
