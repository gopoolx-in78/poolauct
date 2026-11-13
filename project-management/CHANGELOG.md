# Changelog

## 2026-11-13 — Session 1 (Phase 1: database verification)
- Moved this project's local Supabase ports from 543xx to 563xx (`supabase/config.toml`, `.env.example`) to avoid clashing with other local Supabase projects.
- Applied migration 0001 locally; pgTAP 12/12 pass. Generated gitignored `.env.local` from the local stack.

## 2026-11-13 — Session 1 (Phase 1: foundation)
- Scaffolded Next.js 16.4.6 / React 19.3 / TypeScript 5.9 / Tailwind 4.3 with pnpm; strict TS (`noUncheckedIndexedAccess`), target ES2022.
- Added design tokens, fonts, layout shell, six public pages, error pages, health endpoint, SEO metadata routes, icons, OG image.
- Added security headers/CSP (`next.config.ts`), env validation (`src/lib/env.ts`, `env.server.ts`), money utils (`src/lib/money.ts`).
- Added Supabase CLI config + migration `20261113000001_core_extensions_and_schemas.sql` + pgTAP test (not yet executed).
- Added Vitest, Playwright + axe tests, Prettier, GitHub Actions CI, `.claude/launch.json`.
- Removed scaffold placeholder assets (Next/Vercel SVGs, default favicon).

## 2026-11-13 — Session 1 (Phase 0: discovery)
- Added `/project-management/` continuity documentation (24 files), `AGENTS.md`, `README.md`, `.env.example`, `.gitignore`.
- Initialised local Git repository (no commits yet).
- No application code, migrations or dependencies added.
