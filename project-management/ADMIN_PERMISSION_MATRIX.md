# Admin Permission Matrix

> Status: proposed default mapping; permissions are individually configurable via
> `core.role_permissions`. Enforcement: server (route/action) **and** SQL function **and** RLS.
> All staff roles require TOTP MFA (AAL2). Last updated: 2026-11-13.

**Implemented** as seed data in `supabase/migrations/20261113000002_core_identity_rbac.sql` (2026-11-13) — keep both in sync; pgTAP checks key rows.

Legend: ● granted by default · ○ not granted · S = sensitive (reason + audit; some require 2nd approver)

| Permission | Super Admin | Admin | PoolX Mgr | Auction Mgr | Finance Mgr | Seller Mgr | Support | Content Mgr |
|---|---|---|---|---|---|---|---|---|
| `admin.dashboard.view` | ● | ● | ● | ● | ● | ● | ● | ● |
| `users.read` | ● | ● | ○ | ○ | ● | ● | ● | ○ |
| `users.suspend` (S) | ● | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| `users.sessions.revoke` (S) | ● | ● | ○ | ○ | ○ | ○ | ● | ○ |
| `verification.review` | ● | ● | ○ | ● | ○ | ● | ○ | ○ |
| `roles.manage` (S) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `poolx.pools.manage` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `poolx.requests.review` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `poolx.tiers.manage` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `poolx.orders.manage` | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `poolx.orders.read` | ● | ● | ● | ○ | ○ | ○ | ● | ○ |
| `poolx.refunds.manual` (S) | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `auction.listings.manage` | ● | ● | ○ | ● | ○ | ○ | ○ | ○ |
| `auction.listings.approve` | ● | ● | ○ | ● | ○ | ○ | ○ | ○ |
| `auction.reserve.edit` (S) | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| `auction.cancel` (S) | ● | ● | ○ | ● | ○ | ○ | ○ | ○ |
| `auction.close.force` (S) | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ |
| `auction.bids.read_identities` | ● | ● | ○ | ● | ● | ○ | ○ | ○ |
| `auction.deposit.config` | ● | ○ | ○ | ● | ● | ○ | ○ | ○ |
| `auction.deposit.read` | ● | ● | ○ | ● | ● | ○ | ● | ○ |
| `auction.deposit.refund.manual` (S) | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `auction.deposit.refund.retry` | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `auction.default.review` (S) | ● | ○ | ○ | ● | ● | ○ | ○ | ○ |
| `auction.default.forfeit` (S, 2 approvers) | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `finance.ledger.read` | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `finance.reports.export` | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `sellers.manage` | ● | ● | ○ | ○ | ○ | ● | ○ | ○ |
| `sellers.settlements` (S) | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ |
| `support.tickets` | ● | ● | ○ | ○ | ○ | ○ | ● | ○ |
| `cms.content.manage` | ● | ● | ○ | ○ | ○ | ○ | ○ | ● |
| `cms.theme.edit` | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| `cms.theme.publish` (S) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `seo.manage` | ● | ● | ○ | ○ | ○ | ○ | ○ | ● |
| `system.settings` (S) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| `audit.read` | ● | ● | ○ | ○ | ● | ○ | ○ | ○ |

## Non-staff roles
| Role | Capabilities |
|---|---|
| Customer | join pools, request pools, own dashboard, support tickets |
| Bidder | Customer + participate in auctions after bidder verification + paid deposit |
| Seller | submit listings (pending approval), view own listings/sales/settlements; **cannot bid on own auctions** |

## Things no role can do (by design)
- Disable mandatory auction deposits or set a zero deposit.
- Edit or delete ledger entries, payment attempts, webhook events, audit logs.
- Mark a refund `REFUNDED` without provider confirmation.
- Inject raw HTML/JS/CSS/SQL via CMS or theme editor.
- Forfeit a deposit without an approved policy version and a second approver.
