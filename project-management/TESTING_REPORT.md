# Testing Report

Last updated: 2026-11-14

## Planned suites
| Suite | Tool | Location | Status |
|---|---|---|---|
| Unit | Vitest 5.1 | `tests/unit` | ✔ active |
| DB / RLS / invariants | pgTAP via `supabase test db` | `supabase/tests` | ✔ active (443 assertions) |
| Integration / API | Vitest integration suite against the local stack (`pnpm test:integration`): concurrent bidding with 8 real users (acceptance 8); webhooks covered in Playwright + pgTAP | `tests/integration`, `tests/e2e`, `supabase/tests` | ✔ active |
| E2E + a11y + SEO + headers + auth | Playwright 1.65 + @axe-core/playwright 4.14; Mailpit for email links; RFC 6238 TOTP helper for MFA | `tests/e2e` | ✔ active (Chromium desktop 1440 + Pixel 7; auth journeys desktop-only) |
| Security | OWASP ZAP baseline, gitleaks, pnpm audit | CI | audit run locally (Phase 9); ZAP baseline run locally (Phase 9: 0 FAIL, 7 WARN triaged); gitleaks in CI only |
| Performance | Lighthouse 12.8.2 (local baseline, Phase 9); Lighthouse CI | CI | local baseline recorded; budgets after staging measurement |
| Backup | restore drill | DEPLOYMENT_GUIDE | Phase 10 |

## Run log

### 2026-11-14 — Phase 10 combined search
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check` / `pnpm build` | ✔ |
| `playwright test search, foundation --workers=1` (both projects) | ✔ 32 passed · 2 skipped (by design) — header link to /search, noindex, search by a unique word finds the pool, no auction section when none match, axe clean, empty state with links; mobile menu reaches /search without horizontal overflow; public pages unchanged |
| Visual check (temporary Playwright screenshots) | results at 1280 px light and 375 px dark |
| Auction results on /search | not covered by a new e2e (no auction fixture helper); they use the same `listAuctions` search the auction specs cover |
| Header at 1024 / 1280 px signed in with a long name (temporary screenshot check) | first version: no overflow, but the nav labels wrapped to two lines at 1024 px; fixed by showing only the user icon below 1280 px (name kept as the accessible name); recheck: one-line nav, no overflow |
| `playwright test notifications, a11y-private --project=desktop-chromium` (after the commit) | 3 passed · 1 failed — the admin sweep reported "expected exactly one h1" on `/admin/roles` at 320 px only. The full a11y spec rerun passed 2/2, so the finding was intermittent: the sweep counted headings the moment the loading placeholder cleared, while content was still streaming in. Hardened the sweep to wait up to 10 s for exactly one h1 (a real missing / duplicate h1 still fails, now with the count); rerun ✔ 2 passed · 2 skipped (mobile by design). Notifications ✔ 2/2 (user menu still opened by the member's name) |

### 2026-11-14 — Phase 10 images inside articles
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` / `pnpm build` | ✔ |
| `pnpm test` | ✔ 99/99 — 3 new in `markdown.test.ts` (own image shown with stored size and alt; unknown id, external, protocol-relative, relative, data, javascript: and query-suffixed sources dropped; nothing without the image list) |
| `pnpm test:db` | ✔ 14 files, 546 assertions — new `0014_cms_body_images.test.sql` (15: RLS, anon / customer / other staff / non-MFA refused, add, alt required, unknown document, staff list, published post shows only its own images, drafts not public, remove once, removed image disappears, audit) |
| `playwright test tests/e2e/media.spec.ts --project=desktop-chromium` | first run: 3 passed · 1 failed — the cover test could not register ("Too many attempts": Supabase Auth's per-IP sign-up limit after many account-creating runs; the app's own sign-up bucket is reset by the helper). Rerun a few minutes later: ✔ 4/4 — new journey uploads an article image, pastes its code with an external tracker image, publishes; the post shows only the uploaded image (1200 px loaded); removing it deletes the file and takes it off the post |
| `playwright test tests/e2e/cms.spec.ts --project=desktop-chromium` | ✔ 3/3 (script, raw `<img>` and `javascript:` links still neutralised) |
| Visual check | not done separately for article images (same image styling as the cover hero, checked earlier) |

