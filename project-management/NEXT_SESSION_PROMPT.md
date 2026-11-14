# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 10 (Deployment & launch) — part 1 merged (launch gate, error reporting, restore drill, runbooks); part 2: hosting decided (Hostinger KVM VPS + Supabase Cloud Mumbai, TD-73) and `deploy/` server files written. Nothing deployed yet.
**Last completed milestone:** central notification service — 28 PoolX / auction events raised by database triggers, in-app inbox, preferences, e-mail delivery worker with retries (Mailpit test inbox locally), admin delivery log, auction reminders.
**Git:** `master` at `265ed70` (Phase 10 part 1); part 2 (`deploy/`, docs) may be uncommitted — check `git status`. No remote.
**Database changes:** migrations 0001–0016 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 88 · pgTAP 457 · integration 3 · build · e2e (full suite with `--workers=1`, TD-38) — see TESTING_REPORT.
**Local env:** `.env.local` needs `EMAIL_PROVIDER=mailpit`, `EMAIL_FROM`, `MAILPIT_URL` for e-mail locally (see `.env.example`).
**Known gaps:** real e-mail provider / SMS / WhatsApp (OD-07); cron schedules (files ready in `deploy/cron`, install on the VPS); header unread badge (8.11); notification retention (8.12); featured picker (7.7); images (media pipeline 4.8); inspection/RC staff UI; seller self-listing; seller settlements (OD-03); Razorpay (OD-02) — no live payments; deposit values OD-04, bidder KYC OD-05, forfeiture policy OD-11.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 443/443) → report status.

## Next exact tasks (ask the owner which first)
1. **Commit Phase 10 part 2** (`deploy/`, `.gitattributes`, docs) when the owner asks; merge to `master` when asked.
2. **First staging deploy** once the owner has bought the Hostinger VPS and created the staging Supabase project (Mumbai):
   follow DEPLOYMENT_GUIDE "Hostinger VPS" step by step (the owner does purchases, DNS and anything needing their
   credentials); prove `nginx -t`, the systemd unit, `deploy.sh`, `rollback.sh` and the cron runner on the real server;
   then hosted restore drill (10.13) and uptime monitor (10.9).
3. **Other owner decisions:** domain (OD-01), error tracker (OD-08), analytics + consent, Git remote (1.13b), live payments
   (OD-02/03), e-mail provider (OD-07), deposit values (OD-04). Then `pnpm launch:check` green and the final audit.
4. **Media pipeline (shared, 4.8 / 3.11 / 7.8)** — needed before launch: Storage buckets with RLS, signed uploads with
   magic-byte check, WebP re-encode, alt text; galleries on auctions and pools; blog covers.
5. **Search (R-H2, §16)** and small follow-ups: header unread badge (8.11); featured picker (7.7).

## Patterns to follow
- VPS: production settings live only in `/etc/poolx/poolx.env`; the app listens on 127.0.0.1:3000 behind Nginx, which
  overwrites X-Forwarded-For (keep it that way — rate limits trust the first hop). Shell files in `deploy/` must stay LF.
- Launch gate: add a production requirement to `checkLaunchEnv` (unit test) or to `api.launch_readiness()` (new migration + pgTAP 0010).
- Errors: never put e-mails, tokens or personal data in thrown messages — Next.js logs raw error messages (TD-72).
- ZAP (keep it memory-capped — Docker here is shared by six projects and fell over once): `docker run --rm --memory 1g -v <dir>:/zap/wrk:rw -v <dir>/jvm/.ZAP_JVM.properties:/home/zap/.ZAP/.ZAP_JVM.properties:ro ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:3100 -m 3 -J zap.json -r zap.html -I` against `pnpm start -p 3100`.
- Lighthouse: Chrome launcher fails here (`spawn UNKNOWN`); start Playwright's Chromium with `--remote-debugging-port=9222` and run `lighthouse <url> --port=9222`.
- Notifications: add an event by inserting it into `core.notification_events` (new migration), raising it from a trigger in the
  module schema with `core.notify(user, event, reference, data, link)` inside a `begin … exception when others` block, adding its
  wording to `src/modules/notifications/catalog.ts` (the unit test compares both lists), and extending pgTAP 0008's flow.
- Data in notifications: amounts as paise **text**, masked references only, internal links only.
- Theme: add a control by extending **both** `cms.theme_config_problem` (new migration) and `themeConfigSchema`, then the compiler
  and editor; keep `DEFAULT_THEME` valid (unit test) and regenerate the pgTAP default config if needed. Never accept raw CSS.
- CMS reads: `src/modules/cms/server/queries.ts` (`"use cache"` + `cacheTag`); admin actions call `updateTag(CMS_TAGS.*)`.
- HTTP surface = `api.*` functions only; explicit grants; pgTAP permission checks (`set local role anon` for anon assertions).
- Integrity/constraint trigger functions are SECURITY DEFINER (TD-40). Same-event triggers fire alphabetically — name guards so
  the state-machine check runs first (`deposits_zz_guard_forfeit`).
- Errors: `raise exception 'CODE: text' using errcode = 'P0001'`; map in the module's error-message function.
- Forms: `useActionState`; return `values` on error. Server-action files (`"use server"`) export async functions only — keep
  shared constants (e.g. `LISTING_FIELDS`) in a module file.
- Display time via `await requestNow()`; session / `usePathname()` reads inside `<Suspense>`.
- pgTAP: scope assertions to the test's own rows; tests that need a "clean" setting may disable its no-delete trigger inside the
  rolled-back transaction.
- Admin pages: `requireStaff(path, permission)` inside `<Suspense>`; simple forms post to a server action that redirects with
  `?notice=` / `?error=` (`action-kit.ts` `outcome()`, `sqlMessage()`); shared UI in `src/app/admin/admin-kit.tsx`.
- Build cache: if a new Tailwind class has no effect in `pnpm build`, clear `.next/cache/turbopack` (stale CSS seen once).
- Danger buttons use `text-danger-ink`; new colour pairs need a dark-mode value (axe runs in dark too).
- Wide tables: put them in a `relative overflow-x-auto` box (TD-67); add new signed-in pages to `a11y-private.spec.ts`.
- E2E: make any text you assert in shared lists (audit log, tables) unique per run.
- E2E helpers: `becomeStaffWithMfa(page, email, "auction_manager")`, `registerAndConfirm`, `sql()`, `readLocalEnv("CRON_SECRET")`.
- Editing: prefer the Edit tool or a Python script file over shell heredocs containing quotes; files may be CRLF (`core.autocrlf=true`).

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Enable forfeiture without an approved policy and two approvers.
- Present sandbox payments or demo seed values as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
