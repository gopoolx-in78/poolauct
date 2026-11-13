# Current Status

**Date:** 2026-11-13
**Phase:** 1 — Design system & foundation (**complete and verified locally**, incl. database)
**Git:** initial commit `b70ea1c` on `master`; no remote yet.

## What exists and is verified
- Next.js 16.4.6 app (App Router, TS strict + `noUncheckedIndexedAccess`, Tailwind v4, Cache Components) at the repo root.
- Design tokens (light/dark, PoolX/Auction accent scoping), fonts (Fraunces / IBM Plex Sans / IBM Plex Mono).
- Layout shell: sticky header with main menu, theme toggle, mobile `<dialog>` drawer, footer, skip link.
- Public pages: `/`, `/poolx`, `/auctions`, `/how-it-works`, `/about`, `/contact` — honest empty states, no fake data; tier and deposit examples are labelled "Illustration".
- 404, error and global-error pages; `/api/health` (dynamic, no internals).
- SEO: per-page title/description/canonical/OG/Twitter, BreadcrumbList + WebSite JSON-LD, robots.txt, sitemap.xml, web manifest, icons (svg, 180/192/512 png), OG image.
- Security headers (CSP, XFO, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS in prod), `X-Robots-Tag: noindex` on private prefixes and `/api`.
- Env validation (sandbox payment provider refused in production).
- Money utilities (bigint paise, INR formatting, bps, rounding) + tests.
- Supabase CLI config (TOTP MFA enabled); **this project's local ports are 563xx** (API 56321, DB 56322) because other local
  Supabase projects on this machine use 543xx/544xx/545xx/553xx. Start with
  `pnpm exec supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit` (C: has limited free space).
- Migration 0001 applied via `supabase db reset`; pgTAP 12/12 pass.
- `.env.local` (gitignored) generated from `supabase status`; `/api/health` returns `database: ok` against the local stack.
- CI workflow (lint, typecheck, unit, build, e2e, audit, gitleaks, database job).

## Verification results (local, 2026-11-13)
`pnpm lint` ✔ · `pnpm typecheck` ✔ · `pnpm test` ✔ 11/11 · `pnpm build` ✔ · `pnpm test:e2e` ✔ 26/26 (desktop + mobile Chromium, re-run with DB connected) · `pnpm test:db` ✔ 12/12 · `pnpm format:check` ✔ · `pnpm audit --audit-level high` ✔ (1 moderate, dev-only).

## Not verified / blocked
- CI workflow has not run (no remote repository / no commits).
- No visual review by screenshot (browser pane hidden); structure, a11y (axe) and overflow verified by tests only.
- Lighthouse / Core Web Vitals not yet measured.
