# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 9 (Testing & hardening) — part 1 done (signed-in a11y/responsive sweep, 2 mobile fixes, webhook body cap, Supabase timeouts, log + dependency review).
**Last completed milestone:** central notification service — 28 PoolX / auction events raised by database triggers, in-app inbox, preferences, e-mail delivery worker with retries (Mailpit test inbox locally), admin delivery log, auction reminders.
**Git:** branch `phase-9-hardening` (from `master` at `c0a18fd`, which includes Phase 8) — Phase 9 work may be uncommitted; check `git status`. No remote.
**Database changes:** migrations 0001–0014 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 77 · pgTAP 443 · integration 3 · build · e2e (full suite with `--workers=1`, TD-38) — see TESTING_REPORT.
**Local env:** `.env.local` needs `EMAIL_PROVIDER=mailpit`, `EMAIL_FROM`, `MAILPIT_URL` for e-mail locally (see `.env.example`).
**Known gaps:** real e-mail provider / SMS / WhatsApp (OD-07); cron schedules (OD-06); header unread badge (8.11); notification retention (8.12); featured picker (7.7); images (media pipeline 4.8); inspection/RC staff UI; seller self-listing; seller settlements (OD-03); Razorpay (OD-02) — no live payments; deposit values OD-04, bidder KYC OD-05, forfeiture policy OD-11.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 443/443) → report status.

## Next exact tasks (ask the owner which first)
1. **Commit Phase 9 part 1** when the owner asks.
2. **Finish Phase 9** (PENDING_TASKS 9.9–9.13): performance work (9.13); DB
   statement timeout for service_role jobs; CSP nonce re-check (2.10); fresh `supabase db reset` + full pgTAP + full e2e
   (`--workers=1`); manual light/dark review. Fix findings; exit = no open critical/high.
3. **Media pipeline (shared, 4.8 / 3.11 / 7.8):** Storage buckets with RLS, signed uploads with magic-byte check, WebP re-encode,
   alt text; galleries on auctions and pools; blog covers. Unblocks KYC queue (6.10) and inspection/RC UI (4.9).
4. **Search (R-H2, §16):** PoolX and auction filters (price, discount, progress, location, brand, model, year, ending time, seller).
5. Small follow-ups: header unread badge (8.11); featured pools / auctions picker (7.7).

## Patterns to follow
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
- Wide tables: put them in a `relative overflow-x-auto` box (TD-67); add new signed-in pages to `a11y-private.spec.ts`.
- E2E: make any text you assert in shared lists (audit log, tables) unique per run.
- E2E helpers: `becomeStaffWithMfa(page, email, "auction_manager")`, `registerAndConfirm`, `sql()`, `readLocalEnv("CRON_SECRET")`.
- Editing: prefer the Edit tool or a Python script file over shell heredocs containing quotes; files may be CRLF (`core.autocrlf=true`).

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Enable forfeiture without an approved policy and two approvers.
- Present sandbox payments or demo seed values as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
