# Current Status

**Date:** 2026-11-13
**Phase:** 6 — Central admin — **built and verified locally** (separated PoolX / Auction metrics, user management with
suspension and session revocation, role and permission management, seller management for both modules, payments / refunds /
per-module ledger, audited CSV exports, audit viewer). Phases 4–5 remain built with their listed gaps.
**Git:** branch `phase-6-admin` (from `master` at `742819a`). All Phase 6 work is **uncommitted**. No remote.

## What exists and is verified
### Earlier phases
Foundation (1), accounts/RBAC/staff MFA (2), payments core + ledger + full PoolX lifecycle (3) — see CHANGELOG and git history.

### Phase 6 (this session)
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

## Verification (local, 2026-11-13, Phase 6)
lint ✔ · typecheck ✔ · format ✔ (content; working-tree CRLF only, TD-50) · unit ✔ 51/51 · pgTAP ✔ 292/292 (admin file 54) ·
integration ✔ 3/3 · build ✔ · `admin.spec.ts` ✔ 3/3 · full e2e: 39 passed, 3 failed, 9 not run, 25 skipped by design on the first full pass; 2 failures were real test breaks from the new dashboard (fixed: permissions now in a disclosure, PoolX link renamed "Pools"), the rest were server-action stalls on the overloaded local Docker VM (TD-38). Reruns of the affected specs: every test passed at least once on current code; the last PoolX rerun still had one environmental stall ("Save tiers").

## Not built yet / known gaps
- Seller settlements / payouts for `*:seller_payable` — needs OD-03 (fund flow); admin shows gross figures only.
- Two-approver workflow exists only for auction forfeiture; other sensitive (S) actions use reason + audit only.
- Media upload pipeline (asset photos, inspection PDFs, RC documents) — no images on auctions or pools yet.
- Inspection-report entry UI and RC verification UI (tables exist; staff can only add via SQL).
- Seller self-listing (`/auctions/sell` explains the process; third-party sellers OD-13).
- Notifications (outbid, won, refund) — Phase 8. Realtime push (polling for now).
- Razorpay adapter / real fund flow (OD-02/OD-03) — **no live payments possible**. Cron scheduler wiring (OD-06).
- Deposit policy values (OD-04), bidder KYC level (OD-05), forfeiture policy (OD-11) — owner decisions.

## Environment notes
- Local Docker VM is intermittently slow; run the full e2e suite with `--workers=1` (TD-38).
