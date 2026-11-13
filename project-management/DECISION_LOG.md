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
| TD-20 | 2026-11-13 | Domain schemas are not exposed via PostgREST. *(Superseded in part by TD-22.)* | Least privilege |
| TD-21 | 2026-11-13 | Local Supabase ports 563xx; lean start excludes studio/imgproxy/edge-runtime/logflare/vector/supavisor/realtime (mailpit now **included** for auth email tests) | Other local Supabase projects occupy default ports; limited free space on C:; small Docker VM |
| TD-22 | 2026-11-13 | New `api` schema is the **only** schema PostgREST exposes besides public/graphql_public. It contains functions only (pgTAP asserts no tables/views). `core` tables get narrow SELECT grants so RLS is the real guard even for direct SQL; no end-user INSERT/UPDATE/DELETE grants or policies. Server-only helpers (`api.rate_limit_hit`, `api.record_security_event`) are executable by `service_role` only. | Single, auditable HTTP surface; defence in depth |
| TD-23 | 2026-11-13 | Under Partial Prerendering, a `notFound()`/`redirect()` raised inside a streamed `<Suspense>` boundary renders the 404 UI / client redirect but the HTTP status of the already-sent shell stays 200. Accepted for private areas (`/admin`, `/account`): no protected content is rendered or sent; areas are noindex. The proxy also redirects signed-out users with a real 307. | Next.js 16 PPR streaming semantics |
| TD-24 | 2026-11-13 | Email links (confirm, recovery, email change) use `token_hash` + server-side `verifyOtp` at `/auth/confirm` instead of PKCE code exchange; custom templates in `supabase/templates/` | Works across browsers/devices; tokens single-use and expiring |
| TD-25 | 2026-11-13 | Password changes from the account area go through the emailed one-time reset link (no in-place change form for now); a successful reset signs out all other sessions | `secure_password_change` + `require_current_password` without building a reauthentication UI yet |
| TD-26 | 2026-11-13 | Staff permissions are effective only in an aal2 (TOTP-verified) session — enforced in `core.has_permission()` (and therefore RLS), the admin page gate and `get_my_account()` | MFA for privileged accounts (§11.6, §17) enforced in the database, not just the UI |
| TD-27 | 2026-11-13 | Session reads go through the Data Access Layer (`getAccount`), which calls `connection()` first so auth work never runs during prerendering or App-Shell prefetching | Supabase token checks use the current time; Next.js 16 rejects that in prerenders |
| TD-28 | 2026-11-13 | App-level rate limits (Postgres fixed-window, fail closed): sign-in 30/15 min per IP + 8/15 min per email; sign-up 10/h per IP; reset 10/h per IP + 3/h per email. Keys are SHA-256 hashes, never raw emails/IPs. | Brute-force / credential-stuffing protection on top of Supabase Auth's own limits |
| TD-29 | 2026-11-13 | **PoolX contribution model (interim, pending OD-03/OD-10):** a member pays `quantity × current tier price + disclosed fee`, computed in SQL at join from *confirmed* membership only. If a deeper tier unlocks later, the difference is to be refunded as a `PRICE_ADJUSTMENT` partial refund at lock (lock step not built yet). | Members never pay more than the price shown; avoids holding balances |
| TD-30 | 2026-11-13 | A payment attempt is created by the user's own API call **without** a provider; the server then creates the provider order and attaches it via a service-role-only function. | Users cannot choose the provider (e.g. force the test provider) |
| TD-31 | 2026-11-13 | Sandbox provider: HMAC-SHA256 over `timestamp.body`, 300 s freshness window, timing-safe compare; test checkout submits through the same verify + process path as real webhooks; refused when `APP_ENV=production` and when no secret is set; page labelled "Test mode — no real money moves". | Build and test the full flow honestly before real credentials exist |
| TD-32 | 2026-11-13 | One SQL entry point `api.payments_process_event`: de-duplicates by `(provider, event_id)`, never applies a capture whose amount/currency differs from the attempt (audited), routes by `purpose` to exactly one domain, and turns a capture that arrives after withdrawal/expiry/closure into an automatic full `LATE_CAPTURE` refund. | Idempotent, auditable, domain-isolated payment handling |
| TD-33 | 2026-11-13 | Refund worker: claim (`REFUND_INITIATED` committed before the provider call) → provider refund with a stable idempotency key → record outcome. `REFUNDED` only on provider-confirmed status; failures back off 1 m / 5 m / 30 m / 2 h / 12 h, then stop for manual review (audited). | No duplicate refunds; accurate states |
| TD-34 | 2026-11-13 | Scheduled work via `GET /api/cron/poolx` (Bearer `CRON_SECRET`, timing-safe): closes pools past deadline (THRESHOLD_MET or EXPIRED + full refunds) and runs the refund worker. Scheduler itself depends on hosting (OD-06). | Provider calls cannot run inside Postgres |
| TD-35 | 2026-11-13 | Public catalogue uses a cookie-less anon client calling `api.poolx_*` functions; live numbers render per request; only immutable-after-publish metadata (title/summary, categories) is cached with `use cache` + `cacheLife("hours")`. | Accurate member counts/prices; fast metadata |
| TD-36 | 2026-11-13 | Admin date/time inputs (`datetime-local`) are interpreted as IST; all storage UTC; all display IST. | §8.2 time rules |
| TD-37 | 2026-11-13 | `authenticated` now has USAGE on the `ledger` schema; every ledger table is RLS-gated to `finance.ledger.read` (pgTAP proves customers see 0 rows). Supersedes the Phase 1 test that asserted no usage. | Lets finance staff read the ledger in later phases without a new schema grant |
| TD-38 | 2026-11-13 | Local Playwright runs with 2 workers (1 for a full verification run): the shared local Docker VM showed 69 s checkpoints (I/O starvation), causing 3 s anon statement timeouts under load. Not a code issue; CI runners are unaffected. | Reliable local verification |

## Approvals
| Date | Item | By |
|---|---|---|
| 2026-11-13 | Phase 0 architecture & roadmap approved; Phase 1 started | Owner (chat: "Approve, start Phase 1") |
| 2026-11-13 | Phase 2 started | Owner (chat: "Start Phase 2") |
| 2026-11-13 | Phase 2 merged to master; Phase 3 started | Owner (chat: "Merge into master", "Start Phase 3") |

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
