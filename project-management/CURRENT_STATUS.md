# Current Status

**Date:** 2026-11-14
**Phase:** 10 — Deployment & launch — **in progress**. Part 1 (launch gate, error reporting, restore drill, runbooks)
committed and merged to `master` (`265ed70`). Part 2 (Hostinger VPS deploy files) merged (`de2b837`). Media pipeline merged
(`ddea3aa`); blog / page covers (`15e9038`), header unread badge (`e2ea492`) and homepage featured listings (`08a884b`)
images inside articles (`c7f7541`), combined search (`56d5682`) and the a11y sweep fix (`c4efedc`) merged. Sitemap
paging fix (BUG-006) on branch `phase-10-sitemap-paging` — **uncommitted**. Nothing is deployed; no server or Supabase
project exists yet. Full e2e suite: 69 passed, 0 failed (39 single-project skips) on this branch.
**Git:** `master` at `c4efedc`; branch `phase-10-sitemap-paging` with uncommitted work. No remote.

## What exists and is verified
### Combined search (this session, merged)
- `/search` finds pools and live / upcoming auctions with one query (6 of each, links to the full results). Reached
  from a header icon on desktop and the menu on phones; not indexed by search engines (TD-78).

### Images inside articles (this session, merged)
- Content managers upload images to a page or post and paste a short code into the text where each should appear. Only
  that document's own uploaded images are shown, with the alt text given at upload; links to images elsewhere on the web
  are dropped. Up to 30 per page or post (7.8b, TD-77).

### Homepage featured listings (this session, merged)
- Content managers with MFA pick up to 6 pools and 6 auctions at /admin/content/featured. The homepage shows an
  "Open now" section with their live cards, but only for listings that are open right now; ended or unpublished ones
  drop off by themselves and the section disappears when none are open. Every change is audited (7.7, TD-76).

### Header unread badge (this session, merged)
- Signed-in users see a bell next to their name; it shows the number of unread in-app notifications ("99+" above 99),
  is announced as "Notifications, N unread" and links to the inbox. The count refreshes on every page change and when
  the tab is shown again (8.11).

### Blog / page covers (this session, merged)
- Content managers with MFA can upload, replace and remove one cover image per page or blog post (same upload checks and
  WebP re-encoding as listing photos). Published posts show it as a hero image and in link previews (Open Graph / Twitter);
  the blog list shows thumbnails. Images inside article text are not supported yet (7.8b). TD-75.

### Media pipeline (this session, merged)
- Staff with MFA can upload photos to draft auctions and pools (JPEG / PNG / WebP ≤ 10 MB). The server checks the file's
  real type, re-encodes to WebP in two sizes and strips location / camera metadata; alt text is required; up to 12 photos,
  re-orderable and removable while the listing is a draft. Public auction and pool pages show a gallery; list cards show
  the first photo. Private documents (KYC / RC) and malware scanning are still pending (OD-05, OD-09). TD-74.

### Phase 10 so far (this session)
- **Launch gate:** `pnpm launch:check` (environment + `api.launch_readiness()` database checks) blocks a production start with
  sandbox payments, test accounts, a demo deposit policy, no Super Admin with MFA, a table without RLS, local / http URLs,
  no brand name or no real e-mail provider. It fails on this local setup, as it should (TD-71).
- **Error reporting:** `src/instrumentation.ts` logs one redacted JSON line per server error (TD-72).
- **Backups:** local dump / restore drill passed (82 tables identical, ledger balanced); runbooks for backups, deploy /
  rollback and incidents in DEPLOYMENT_GUIDE.
- **Hosting (OD-06, TD-73):** Hostinger KVM VPS + Supabase Cloud Mumbai. `deploy/` has the Nginx site, hardened systemd
  unit, cron runner + schedule, deploy script (health-checked switch, automatic rollback) and rollback script. The cron
  runner was tested against the local app (job ran with the right secret, 401 with a wrong one); Nginx, systemd and the
  deploy / rollback scripts have only been syntax-checked — they will be proven on the first staging deploy.
- **Blocked on owner:** buying the VPS + creating Supabase projects (plan / budget), domain (OD-01), error tracker (OD-08), analytics +
  consent, Git remote for CI, live payments (OD-02/03), e-mail (OD-07), deposit values (OD-04).

### Phase 9 so far (this session)
- **Signed-in sweep:** `tests/e2e/a11y-private.spec.ts` checks 9 account and 27 admin pages at 320 / 768 / 1440 for one h1, no
  horizontal scrolling and no serious/critical axe (WCAG 2.2 AA) violations. Found and fixed `/admin/sellers` and
  `/admin/finance/ledger` overflowing on phones (BUG-003/004, TD-67).
