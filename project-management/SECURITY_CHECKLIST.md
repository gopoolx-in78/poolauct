# Security Checklist

> Baseline: OWASP ASVS 5.0.0 + Appendix A/B of the universal master prompt (verbatim source:
> `ultimate_universal_website_app_development_master_prompt.txt` — every item there applies unless marked N/A with reason here).
> Status: ☐ planned · ◐ implemented, unverified · ☑ verified (with test ref) · ⚑ human/external action · N/A (reason)
> Last updated: 2026-11-13 — Phase 1 headers and Phase 2 auth/RBAC implemented; rest planned. No claim of being "hack-proof" is ever made.

## Threats (Appendix A §1)
| Threat | Planned control | Status |
|---|---|---|
| SQL injection | supabase-js parameterised RPC; SQL functions take typed params, no dynamic SQL from input | ◐ Phase 2 code follows this; no dedicated injection test yet |
| XSS | React escaping; no `dangerouslySetInnerHTML` except sanitised Markdown renderer; strict nonce CSP | ☐ |
| CSRF | Server Actions Origin check; Origin/Sec-Fetch-Site check on route handlers; SameSite=Lax | ☐ |
| RCE | no eval/user templates; dependency scanning; image processing in sandboxed lib | ☐ |
| Broken access control / IDOR | RLS on every protected table; ownership via auth.uid() in functions; pgTAP cross-user tests | ☑ core + PoolX + ledger — `0002_identity_rbac.test.sql`, `0003_payments_poolx.test.sql` (other users' memberships/contributions/ledger invisible; staff need aal2; anon cannot join; users cannot submit payment events) |
| SSRF | no user-supplied URLs fetched server-side; provider URLs allowlisted | ☐ |
| Directory traversal | storage paths generated server-side (uuid), never from user input | ☐ |
| Session hijacking | Supabase SSR cookies, refresh-token rotation, session list/revoke, reset signs out other sessions | ◐ list/revoke ☑ (pgTAP + e2e); cookie flags in prod unverified until deployed |
| Credential stuffing / brute force | Supabase auth limits + app limits (TD-28, fail closed) + security_events; CAPTCHA optional (OD) | ◐ implemented; limit thresholds not load-tested |
| Clickjacking | `frame-ancestors 'none'` + X-Frame-Options DENY | ☐ |
| File upload attacks | signed uploads, MIME/magic sniff, size limits, image re-encode, private bucket, malware scan ⚑ OD-09 | ☐ |
| Open redirects | `safeNextPath()` on every `next` | ☑ `tests/unit/safe-redirect.test.ts` + e2e `//evil.example` |
| API abuse | per-user/IP rate limits, pagination caps, body-size limits | ◐ pool listing capped at 48/page; webhook body ≤ 64 KB; request limit 5 open pool requests/user; join/withdraw not yet rate-limited |
| Business-logic abuse | deposit bypass, fake payment confirmations, duplicate refunds, duplicate winners, bid manipulation, races, seller self-bid, unauthorised reserve edits, admin misuse → DB invariants + tests (acceptance 1–20) + audit | ◐ PoolX/payments ☑: forged/stale webhook rejected (unit + e2e), duplicate webhook no-op (pgTAP + e2e), amount mismatch never applied (pgTAP), server-computed prices, no duplicate membership/charge, refunds idempotent & ≤ paid, late capture refunded, user cannot pick provider. Lifecycle: lock needs seller confirmation and is idempotent; members never charged above what they paid; dispute refunds need finance permission and are capped at the refundable amount; integrity triggers see all rows regardless of committing role (TD-40). Auction items ☐ (Phase 4/5) |

## Auth & accounts
Password hashing by Supabase Auth (bcrypt) ◐ (provider) · password policy ≥10 chars + upper/lower/digit ☑ (config + zod + e2e) · single-use expiring reset & confirm tokens ☑ (e2e: link reuse rejected) · email verification required ☑ (e2e) ·
OTP expiry (3600 s) ◐ · TOTP MFA required for staff, enforced in `core.has_permission` + admin gate ☑ (pgTAP + e2e) · logout ☑ (e2e) · view/revoke sessions ☑ · RBAC seeded from matrix ☑ · no account enumeration on sign-up/reset/sign-in ☑ (e2e) ·
phone OTP ⚑ OD-07 (SMS provider) · reauthentication UI for in-place password change: not built (TD-25)

## API & backend
zod validation on all Phase 2 inputs ☑ (`tests/unit/validation.test.ts`) · ownership checks ☑ · rate limiting ◐ · request size limits ☐ · method validation ☐ · CORS restricted (same-origin only) ☐ ·
webhook HMAC (timing-safe) + 300 s replay window + event-id de-duplication ☑ (unit + pgTAP + e2e) · timeouts (HTTP 10s, DB statement_timeout) ☐ · validate third-party responses ☐ · never trust client prices/roles/status ☑ for PoolX and auctions (deposit, bid validity and invoice totals computed in SQL; status only via verified webhook; bids row-locked + idempotent — pgTAP + concurrency integration test) · cron route Bearer secret, timing-safe ☑ (e2e)

## Data protection
Service-role key server-only (`server-only` import + ESLint restricted import) ◐ · secrets via env, `.env*` gitignored ☑ · secret scanning in CI (gitleaks) ☐ ·
PII minimisation; vehicle registration stored masked only (CHECK requires •) ◐; ID numbers ☐; bidders shown publicly as "Bidder N" ☑ (pgTAP) · logs redact tokens/OTP/passwords/payment data ☐ · DPDP Act review ⚑ · append-only audit log ☑ (UPDATE/DELETE/TRUNCATE blocked; pgTAP)

## Admin (Phase 6)
Suspension ends all sessions and removes every staff permission incl. RLS reads ☑ (pgTAP + e2e) · no self status/role changes ☑ (pgTAP) ·
last Super Admin protected ☑ (pgTAP) · permission edits audited with reason ☑ (pgTAP) · CSV exports: permission + aal2 + 404 otherwise ☑ (e2e),
formula injection neutralised ☑ (unit), range-limited and audited ☑ (pgTAP) · admin routes server-checked per permission ☑ (e2e)

## Theme & CMS (Phase 7)
Theme config allowlisted in SQL (CHECK) and zod; no raw CSS / HTML / JS accepted ☑ (pgTAP + unit) · compiler emits allowlisted
custom properties only and refuses `<` / `\` ☑ (unit) · menu / banner / footer links internal-only ☑ (pgTAP + unit + e2e) ·
WCAG contrast ≥ 4.5 enforced ☑ (pgTAP + unit) · Markdown without raw HTML, images or unsafe URLs ☑ (unit + e2e) · admin tokens
pinned (`[data-admin]`) ☑ (unit) · CMS cannot touch business data ☑ (acceptance 20, pgTAP) · every publish / rollback /
content change audited ☑ (pgTAP + e2e) · theme publish needs `cms.theme.publish` (content managers cannot) ☑ (pgTAP + e2e)

## Notifications (Phase 8)
Users read only their own notifications and preferences; nobody writes them directly ☑ (pgTAP) · notification content immutable ☑
(pgTAP) · no payment ids, provider references beyond the last 4 characters, or e-mail addresses in notification data ☑ (pgTAP) ·
links internal-only (CHECK + e-mail builder) ☑ (pgTAP + unit) · e-mail HTML escaped, subject header-injection safe ☑ (unit) ·
delivery worker and reminder job service-role only; cron route Bearer secret ☑ (pgTAP + e2e) · test inbox refused in production ☑
(unit) · trigger failures cannot block financial transactions ☑ (design + pgTAP "no trigger errors") · re-send audited with reason ☑ (pgTAP)

## Headers
CSP ◐ verified present (`tests/e2e/foundation.spec.ts`) — `script-src 'unsafe-inline'` accepted risk TD-16, no third-party script origins, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri`/`form-action 'self'` ·
X-Frame-Options DENY ☑ · X-Content-Type-Options ☑ · Referrer-Policy ☑ · Permissions-Policy ☑ (header set) · COOP ◐ · HSTS ◐ (prod only, unverified until deployed) · `X-Powered-By` removed ☑ ·
`X-Robots-Tag: noindex` on /account, /admin, /seller, /api ◐ (verified on /api/health)

## Dependency status (2026-11-13)
`pnpm audit`: 1 moderate — `minimatch` <11.0.1 ReDoS via `eslint-config-next` (dev tooling only, not shipped). Accept until upstream bumps; CI fails on high/critical.

## Ops
Dependency audit (`pnpm audit`, Dependabot) ☐ · separate envs ☐ · debug off in prod ☐ · demo data removed in prod ☐ · WAF ⚑ · backups + restore test ⚑ · MFA on Supabase/Vercel/provider dashboards ⚑

## Release gates
SECURITY GATE ☐ · QUALITY GATE ☐ · LAUNCH GATE ☐
