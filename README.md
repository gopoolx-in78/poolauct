# PoolX + Auctions Marketplace

One website, two independent business modules, one central Super Admin:

- **PoolX** — community group buying. _Power of People. Power of Pooling._
- **Auctions** — online auctions of second-hand cars and other approved assets, with a **mandatory refundable participation deposit** per auction.

> **Status:** Phase 6 (Central admin) — accounts, RBAC, staff MFA, the full PoolX lifecycle, auctions with the mandatory
> refundable deposit and refund engine, and the central admin (users, roles, sellers, finance, exports, audit) are built and
> tested locally. Payments run on the dev-only sandbox adapter; no live payments are possible yet.
> See [`project-management/CURRENT_STATUS.md`](project-management/CURRENT_STATUS.md).

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Realtime) · Vitest · Playwright · payment provider abstraction (Razorpay proposed).

## Documentation

| Doc                                                                    | Purpose                                       |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                                 | Rules for AI coding agents                    |
| [Technical architecture](project-management/TECHNICAL_ARCHITECTURE.md) | System design                                 |
| [Database schema](project-management/DATABASE_SCHEMA.md)               | Tables, constraints, invariants               |
| [Financial architecture](project-management/FINANCIAL_ARCHITECTURE.md) | Ledger, money handling                        |
| [Auction deposit rules](project-management/AUCTION_DEPOSIT_RULES.md)   | Non-negotiable deposit rules & states         |
| [Refund workflow](project-management/REFUND_WORKFLOW.md)               | Refund engine                                 |
| [Roadmap](project-management/PROJECT_ROADMAP.md)                       | Phases 0–10, sitemap                          |
| [Decision log](project-management/DECISION_LOG.md)                     | Technical decisions + pending owner decisions |

## Local setup

Requires Node 24+, pnpm 9+, and Docker Desktop (for the local database).

```bash
pnpm install
cp .env.example .env.local     # fill in values printed by `pnpm db:start`
pnpm db:start && pnpm db:reset # local Supabase + migrations
pnpm dev                       # http://localhost:3000
```

| Command                                              | Purpose                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | static checks                                      |
| `pnpm test`                                          | unit tests (Vitest)                                |
| `pnpm build && pnpm test:e2e`                        | production build + Playwright (a11y, SEO, headers) |
| `pnpm test:db`                                       | pgTAP database tests                               |

More in [DEPLOYMENT_GUIDE.md](project-management/DEPLOYMENT_GUIDE.md).
