# AGENTS.md — permanent instructions for AI coding agents

## Read first, every session

1. This file → 2. `project-management/PROJECT_OVERVIEW.md` → 3. `CURRENT_STATUS.md` → 4. `PENDING_TASKS.md` → 5. `NEXT_SESSION_PROMPT.md`
   → 6. inspect code, `git status`, `supabase/migrations` → 7. reconcile docs with reality → 8. report status
   (PROJECT / CURRENT PHASE / COMPLETED / PENDING / KNOWN ISSUES / NEXT TASK) before coding.

## End every session

Update COMPLETED_TASKS, PENDING_TASKS, CURRENT_STATUS, CHANGELOG, TESTING_REPORT, BUG_TRACKER (if any), DECISION_LOG (if any),
DATABASE_SCHEMA / API_DOCUMENTATION (if changed), and write exact instructions in NEXT_SESSION_PROMPT.md.

## Architecture rules (see project-management/TECHNICAL_ARCHITECTURE.md)

- PoolX (`poolx` schema, `src/modules/poolx`) and Auction (`auction` schema, `src/modules/auction`) never import from or FK into each other. Shared code lives in `core`, `ledger`, `payments`, `cms`, `theme`.
- Postgres is the source of truth. All financial / bid / membership mutations go through SQL functions; RLS denies direct client writes.
- Money: `bigint` paise only. Never `number` arithmetic or floats for money.
- Never trust client-supplied prices, amounts, roles, permissions or payment status.
- Service-role Supabase client only in server-only modules (`import 'server-only'`).
- Every new table: RLS enabled + separate SELECT/INSERT/UPDATE/DELETE policies + pgTAP tests.
- Financial and audit rows are never updated in place or deleted; use transitions/reversals.

## Non-negotiable business rules

- Every auction (any non-DRAFT state) has `deposit_amount_paise > 0`. There is no setting to disable deposits. Do not add one.
- Bidding requires a `PAID` deposit for that exact auction and user, confirmed by verified provider signal.
- Every eligible non-winner gets a full refund; winner's deposit is credited exactly once.
- `REFUNDED` only after provider confirmation. `FORFEITED` only via approved policy + 2 approvers.
- Theme/CMS changes are data validated against allowlists; they cannot touch business tables.

## Honesty rules

- Never invent brand, company, legal, contact, fee, deposit, tax or statistics values — use config + mark pending.
- Never present demo/seed data as live. Never fake payments/refunds/integrations. The `sandbox` payment adapter is dev/test only.
- Never report tests, deployments or security controls as done unless actually run/verified.
- Ask before destructive operations, paid services, architecture changes, or production changes.

## Commands

START · STATUS · CONTINUE · POOLX · AUCTION · DEPOSIT · REFUND · BIDDING · ADMIN · THEME · SECURITY · TEST · FIX · SEO · AUDIT · CHECKPOINT · HANDOVER · RELEASE (meanings: master prompt §28).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
