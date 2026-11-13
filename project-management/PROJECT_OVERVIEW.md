# Project Overview

**Working name:** PoolX + Auctions dual marketplace (parent brand **pending — OD-01**)
**Geography / currency:** India / INR (₹), times displayed in Asia/Kolkata, stored UTC
**Type:** Full-stack, production-oriented marketplace — one website, two independent business modules, one central Super Admin.

## Business modules
1. **PoolX — community group buying.** "Power of People. Power of Pooling." Users join buying pools,
   combined demand unlocks quantity/member-based discount tiers, purchases fulfilled by verified sellers.
2. **Auctions — online auctions of second-hand cars and other approved assets.** Bidders pay a
   **mandatory, refundable, per-auction participation deposit** before bidding. Non-winners get full
   refunds; the winner's deposit is credited against the final invoice.

## Shared infrastructure
Auth, profiles, RBAC, notifications, file storage, search, payment-gateway connectivity, analytics,
CMS/theme, audit logging, security monitoring.

## Must stay separate
Pool membership/contributions/orders/refunds vs auction participants/deposits/bids/results/refunds/settlements —
separate schemas, tables, ledger accounts, APIs and dashboards. Never combined balances.

## Source documents
- Master Development Prompt (pasted by owner, session 1, 2026-11-13) → captured in `MASTER_REQUIREMENTS.md`
- `POOLX_REBUILD_PROMPT.md` (PoolX business + design reference)
- `ultimate_universal_website_app_development_master_prompt.txt` (continuity process + Appendix A/B checklists — mandatory)

## Success definition
Functional, verified marketplace — real DB, auth, authorisation, business logic, payments (once provider
approved), admin, notifications, audit — passing the 20 mandatory auction acceptance tests and the
Security / Quality / Launch release gates. Not a visual prototype.