- **Hardening:** payment webhook refuses bodies over 64 KB even without a Content-Length; server Supabase requests time out
  after 15 s (TD-66); server logs reviewed (codes / ids only); `pnpm audit` production clean.
- **Lighthouse baseline (local):** 7 public pages — accessibility, best practices and SEO 100; CLS good; performance 57–80
  (main-thread script work and LCP 2.4–3.7 s under mobile throttling; follow-up 9.13).
- **ZAP baseline:** FAIL 0 · WARN 7 · PASS 61 after a Docker restart (memory-capped run). Added
  `Cross-Origin-Resource-Policy: same-origin`; the other warnings are triaged as accepted or false positives (TD-68,
  TESTING_REPORT).
- **Part 2:** migration 0015 (service_role 30 s / 10 s timeouts, TD-69); dark-mode axe on all swept pages, danger-button
  contrast fixed (BUG-005); SRI-instead-of-nonces tested and rejected (TD-70); performance leads investigated (9.13).
  Full regression on the existing local DB: unit 77, pgTAP 447, integration 3, e2e 62 passed / 0 failed.
- **Fresh database:** `supabase db reset` (owner approved) applied all 15 migrations cleanly; pgTAP 447, integration 3 and
  full e2e 62 passed / 0 failed on it.
- **Still open:** performance work (9.13) — needs a stable staging host to measure. No open critical/high findings.

### Earlier phases
Foundation (1), accounts/RBAC/staff MFA (2), payments core + ledger + full PoolX lifecycle (3) — see CHANGELOG and git history.

### Phase 8 (this session)
- **Database (migration 0014):** `core.notification_events` (28-event catalogue with audience, essential flag and channel
  defaults), `core.notification_preferences`, `core.notifications` (one per user per occurrence — unique dedupe key; only
  `read_at` may change), `core.notification_deliveries` (EMAIL / SMS / WHATSAPP; QUEUED → SENDING → SENT / FAILED / SKIPPED),
  `core.notification_errors`. `core.notify` / `core.notify_subscribers`. AFTER triggers in the `poolx` and `auction` schemas
  raise the events; a failing trigger records an error and never blocks the business transaction (TD-60).
- **Delivery:** `/api/cron/notifications` (Bearer `CRON_SECRET`) claims due deliveries (SKIP LOCKED), sends through the e-mail
  adapter, records SENT only with a provider message id; retries 1 m / 5 m / 30 m / 2 h, max 5 attempts; unconfigured channel →
  SKIPPED. The only e-mail adapter is `mailpit` (local test inbox, refused in production); a real provider waits for OD-07.
  `/api/cron/auctions` also queues "starting soon" (≤ 60 min) and "ending soon" (≤ 15 min) reminders.
- **Account:** `/account/notifications` (inbox, unread filter, mark one / all as read, pagination) and
  `/account/notifications/preferences` (in-app / e-mail per event; payment, deposit and refund notices always on; new pools /
  new auctions are opt-in announcements); "Notifications" in the account menu and the user menu.
- **Admin:** `/admin/notifications` (support.tickets): channel status, 7-day counts, recent trigger errors, delivery log with
  filters, "Send again" for failed / skipped deliveries (reason, audited).
- **Fix found while checking mobile layout:** the account menu made every `/account` page wider than a 375 px phone screen
  (grid item without `min-w-0`); fixed.

### Phase 7

- **Database (migration 0013, `cms` schema):** `cms.theme_versions` (one PUBLISHED + one DRAFT at most; config CHECKed by
  `cms.theme_config_problem` — exact keys, enumerated values, lowercase hex, WCAG contrast ≥ 4.5 for every text/background pair,
  internal-only links, plain text without `<>` or control characters; no delete), `cms.documents` + append-only
  `cms.document_revisions` (draft / publish / restore via the published-revision pointer), `cms.faqs` (plain text),
  `cms.seo_entries` (allowlisted routes, length limits). RLS select-by-permission; all writes through `api.cms_*`, each audited.