### 2026-11-14 — Phase 10 homepage featured listings
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check` (changed files) / `pnpm build` | ✔ |
| `pnpm test` | ✔ 96/96 |
| `pnpm test:db` | ✔ 13 files, 531 assertions — new `0013_featured_listings.test.sql` (20: RLS, anon / customer / other staff / non-MFA refused, duplicate, invalid module and slug, 6-per-marketplace cap, order, move, public slugs in order, draft / unknown / closed pools and draft / unknown auctions left out, remove, audit) |
| `playwright test featured, a11y-private, foundation, cms --workers=1` (both projects) | 33 passed · 2 failed · 6 skipped · 1 not run. Failures: (1) the signed-in account a11y sweep could not register its test user — "Too many attempts" (registration rate limit after many accounts created this session; the sweep never reached its pages); (2) `featured.spec.ts` — a test bug I introduced when hardening a wait (a not-shown listing prints its slug twice → strict-mode error). The admin a11y sweep, which includes `/admin/content/featured`, passed in light and dark |
| Rerun after fixing the test: `featured.spec.ts` + `a11y-private.spec.ts --project=desktop-chromium` | ✔ 3/3 — feature three pools (one closed → "Not shown"), duplicate refused, axe clean, homepage "Open now" shows only open pools in order, re-order, remove, section disappears, 6 audit rows; both a11y sweeps clean |
| Visual check (temporary Playwright screenshots) | admin page at 1280 px; homepage section at 1280 px light and 375 px dark |

### 2026-11-14 — Phase 10 header unread badge
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check src tests --end-of-line auto` / `pnpm build` | ✔ |
| `playwright test notifications, a11y-private, foundation, auth --workers=1` (first version, badge rendered on the server only) | 44 passed · 1 failed · 16 skipped · 1 not run — the a11y sweep (axe, overflow, light + dark) passed with the bell in the header; the notifications test failed because the header kept the count from before the payment: the root layout is not re-rendered on client navigation. Fixed by re-reading the count in the browser on navigation / tab focus |
| `playwright test tests/e2e/notifications.spec.ts --project=desktop-chromium` (final) | ✔ 2/2 — badge after navigating to the inbox, cleared after "Mark all as read", 401 for signed-out callers |
| Visual check (temporary Playwright screenshot) | header at 375 px dark and 1440 px light with a 3-unread badge |
| a11y-private sweep on the final version / full e2e suite | not rerun (markup of the bell unchanged since the passing sweep) |

### 2026-11-14 — Phase 10 blog covers
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` / `pnpm build` | ✔ |
| `pnpm test` | ✔ 96/96 |
| `pnpm test:db` | ✔ 12 files, 511 assertions — new `0012_cms_covers.test.sql` (16: RLS, anon / customer / other staff / non-MFA refused, alt text required, replace returns the old id and marks it REMOVED, unknown document, drafts not public, published post and blog index include the cover, remove, audit) |
| `playwright test tests/e2e/media.spec.ts --project=desktop-chromium` | ✔ 3/3 — new cover journey: upload, replace (old file returns ≥ 400), post hero loads at 1200 px, `og:image` is the cover, blog list thumbnail, remove |
| `playwright test cms, a11y-private, foundation specs --workers=1` | ✔ 35 passed · 5 skipped (mobile by design) |
| Full e2e suite | not rerun for this change |

### 2026-11-14 — Phase 10 media pipeline
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` / `pnpm build` | ✔ |
| `pnpm test` | ✔ 96/96 — new `media.test.ts` (8: magic-byte sniffing refuses SVG / GIF / HTML; two WebP sizes; EXIF orientation applied and metadata stripped; no enlargement; tiny / corrupt / non-image refused; generated paths only; same-origin check) |
| `pnpm test:db` | ✔ 11 files, 495 assertions — new `0011_media.test.sql` (38: bucket public / WebP-only / 2 MB, no client storage write policies, RLS, customer and non-MFA staff refused, alt text required, out-of-range and duplicate media refused, re-order, remove keeps a REMOVED row, audit, draft-only, 12-photo cap, public reads only for published listings, covers) |
| `playwright test tests/e2e/media.spec.ts --project=desktop-chromium` | ✔ 2/2 — fake JPEG refused; two uploads, re-order, remove; axe clean on the admin pool page; public gallery image loads (1200×900 WebP, no EXIF); card cover; cross-site, anonymous and direct anon-key Storage uploads refused |
| Visual check (in-app browser) | pool page gallery and list card cover at desktop and 375 px |
| Full e2e suite (`--workers=1`, after the commit) | 54 passed · 3 failed · 34 skipped · 7 not run (serial follow-ons). Failures: (1) `a11y-private` admin sweep — dark-mode colour contrast on the theme page's "Restore version" buttons, measured mid-transition after switching light → dark on a loaded page (re-measured: light text on near-black, passes); fixed in the test by emulating `reducedMotion: "reduce"`, which the site honours by zeroing transitions. (2) `auth` password reset and (3) `cms` theme restore — caused by a diagnostic Playwright run I started in parallel (it clears `test-results/`, deleting the running suite's trace files, and loaded the auth server at the same moment). |
| Rerun of `a11y-private`, `auth`, `cms` specs | ✔ 17 passed · 17 skipped (mobile by design) — together with the full run all 64 runnable tests pass. Lesson: never start a second Playwright run while one is in progress |

