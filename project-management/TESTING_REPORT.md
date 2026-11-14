# Testing Report

Last updated: 2026-11-14

## Planned suites
| Suite | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5.1 | `tests/unit` | ✔ active |
| DB / RLS / invariants | pgTAP via `supabase test db` | `supabase/tests` | ✔ active (443 assertions) |
| Integration / API | Vitest integration suite against the local stack (`pnpm test:integration`): concurrent bidding with 8 real users (acceptance 8); webhooks covered in Playwright + pgTAP | `tests/integration`, `tests/e2e`, `supabase/tests` | ✔ active |
| E2E + a11y + SEO + headers + auth | Playwright 1.65 + @axe-core/playwright 4.14; Mailpit for email links; RFC 6238 TOTP helper for MFA | `tests/e2e` | ✔ active (Chromium desktop 1440 + Pixel 7; auth journeys desktop-only) |
| Security | OWASP ZAP baseline, gitleaks, pnpm audit | CI | audit run locally; gitleaks/ZAP in CI only |
| Performance | Lighthouse CI | CI | not yet |
| Backup | restore drill | DEPLOYMENT_GUIDE | Phase 10 |

## Run log

### 2026-11-14 — Phase 8 (notifications)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `prettier --check . --end-of-line auto` | ✔ |
| `pnpm test` | ✔ 77/77 — new `notifications.test.ts` (9): wording exists for exactly the 28 seeded events; every event renders with and without data (no "undefined"); money from paise strings; e-mail HTML escapes stored text, subject is one line, only internal links, settings link present; `mailpit` refused in production and needs sender + URL; default is no e-mail |
| `pnpm test:db` | ✔ 8 files, 443 assertions — new `0008_notifications.test.sql` (80): catalogue (28 / 11 PoolX); announcements opt-in; essential notices cannot be turned off; preferences not writable directly; **every catalogue event raised by its real source** (pool request review, publish, joins with milestones and target, contribution capture, lock refunds via the refund worker, shipping, delivery, completion; auction publish, deposits, LIVE flip by the job, bids and outbid, reminder job, closing, refund worker success / failure, invoice payment, overdue invoice); no trigger errors; essential notices always have an e-mail delivery; links internal; no payment ids or e-mail addresses in data; masked provider reference; replayed bid not notified twice; reminders once; privacy (own rows only, cannot mark others', content immutable); worker claim / SENT / IGNORED re-record / RETRY with back-off / SKIPPED; staff permission, reason, retry audited |
| `pnpm test:integration` | ✔ 3/3 |
| `pnpm build` | ✔ |
| `playwright test tests/e2e/notifications.spec.ts` | ✔ 2/2 — customer joins a pool → inbox shows joined / contribution / milestone (reached from the user menu) → mark one and all as read → delivery job sends the e-mail to Mailpit (greeting, amount, link, settings link) → settings: essential locked, outbid e-mail off and new auctions on are saved; cron route refuses a wrong secret; customer cannot open the delivery log; support (MFA) filters the log and sees the SENT delivery |
| Browser check (dev server, 375 px and desktop, dark) | Inbox and settings render; found and fixed horizontal scrolling on every `/account` page at 375 px (account menu) |
| `playwright test --workers=1` (full) | 54 passed, 1 failed, 1 did not run, 30 skipped by design. The failure was the PoolX "request a custom pool" test hitting its 60 s timeout while Playwright closed a second browser context (`Target.disposeBrowserContext` protocol error) after the approval had already succeeded; the next test in that serial file did not run. Rerun of `poolx.spec.ts`: **8 passed, 0 failed** (8 skipped by design). Net: every test that is not skipped by design passed on current code. |

### 2026-11-14 — Phase 7 (theme & CMS)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` | ✔ |
| `prettier --check . --end-of-line auto` | ✔ (19 new/changed files were reformatted first) |
| `pnpm test` | ✔ 68/68 — new `theme.test.ts` (12: unknown keys incl. a deposit switch rejected, CSS injection / non-hex colours, internal links only, markup in text, contrast, hero section required, fallback, templates keep content, compiler emits allowlisted properties only and refuses invalid input, admin scope) and `markdown.test.ts` (5: `javascript:` / `data:` / protocol-relative links removed, raw HTML and script dropped, images dropped, external links get `rel`, no second h1) |
| `pnpm test:db` | ✔ 7 files, 363 assertions — new `0007_cms_theme.test.sql` (71): permissions per role (content manager cannot publish themes, customer / anon denied); allowlist rejections with exact messages (unknown key, deposit switch, CSS injection, uppercase hex, low contrast, external / `javascript:` links, markup, missing hero, duplicate sections, too many banners); one draft / one live; publish needs a note; rollback creates a new live copy and refuses the live or never-published version; documents: slug rules, revisions append-only, publish / unpublish / restore, published slug locked; FAQ plain text; SEO route allowlist and lengths; audit rows; **acceptance test 20** (fingerprint of all business tables identical before and after every CMS operation; no cms function references business tables; no FK into them). Two older assertions were made robust to leftover dev data (blog count; auctions closed by the job). Runs were interrupted several times by `DbConnectError` while other projects' Docker containers were crash-looping; the final run passed. |
| `pnpm test:integration` | ✔ 3/3 |
| `pnpm build` | ✔ (76 static pages) |
| `playwright test tests/e2e/cms.spec.ts` | ✔ 3/3 — super admin: baseline publish, `javascript:` link blocked, publish new heading → shown on `/`, restore earlier version → baseline back on `/`, audit rows; content manager: post with `<script>` / `<img onerror>` published as harmless text, FAQ shown on `/faq`, cannot publish a theme; customer: admin CMS pages denied |
| `playwright test --workers=1` (full) | first pass 32 passed, 15 failed, 7 did not run, 28 skipped by design — the PoolX lifecycle test hit its 240 s timeout while the local server stalled, after which the server on :3100 refused every connection (all 14 later failures were ERR_CONNECTION_REFUSED; TD-38 environment, other projects' Docker containers crash-looping). Rerun of the affected specs (foundation, poolx, poolx-lifecycle, both projects): **35 passed, 9 skipped by design, 0 failed**. Net: every test that is not skipped by design passed on current code. |

### 2026-11-13 — Phase 6 (central admin)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` | ✔ |
| `pnpm format:check` | Reports 30 files, all line-ending only (CRLF working tree from `core.autocrlf`); `prettier --check . --end-of-line auto` ✔ (TD-50) |
| `pnpm test` | ✔ 51/51 (new `csv.test.ts`: quoting, formula neutralisation, exact numbers, header + CRLF) |
| `pnpm test:db` | ✔ 6 files, 292 assertions — new `0006_admin_central.test.sql` (54): permission matrix per role; aal1 staff have no permissions; suspension needs reason, deletes sessions, writes audit + security event; suspended staff lose permissions and RLS ledger access (positive control first); no self status/role changes; suspending staff needs `roles.manage`; last Super Admin guard; customer role not grantable; permission edits only for staff roles, Super Admin fixed; seller status note required; settlement figures hidden without `sellers.settlements`; ledger overview per domain only; export permission, range limit and audit row; audit list permission |
| `pnpm test:integration` | ✔ 3/3 |
| `pnpm build` | ✔ |
| `playwright test tests/e2e/admin.spec.ts` | ✔ 3/3 — super admin: separated dashboard, suspend (customer signed out) / reactivate, grant / revoke role, reasons in audit log, permission matrix; finance manager: payments, refunds, balanced per-module ledger without other-module accounts, CSV export header, no roles page; support: CSV route 404, no payments page. Earlier runs failed on an ambiguous dashboard heading, an empty CSV without header, and audit reasons repeated from a previous run (all fixed). |
| `playwright test --workers=1` (full) | 39 passed, 3 failed, 9 not run, 25 skipped by design on the first full pass; 2 failures were real test breaks from the new dashboard (fixed: permissions now in a disclosure, PoolX link renamed "Pools"), the rest were server-action stalls on the overloaded local Docker VM (TD-38). Reruns of the affected specs: every test passed at least once on current code; the last PoolX rerun still had one environmental stall ("Save tiers"). Failing GoTrue `/signup` returned 504 after 10 s (`context deadline exceeded`) — environment, not app code. |

### 2026-11-13 — Phases 4–5 (auctions, deposits, refunds)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 47/47 |
| `pnpm test:db` | ✔ 5 files, 238 assertions — new `0005_auction_acceptance.test.sql` (90): no publish without a positive deposit or without a configured policy; zero/negative deposits rejected by CHECK; no deposit on/off setting possible; deposit frozen after publish; bid without deposit / with pending or failed deposit / before start / after end / by seller / below minimum rejected; idempotent bid retry; anti-snipe extension and cap; one winner; every non-winner refunded in full; reserve-not-met and no-bid refunds; cancellation refunds all; winner deposit credited exactly once; late and duplicate captures refunded; REFUNDED only after provider confirmation; failed refund retry/backoff; forfeit blocked without policy; default review REFUND path; ledger balanced and domain-isolated; reserved slugs; default-review list permissions |
| `pnpm test:integration` | ✔ 3/3 — 8 users bid concurrently: exactly one opening bid accepted, accepted bids strictly increasing, current bid = max, losers get `BID_TOO_LOW` |
| `pnpm build` | ✔ |
| `playwright test tests/e2e/auction.spec.ts` | ✔ — staff create + publish (MFA) → public deposit shown → 2 bidders: bid UI absent before deposit, terms required, sandbox deposit, bid / outbid → end passes → cron closes → loser refunded (provider-confirmed) → winner invoice ₹10,500 + ₹250 − ₹1,000 = ₹9,750 paid → deposit credited once (DB check) → ledger balanced → deposits dashboard. First run failed on an ambiguous test selector (fixed). |
| `playwright test --workers=1` (full) | 43 passed, 2 failed, 3 did not run (the auth tests that depend on the failed one), 22 skipped by design. The failures were environmental: health 503 from a slow database check, and a staff session dropped during MFA enrolment. Both passed on the mobile project in the same run. Rerunning auth.spec.ts and foundation.spec.ts on desktop gave 25/25 passing. Net: **48 passed, 22 skipped by design, 0 failed.** |

### 2026-11-13 — Phase 3.7 (PoolX lifecycle)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 47/47 |
| `pnpm test:db` | ✔ 4 files, 148 assertions — new `0004_poolx_lifecycle.test.sql` (36): fee maths; customers cannot close/lock/ship; cannot lock while open; lock needs an ACCEPTED offer; negotiation log append-only (even for owner); final price = min(tier, offer); one order per member; exact price-adjustment amounts (₹202 / ₹404); lock idempotent (no extra orders/refunds); order journals balance; fee revenue = 1% of ₹3,200; **deferred integrity checks pass when fired as a non-finance staff user**; order RLS; cross-user delivery confirmation denied; fulfilment status; manager cannot refund a dispute; refund above refundable rejected; finance partial refund; dispute refund debits `seller_payable`; staff delivery needs evidence; pool auto-completes. (One run hit the known post-reset connection race; two immediate reruns passed.) |
| `pnpm build` | ✔ |
| `playwright test --workers=1` | 46 passed, 1 failed (test bug: `getByRole("button", { name: "Refund" })` substring-matched "Resolve without refund" and the dispute text was reused across runs) → fixed (exact name + unique text) → `poolx-lifecycle.spec.ts` rerun ✔. Net: **47 passed, 21 skipped by design, 0 failed.** |

Bugs found during 3.7 and fixed: tracking-URL CHECK regex exceeded Postgres' 255 repetition limit (every shipment rejected);
deferred ledger/refund integrity triggers evaluated under the committing user's RLS (staff lock failed as "unbalanced"; refund
cap could under-count) → SECURITY DEFINER (TD-40); members could be charged above what they paid if withdrawals dropped the tier
at lock → per-member price capped (TD-39); misleading admin fallback error text.

### 2026-11-13 — Phase 3 (payments core + PoolX)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 7 files, 47 tests — adds pricing mirror (incl. pgTAP-matching examples + property tests), sandbox webhook verification (valid / tampered / wrong secret / stale / missing headers / refund idempotency), PoolX validation (rupees→paise, IST datetimes, admin pool rules, requests), sandbox-secret env rule |
| `pnpm test:db` | ✔ 3 files, 112 assertions — new `0003_payments_poolx.test.sql` (54): staff need aal2 + permission; reference price needs a source; non-monotonic tiers rejected; tiers frozen after publish; drafts invisible; public list/search/category; base vs tier price; anon cannot join; quantity bounds; pending attempt reused (no duplicate charge); user cannot choose provider; amount-mismatch capture not applied; capture confirms; duplicate event no-op; second capture no-op; unknown order; one capture journal; ACTIVE member cannot pay twice; cross-user RLS on members/contributions/ledger; price drops with confirmed members; half-up rounding; ledger balanced; no cross-domain entries; cross-domain journal rejected; unbalanced journal rejected; ledger immutable; withdraw → full refund; claim once; provider-confirmed refund; recording again no-op; one refund journal; no double full refund; late capture → refund; cancel refunds confirmed members; users cannot submit payment events. Isolated from leftover e2e data. |
| `pnpm build` | ✔ 41 routes |
| `playwright test --workers=1` | ✔ **46 passed**, 20 skipped by design (desktop-only journeys on the mobile project), 0 failed. New `poolx.spec.ts` (8): public listing/detail/JSON-LD; join → test checkout → membership + tier price; failed payment → retry (no duplicate membership); webhook forged 400 / stale 400 / valid → confirmed / duplicate → `DUPLICATE` / unknown provider 404 / one journal; withdraw (unconfirmed → error) → cron 401 without secret → refunded; staff create → tiers (bad tiers rejected, input kept) → publish → public page + 3 audit rows; pool request → reviewer approves → note visible; sitemap contains pools/categories. Plus `auth.spec.ts` sign-up rate-limit test. |

Bugs found by these tests and fixed: (1) pool-request price field name mismatch made every request fail validation;
(2) tier editor lost typed values after a validation error (React 19 resets uncontrolled forms after actions) — actions now echo
values; (3) "please confirm" on withdraw rendered as a success notice; (4) header navs used `usePathname()` outside Suspense,
breaking the build for dynamic routes; (5) pool listing passed a non-`pools` row type to `pool_json` (would fail at runtime);
(6) a temp table inside a STABLE function. Environment findings: the full suite registers >10 accounts from one IP, so the app's
own sign-up limiter (10/h) correctly throttled later tests — the helper now resets the local window and a dedicated test proves
the limiter; intermittent 3 s anon statement timeouts / 1.8 s Supabase Auth lookups come from the shared local Docker VM (no lock
waits observed with `log_lock_waits` enabled) — TD-38.

### 2026-11-13 — Phase 2 (auth & users)
| Command | Result |
|---|---|
| `pnpm lint` / `typecheck` / `format:check` | ✔ |
| `pnpm test` | ✔ 4 files, 29 tests — adds `safe-redirect.test.ts` (open-redirect vectors) and `validation.test.ts` (password policy, sign-up, profile, TOTP) |
| `pnpm test:db` | ✔ 2 files, 58 assertions — sign-up trigger; matrix seed (super_admin has all, admin lacks roles.manage / manual refunds, no disable/bypass permission, customers hold no admin perms); profiles/user_roles/roles RLS for own vs other user; INSERT/UPDATE/DELETE denied to end users; staff permissions only at aal2; account API; sessions (cross-user revoke denied, current session protected); deletion request; audit log private + append-only; api execute privileges; api schema has no tables. Re-run after clean `db reset` ✔ |
| `pnpm build` | ✔ 30 routes; public pages Partial Prerender (static shell + streamed user menu) |
| `pnpm test:e2e` | ✔ 37 passed, 11 skipped (auth on mobile by design). Auth journeys: sign-up requires confirmation; confirmation link single-use; no enumeration on duplicate sign-up; inline validation keeps values; generic wrong-password error; protected redirect + return; `next=//evil.example` ignored; profile persists; sign-out; password reset via email, old password rejected; non-staff → 404 UI with no admin content; staff MFA enrol (bad code rejected, good code → /admin), new session must step up; role grant audited; deletion request/cancel; auth pages noindex |

Issues found and fixed during the run: (1) migration 0005 not yet applied → rate limiter failed closed (correct behaviour) → applied; (2) `Date.now()` during App-Shell prerender of session-reading routes → `connection()` in the DAL (TD-27); (3) non-staff `/admin` returns HTTP 200 under PPR → documented (TD-23), test asserts no content leak; (4) parallel e2e starved the small local Docker VM → 3 local workers, raised timeouts.

### 2026-11-13 — Phase 1 (Windows 11, Node 24.15, pnpm 9.15)
| Command | Result |
|---|---|
| `pnpm lint` | ✔ 0 problems |
| `pnpm typecheck` | ✔ |
| `pnpm test` | ✔ 2 files, 11 tests (money formatting/rounding incl. property tests; env validation) |
| `pnpm build` | ✔ 17 routes; all public pages static; `/api/health` dynamic |
| `pnpm test:e2e` | ✔ 26/26 — per page: HTTP 200, single h1, title, description ≥50 chars, canonical, axe (WCAG 2.0/2.1/2.2 A+AA) no serious/critical, no horizontal overflow; unique titles; 320px overflow; main nav (desktop + mobile drawer); module entry points; security headers; 404; robots/sitemap/manifest/health/icon |
| `pnpm format:check` | ✔ |
| `pnpm audit --audit-level high` | ✔ pass — 1 moderate (`minimatch` ReDoS via eslint-config-next, dev-only) |
| `pnpm test:db` | ✖ not run at first — Docker Desktop not running (see re-run below) |

### 2026-11-13 — Phase 1 database verification
| Command | Result |
|---|---|
| `supabase start -x …` (ports 563xx) | ✔ stack healthy (db, auth, rest, realtime, storage, kong, pg_meta) |
| `supabase db reset` | ✔ migration `20261113000001` applied, seed applied |
| `pnpm test:db` | ✔ 1 file, 12/12 — schemas exist; anon/authenticated have no usage on core/auction/ledger; service_role usage; helper functions exist. (First attempt hit a connection race right after reset; passed on immediate retry.) |
| `GET /api/health` (prod build, local stack) | ✔ `{"status":"ok","checks":{"app":"ok","database":"ok"}}` 200 |
| `pnpm test:e2e` (rebuilt with `.env.local`) | ✔ 26/26 |
| CSP `connect-src` | ✔ includes the local Supabase API origin only |

Environment issues met: Docker engine crashed during the first image pull (C: had ~12 GB free); default Supabase ports were taken by other local projects → moved to 563xx.

Fixed during run: canonical assertion expected a trailing slash on `/` (Next emits origin without it) — test corrected; `/api/health` was being prerendered statically — fixed with `connection()`.

## Known gaps
No Firefox/WebKit runs yet; no Lighthouse numbers; no visual screenshot review.
