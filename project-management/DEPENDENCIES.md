# Dependencies

## Installed (2026-11-13, Phase 1) — lockfile `pnpm-lock.yaml` is authoritative
Runtime: next 16.4.6 · react / react-dom 19.3.0 · zod 4.6.7 · clsx 2.1.1 · tailwind-merge 3.7.0 · lucide-react 1.72.0 · server-only 0.0.1
Dev: typescript 5.9.3 · tailwindcss 4.3.3 · @tailwindcss/turbopack 4.3.3 · eslint 9 + eslint-config-next 16.4.6 · prettier 3.10.1 (+ tailwind plugin 0.8.1) ·
vitest 5.1.0 (+ coverage-v8) · fast-check 4.10.2 · @playwright/test 1.65.0 · @axe-core/playwright 4.14.0 · supabase CLI 3.1.0 · @types/node 24

Planned additions below are installed only when the phase that needs them starts.

> Planned (none installed yet). Versions are pinned to the latest stable at Phase 1 install time and recorded here. Last updated: 2026-11-13.

## Runtime
| Package | Purpose |
|---|---|
| next, react, react-dom | framework |
| @supabase/supabase-js, @supabase/ssr | DB/Auth/Storage/Realtime client, cookie sessions |
| zod | validation |
| razorpay (or REST via fetch) | payment adapter (OD-02) |
| pino | structured logging |
| @sentry/nextjs | error monitoring (OD-08) |
| lucide-react | icons |
| clsx, tailwind-merge | class composition |
| react-markdown 10.1.0 + rehype-sanitize 6.0.0 | safe CMS Markdown (installed Phase 7) |
| sharp | image re-encoding |

## Dev
typescript, tailwindcss, @tailwindcss/postcss, eslint (+ next config, security plugin), prettier, vitest, @vitest/coverage-v8,
@playwright/test, @axe-core/playwright, supabase (CLI), lighthouse-ci, gitleaks (CI), fast-check (property tests).

## External services (owner accounts required)
Supabase (Cloud, Mumbai) · Hostinger KVM VPS (Ubuntu, Node 24, Nginx, certbot) · Payment provider · Email provider · SMS/WhatsApp provider (optional) · Sentry · Uptime monitor · Google Analytics 4 · Google Search Console.