### 2026-11-14 — Phase 10 part 2 (Hostinger VPS files)
| Command | Result |
|---|---|
| `bash -n deploy/deploy.sh deploy/rollback.sh`, `sh -n deploy/cron/poolx-cron.sh` | ✔ syntax |
| `poolx-cron.sh notifications` against `pnpm start` on 127.0.0.1:3000 (flock / logger stubbed on Windows) | ✔ correct secret → job ran (`sent 19` to the local Mailpit inbox); wrong secret → 401, exit 1; unknown job name → usage, exit 2 |
| Not run | `nginx -t`, systemd unit, `deploy.sh` / `rollback.sh` end to end — need a Linux server; to be proven on the first staging deploy |

### 2026-11-14 — Phase 10 part 1 (launch readiness)
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` | ✔ |
| `pnpm test` | ✔ 88/88 — new `launch-checks.test.ts` (5: local env fails every launch item; sandbox + mailpit refused in production; http / localhost / `.test` URLs rejected; secret values never echoed; a fully configured env still fails only because no production e-mail adapter exists — OD-07) and `redact.test.ts` (6) |
| `pnpm test:db` | ✔ 10 files, 457 assertions — new `0010_launch_readiness.test.sql` (10: anon / authenticated denied, service_role allowed, six checks reported, seed deposit policy fails / staff-authored passes, `.test` account detected, RLS and timeouts pass, overall fails while any check fails) |
| `pnpm build` | ✔ |
| `node --env-file=.env.local scripts/launch-check.mts` (local) | exit 1 as expected: 9 of 15 fail (APP_ENV local, sandbox payments, mailpit, http URLs, no brand name, demo deposit policy, 40 test accounts, 19 sandbox payments); passes: env valid, keys set, Super Admin with MFA, RLS everywhere, timeouts |
| Error hook (temporary throwing route, removed) | 500; one `request_error` line with path without query, `[email]` and `[token]` masked, no cookie. Next.js's own raw error line still printed the original message (documented, TD-72) |
| Backup / restore drill (local) | `pg_dump -Fc` of app schemas (+ extensions) → scratch database: 82/82 tables identical row counts (1,386 rows); ledger net 0, 34 journals, 0 unbalanced; 6 default-privilege errors for Supabase roles (harmless). First attempts failed until extensions were included — procedure updated. Scratch DB and dump deleted |
| Not run in this part | full e2e (no UI change) |

### 2026-11-14 — Phase 9 part 2 (regression)
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` | ✔ |
| `pnpm test` | ✔ 77/77 |
| `pnpm test:db` | ✔ 9 files, 447 assertions — new `0009_hardening.test.sql` (4: service_role 30 s / 10 s, authenticated 8 s, anon 3 s) |
| PostgREST probe as service_role | `statement_timeout/lock_timeout` = `30s/10s` (temporary function, dropped) |
| `pnpm test:integration` | ✔ 3/3 |
| `playwright test foundation.spec.ts -g "dark mode"` | ✔ 2/2 (desktop + Pixel 7) |
| `playwright test a11y-private.spec.ts` (light + dark) | first run: `/account/delete` danger button contrast in dark (BUG-005); after the fix a rerun still failed in light **and** dark because Turbopack's build cache served a stylesheet without the new utility — cleared `.next/cache/turbopack`, rebuilt: **2/2 passed** |
| `playwright test --workers=1` (full, existing local DB) | ✔ **62 passed, 0 failed**, 32 skipped by design (18.9 min) |
| CSP experiment (SRI on, no 'unsafe-inline') | 54 CSP violations on `/`, `/poolx`, `/auctions`, `/login`; no hydration — reverted (TD-70) |
| Lighthouse medians (3 runs) — font experiment | before: `/` 78, `/poolx` 84, `/auctions` 81; without Fraunces opsz: 74 / 76 / 80 (within noise) — reverted |
| `supabase db reset` (owner approved) | ✔ all 15 migrations applied to an empty database, seed loaded; service_role shows `statement_timeout=30s, lock_timeout=10s` |
| `pnpm test:db` (fresh DB) | ✔ 9 files, 447/447 |
| `pnpm test:integration` (fresh DB) | ✔ 3/3 |
| `playwright test --workers=1` (full, fresh DB) | ✔ **62 passed, 0 failed**, 32 skipped by design (17.1 min) |

