# Security Checklist

> Baseline: OWASP ASVS 5.0.0 + Appendix A/B of the universal master prompt (verbatim source:
> `ultimate_universal_website_app_development_master_prompt.txt` — every item there applies unless marked N/A with reason here).
> Status: ☐ planned · ◐ implemented, unverified · ☑ verified (with test ref) · ⚑ human/external action · N/A (reason)
> Last updated: 2026-11-13 — **nothing implemented yet.** No claim of being "hack-proof" is ever made.

## Threats (Appendix A §1)
| Threat | Planned control | Status |
|---|---|---|
| SQL injection | supabase-js parameterised queries; SQL functions use params, no dynamic SQL from input (`format(%I/%L)` only where unavoidable) | ☐ |
| XSS | React escaping; no `dangerouslySetInnerHTML` except sanitised Markdown renderer; strict nonce CSP | ☐ |
| CSRF | Server Actions Origin check; Origin/Sec-Fetch-Site check on route handlers; SameSite=Lax | ☐ |
| RCE | no eval/user templates; dependency scanning; image processing in sandboxed lib | ☐ |
| Broken access control / IDOR | RLS on every protected table; ownership checks in functions; pgTAP cross-user tests | ☐ |
| SSRF | no user-supplied URLs fetched server-side; provider URLs allowlisted | ☐ |
| Directory traversal | storage paths generated server-side (uuid), never from user input | ☐ |
| Session hijacking | HttpOnly Secure SameSite cookies, rotation, session list/revoke | ☐ |
| Credential stuffing / brute force | Supabase auth rate limits + app rate limits + lockout/backoff, security_events monitoring, optional CAPTCHA (OD) | ☐ |
| Clickjacking | `frame-ancestors 'none'` + X-Frame-Options DENY | ☐ |
| File upload attacks | signed uploads, MIME/magic sniff, size limits, image re-encode, private bucket, malware scan ⚑ OD-09 | ☐ |
| Open redirects | `next` params restricted to same-origin relative paths | ☐ |
| API abuse | per-user/IP rate limits, pagination caps, body-size limits | ☐ |
| Business-logic abuse | deposit bypass, fake payment confirmations, duplicate refunds, duplicate winners, bid manipulation, races, seller self-bid, unauthorised reserve edits, admin misuse → DB invariants + tests (acceptance 1–20) + audit | ☐ |

## Auth & accounts
Password hashing by Supabase Auth (bcrypt) ☐ · single-use expiring reset tokens ☐ · email verify ☐ · OTP expiry & attempt limits ☐ ·
TOTP MFA required for staff (AAL2 enforced server + RLS) ☐ · server-side logout invalidation ☐ · view/revoke sessions ☐ · RBAC + resource authz ☐

## API & backend
zod validation all inputs ☐ · ownership checks ☐ · rate limiting ☐ · request size limits ☐ · method validation ☐ · CORS restricted (same-origin only) ☐ ·
webhook HMAC + replay protection ☐ · timeouts (HTTP 10s, DB statement_timeout) ☐ · validate third-party responses ☐ · never trust client prices/roles/status ☐

## Data protection
Service-role key server-only + build guard ☐ · secrets via env, `.env*` gitignored ☐ · secret scanning in CI (gitleaks) ☐ ·
PII minimisation; reg numbers & ID numbers encrypted/masked ☐ · logs redact tokens/OTP/passwords/payment data ☐ · DPDP Act review ⚑ · append-only audit log ☐

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
