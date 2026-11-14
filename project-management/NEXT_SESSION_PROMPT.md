# Next Session Prompt

**Project:** Dual marketplace — PoolX (group buying) + Auctions (second-hand assets, mandatory refundable deposits). Parent brand pending (OD-01); interim name "PoolX & Auctions".
**Current phase:** Phase 7 (Theme & CMS) — built and verified locally.
**Last completed milestone:** versioned site design (allowlist + contrast validated in SQL and zod), editor with live preview, draft / publish / rollback, homepage sections, banners, nav / footer, pages (`/info/[slug]`), blog, FAQ, SEO settings; acceptance test 20.
**Git:** branch `phase-7-theme-cms` (from `master` at `c371a8f`) — Phase 7 work may be uncommitted; check `git status` / `git log`. Not merged to `master`. No remote.
**Database changes:** migrations 0001–0013 (DATABASE_SCHEMA.md "Applied migrations").
**Tests:** unit 68 · pgTAP 363 · integration 3 (`pnpm test:integration`, needs local stack + `.env.local`) · build · e2e (full suite with `--workers=1`, TD-38) — see TESTING_REPORT.
**Known gaps:** featured pools / auctions picker (7.7); images anywhere (media pipeline 4.8); inspection/RC staff UI; seller self-listing; seller settlements (OD-03); notifications (Phase 8); Razorpay (OD-02) — no live payments; cron schedule (OD-06); deposit values OD-04, bidder KYC OD-05, forfeiture policy OD-11.

## Start-of-session protocol
Read AGENTS.md (Next.js 16 docs in `node_modules/next/dist/docs/`), PROJECT_OVERVIEW, CURRENT_STATUS, PENDING_TASKS, this file →
`git status` → `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime` → `pnpm test:db`
(expect 363/363) → report status.

## Next exact tasks (ask the owner which first)
1. **Commit Phase 7** (if not yet) and merge to `master` when the owner asks.
2. **Media pipeline (shared, 4.8 / 3.11 / 7.8):** Storage buckets `public-media` / `private-docs` with RLS on `storage.objects`,
   `core.media_assets`, signed uploads with magic-byte MIME check, WebP re-encode, required alt text; galleries on auctions and
   pools; blog covers. Unblocks the KYC verification queue (6.10) and inspection/RC UI (4.9).
3. **Phase 8 — Notifications** (outbox processor, in-app, email adapter; SMS/WhatsApp disabled until configured).
4. Small Phase 7 follow-ups: featured pools / auctions homepage picker (7.7); visual review of the three templates (7.10).

## Patterns to follow
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
- E2E: make any text you assert in shared lists (audit log, tables) unique per run.
- E2E helpers: `becomeStaffWithMfa(page, email, "auction_manager")`, `registerAndConfirm`, `sql()`, `readLocalEnv("CRON_SECRET")`.
- Editing: prefer the Edit tool or a Python script file over shell heredocs containing quotes; files may be CRLF (`core.autocrlf=true`).

## Do NOT
- Allow a zero or optional auction deposit, or any setting that disables deposits. - Mix PoolX and Auction money.
- Mark refunds REFUNDED without provider confirmation. - Enable forfeiture without an approved policy and two approvers.
- Present sandbox payments or demo seed values as real. - Use `middleware.ts` / `export const runtime`.
- Claim tests pass without running them.