### 2026-11-14 — Phase 9 part 1 (hardening)
| Command | Result |
|---|---|
| `pnpm lint` / `tsc --noEmit` / `prettier --check . --end-of-line auto` | ✔ |
| `pnpm test` | ✔ 77/77 |
| `pnpm audit --prod` | ✔ no known vulnerabilities; full `pnpm audit`: 1 moderate (`minimatch` via `eslint-config-next`, dev only) |
| `pnpm build` | ✔ |
| `playwright test tests/e2e/a11y-private.spec.ts` (desktop project; sets 320 / 768 / 1440 itself) | First run timed out (`networkidle` never settles on some pages — replaced by waiting for loading placeholders to clear). Second run stopped at sign-up while the local auth service stalled under load from other projects' containers. Third run: 0 accessibility violations; overflow at 320 px on `/admin/sellers` (188 px) and `/admin/finance/ledger` (21 px). After the fixes: **2/2 passed** |
| `playwright test tests/e2e/foundation.spec.ts` | ✔ 28/28 (both projects; rerun ✔ 28/28 after adding the CORP header assertion) incl. new webhook body-limit test: 70 KB with Content-Length → 413, 70 KB chunked without Content-Length → 413, GET → 405 |
| `playwright test poolx.spec.ts auction.spec.ts --workers=1` | ✔ 9 passed, 9 skipped by design (payments flow through the changed webhook reader) |
| Not run in this part | full e2e suite, pgTAP (no SQL changed), integration, fresh `db reset` |

#### Lighthouse 12.8.2 baseline (1.15) — local production build, mobile profile (simulated 4× CPU / slow 4G)
Run against `next start` on this PC while other projects' Docker containers were loading it, so absolute timings are noisy
(a rerun of `/` scored 70 instead of 58, `/poolx` 80 instead of 57). Re-measure on staging before setting budgets.

| Page | Perf | A11y | Best practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/` | 58 (rerun 70) | 100 | 100 | 100 | 1.6 s | 3.1 s (rerun 3.7 s) | 0 | 10,840 ms (rerun 820 ms — first-run outlier) |
| `/poolx` | 57 (rerun 80) | 100 | 100 | 100 | 3.0 s | 3.6 s (rerun 2.6 s) | 0.031 | 1,440 ms (rerun 660 ms) |
| `/auctions` | 68 | 100 | 100 | 100 | 1.3 s | 3.7 s | 0.004 | 950 ms |
| `/auctions/browse` | 80 | 100 | 100 | 100 | 1.0 s | 2.4 s | 0.003 | 730 ms |
| `/how-it-works` | 78 | 100 | 100 | 100 | 1.2 s | 2.6 s | 0 | 770 ms |
| `/faq` | 70 | 100 | 100 | 100 | 1.2 s | 3.7 s | 0 | 810 ms |
| `/blog` | 67 | 100 | 100 | 100 | 0.8 s | 3.6 s | 0 | 1,110 ms |

Findings: accessibility, best practices and SEO are 100 everywhere; CLS is good everywhere. Performance is held back by
main-thread work — about 1.2–1.6 s script evaluation and ~1 s style & layout under the 4× CPU throttle, 360–390 KiB of JS,
~59 KiB of it unused on first load. LCP 2.4–3.7 s is above the 2.5 s "good" line on most pages. Follow-up 9.13.

#### OWASP ZAP baseline (stable image) — local production build, 2026-11-14
First attempt aborted: Docker Desktop's engine failed (HTTP 500) mid-scan with ~50 containers from six local projects in
3.7 GB. After the owner restarted Docker, the PoolX Supabase stack was restarted (host port forwarding had not recovered) and
ZAP was rerun capped at a 1 GB container / 512 MB Java heap (`-v <dir>/jvm/.ZAP_JVM.properties:/home/zap/.ZAP/.ZAP_JVM.properties`).
Result: **FAIL 0 · WARN 7 · PASS 61**.

| Alert | Risk (confidence) | Triage |
|---|---|---|
| Absence of Anti-CSRF Tokens (10202) — `/login`, `/register`, `/forgot-password`, `/reset-password` | Medium (Low) | False positive: Next.js Server Actions are POST-only with an Origin / Host check; no cookie-authenticated GET mutations exist. Accepted |
| CSP: script-src 'unsafe-inline' (10055) | Medium (High) | Known risk decision TD-16 (nonces incompatible with PPR shells); no third-party script origins allowed. Tracked as 9.10 |
| CSP: style-src 'unsafe-inline' (10055) | Medium (High) | Needed for Next.js / theme CSS variables; styles cannot execute script. Accepted |
| Cross-Origin-Resource-Policy missing (90004) | Low (Medium) | **Fixed:** `Cross-Origin-Resource-Policy: same-origin` on every response (e2e asserts it) |
| Cross-Origin-Embedder-Policy missing (90004) | Low (Medium) | Not set on purpose: COEP would block the payment provider's checkout window (OD-02). Accepted (TD-68) |
| User Controllable HTML Element Attribute (10031) — `next`, `view`, server-action fields | Informational | Values are React-escaped; `next` is re-validated server-side by `safeNextPath` (unit-tested). No action |
| Authentication Request Identified (10111), Content-Type Header Missing on 307/308 redirects (10019), Non-Storable / Storable Content (10049) | Informational | Expected behaviour. No action |

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