- **Theme engine:** `src/modules/theme` — zod schema mirroring the SQL validator, three templates (editorial / bold / minimal)
  that change design settings only, compiler to CSS custom properties (refuses invalid input; never emits `<` or `\`).
  Admin is pinned to the shipped tokens through `[data-admin]` (TD-55), so a published public theme cannot break the dashboard.
- **Public site:** root layout injects the published design; header (classic / centered / split, sticky), footer (columns /
  compact), banners, menu and footer links, hero text, module visibility and hero styles, homepage section order; `/faq`
  (FAQPage JSON-LD), `/blog`, `/blog/[slug]`, `/info/[slug]`; SEO overrides for 8 routes; sitemap includes content when present.
  Markdown rendered without raw HTML or images, links limited to internal / http(s) / mailto (TD-56).
- **Admin:** `/admin/theme` (versions, publish with note, discard, restore), `/admin/theme/editor` (all controls, live
  light/dark preview), `/admin/content` (pages and posts, revisions, publish / unpublish / restore, preview),
  `/admin/content/faqs`, `/admin/seo`.

### Phase 6

- **Database (migration 0012):** `core.has_permission` also requires an ACTIVE-type profile (suspended/deleted staff lose every
  permission, including in RLS); profile suspension columns with a documented-reason CHECK; `user_roles.revoke_reason`; new
  security-event kinds; `ledger.account_balance`; `api.admin_*` functions for metrics, users, roles, sellers, payments, refunds,
  ledger, exports and the audit log (API_DOCUMENTATION). Every change needs a reason and writes an audit row.
- **Guards:** no staff member can change their own status or roles; suspending a staff account also needs `roles.manage`;
  the last active Super Admin cannot be revoked; Super Admin always keeps every permission; permissions are editable for staff
  roles only; customer role cannot be granted/revoked from the UI; exports limited to 366 days.
- **Admin UI:** `/admin` dashboard (module nav filtered by permission; Users, PoolX and Auctions metric sections kept apart;
  money figures only with `finance.ledger.read`); `/admin/users` (+ `[id]`: suspend / reactivate, end sessions, grant / revoke
  roles, role history, verifications, MFA factors, security events); `/admin/roles` (staff list + editable permission matrix);
  `/admin/sellers` (PoolX and Auction sellers, status with note; gross figures only with `sellers.settlements`);
  `/admin/finance/{payments,refunds,ledger,exports}` (ledger = per-module trial balance + journals); CSV route
  `/admin/finance/exports/csv` (formula-injection-safe, fixed headers, audited in SQL); `/admin/audit` viewer with filters.

### Phases 4–5
- **Database (migrations 0010–0011):** deposit policy in `core.system_settings` (positive-only, no on/off switch, no delete,
  no shipped default — TD-42); auction catalogue (categories, sellers, assets, masked vehicle details, inspections); auctions with
  `deposit_amount_paise > 0` for every non-DRAFT auction and frozen terms after publish; 14-state deposit machine with
  transition table + append-only history; bids validated by trigger and by the row-locked `api.auction_place_bid`; results,
  invoices (total formula CHECK), single deposit adjustment per deposit/invoice, full-amount-only refunds, default reviews with
  FORFEIT blocked (needs approved policy + two approvers).
- **Money:** `auction:*` ledger journals only (never PoolX); capture, refund (provider-confirmed only), invoice, adjustment,
  purchase, invoice cancellation. Late/duplicate deposit captures refunded automatically.
- **Jobs:** `GET /api/cron/auctions` (Bearer `CRON_SECRET`) — LIVE flip, close ended auctions, flag overdue invoices, refund worker.
- **Public:** `/auctions` (live rows, stats, deposit explainer), `/auctions/browse`, `/auctions/category/[slug]`, `/auctions/sell`,
  `/auctions/[slug]` (vehicle/inspection/charges/terms, bid history as "Bidder N", deposit box, deposit + bid forms, Product JSON-LD,
  10 s polling refresh — TD-44); sitemap includes auctions and categories.
- **Account:** `/account/auctions` — won invoices + pay, My Auction Deposits (amount, paid, reference, auction status, deposit
  status, refund status/reason/dates/reference or credit), bids, refunds; menu entries.
- **Admin:** `/admin/auctions` list, create/edit draft (item, vehicle, bidding, mandatory deposit), publish, cancel (platform /
  seller withdrew, refunds all), close-now for ended auctions; `/admin/auctions/deposits` dashboard (liability, by-state counts,
  failed-refund retry); `/admin/auctions/defaults` (extend / refund / forfeit proposal); `/admin/auctions/policy` (min/max with reason).

## Verification (local, 2026-11-14, Phase 10 part 1)
lint ✔ · typecheck ✔ · format ✔ · unit ✔ 88/88 · pgTAP ✔ 457/457 · build ✔ · launch check behaves as designed (fails locally) · error hook verified · restore drill ✔. Full e2e not rerun (no UI change).

## Verification (local, 2026-11-14, Phase 9 part 2)
lint ✔ · typecheck ✔ · format ✔ · unit ✔ 77/77 · pgTAP ✔ 447/447 · integration ✔ 3/3 · build ✔ · full e2e (`--workers=1`) ✔ 62 passed, 0 failed, 32 skipped by design. Fresh `supabase db reset` (owner approved): migrations 0001–0015 ✔ · pgTAP ✔ 447/447 · integration ✔ 3/3 · full e2e ✔ 62 passed, 0 failed.

## Verification (local, 2026-11-14, Phase 9 part 1)
lint ✔ · typecheck ✔ · format ✔ · unit ✔ 77/77 · build ✔ · `a11y-private.spec.ts` ✔ 2/2 (36 signed-in pages × 3 widths, 0 axe violations) · `foundation.spec.ts` ✔ 28/28 · `poolx.spec.ts` + `auction.spec.ts` ✔ 9 passed. Lighthouse baseline recorded (7 pages). ZAP ✔ FAIL 0 / WARN 7 (triaged); `foundation.spec.ts` rerun ✔ 28/28 with the CORP header. Not run: full e2e, pgTAP (no SQL change).

## Verification (local, 2026-11-14, Phase 8)
lint ✔ · typecheck ✔ · format ✔ (`--end-of-line auto`) · unit ✔ 77/77 · pgTAP ✔ 443/443 (notifications file 80) · integration ✔ 3/3 · build ✔ · `notifications.spec.ts` ✔ 2/2 · full e2e: 54 passed, 1 failed, 1 did not run, 30 skipped by design. The failure was the PoolX "request a custom pool" test hitting its 60 s timeout while Playwright closed a second browser context (`Target.disposeBrowserContext` protocol error) after the approval had already succeeded; the next test in that serial file did not run. Rerun of `poolx.spec.ts`: **8 passed, 0 failed** (8 skipped by design). Net: every test that is not skipped by design passed on current code.

## Verification (local, 2026-11-14, Phase 7)
lint ✔ · typecheck ✔ · format ✔ (`--end-of-line auto`, TD-50) · unit ✔ 68/68 · pgTAP ✔ 363/363 (cms file 71) · integration ✔ 3/3 · build ✔ · `cms.spec.ts` ✔ 3/3 · full e2e: first pass 32 passed, 15 failed, 7 did not run, 28 skipped by design — the PoolX lifecycle test hit its 240 s timeout while the local server stalled, after which the server on :3100 refused every connection (all 14 later failures were ERR_CONNECTION_REFUSED; TD-38 environment, other projects' Docker containers crash-looping). Rerun of the affected specs (foundation, poolx, poolx-lifecycle, both projects): **35 passed, 9 skipped by design, 0 failed**. Net: every test that is not skipped by design passed on current code.

## Verification (local, 2026-11-13, Phase 6)
lint ✔ · typecheck ✔ · format ✔ (content; working-tree CRLF only, TD-50) · unit ✔ 51/51 · pgTAP ✔ 292/292 (admin file 54) ·
integration ✔ 3/3 · build ✔ · `admin.spec.ts` ✔ 3/3 · full e2e: 39 passed, 3 failed, 9 not run, 25 skipped by design on the first full pass; 2 failures were real test breaks from the new dashboard (fixed: permissions now in a disclosure, PoolX link renamed "Pools"), the rest were server-action stalls on the overloaded local Docker VM (TD-38). Reruns of the affected specs: every test passed at least once on current code; the last PoolX rerun still had one environmental stall ("Save tiers").

## Not built yet / known gaps
- Phase 8: no real e-mail provider (OD-07) — outside local dev every e-mail is recorded as SKIPPED; SMS / WhatsApp off (OD-07,
  also needs phone verification 2.6); no unread badge in the site header; no retention / clean-up policy for old notifications;
  "Delivery update" covers delivery confirmation only (no courier tracking integration); notification cron not scheduled (OD-06).
- Phase 7: no "featured pools / auctions" picker on the homepage yet (sections show live data only); no images in CMS content
  until the media pipeline exists; theme publishing has no second-approver step (reason + audit only); a published design
  applies on the next request (cache tag), not to already-open pages.
- Seller settlements / payouts for `*:seller_payable` — needs OD-03 (fund flow); admin shows gross figures only.
- Two-approver workflow exists only for auction forfeiture; other sensitive (S) actions use reason + audit only.
- Media upload pipeline (asset photos, inspection PDFs, RC documents) — no images on auctions or pools yet.
- Inspection-report entry UI and RC verification UI (tables exist; staff can only add via SQL).
- Seller self-listing (`/auctions/sell` explains the process; third-party sellers OD-13).
- Realtime push (polling for now).
- Razorpay adapter / real fund flow (OD-02/OD-03) — **no live payments possible**. Cron scheduler wiring (OD-06).
- Deposit policy values (OD-04), bidder KYC level (OD-05), forfeiture policy (OD-11) — owner decisions.

## Environment notes
- Local Docker VM is intermittently slow; run the full e2e suite with `--workers=1` (TD-38).
