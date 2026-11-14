# Master Requirements

> Consolidated from the owner's Master Development Prompt (sections 1–29), `POOLX_REBUILD_PROMPT.md`
> and the Universal Master Prompt (incl. Appendix A & B, which are mandatory and **not** shortened —
> refer to the source file for the verbatim checklist). Status column is updated as work is verified.
> Detailed module requirements: `POOLX_REQUIREMENTS.md`, `AUCTION_REQUIREMENTS.md`,
> `AUCTION_DEPOSIT_RULES.md`, `REFUND_WORKFLOW.md`, `FINANCIAL_ARCHITECTURE.md`.

Status legend: ☐ not started · ◐ in progress · ☑ verified · ⚑ needs owner/external action

## A. Platform & navigation
| ID | Requirement | Status |
|---|---|---|
| R-A1 | One site, two modules, one Super Admin | ☐ |
| R-A2 | Main menu: Home, PoolX, Auctions, How It Works, About Us, Contact Us | ☐ |
| R-A3 | User menu: My Account, My PoolX Activities, My Auction Activities, My Orders, My Transactions, My Deposits, My Refunds, Notifications, Help & Support | ☐ |
| R-A4 | Homepage introduces both models with entry points "Explore PoolX — Join Buying Pools" / "Explore Auctions — Discover and Bid" | ☐ |
| R-A5 | Parent brand, domain, logo, company details configurable; never invented | ⚑ OD-01 |

## B. Design system & dynamic theming (§4, §19)
| ID | Requirement | Status |
|---|---|---|
| R-B1 | Editorial/modern marketplace design; documented tokens; light + dark via CSS variables | ☐ |
| R-B2 | Distinct PoolX and Auction accents under parent brand | ☐ |
| R-B3 | Super Admin theme manager: 20 controls (§4 list) incl. live preview, draft/publish, versions, rollback | ☑ (Phase 7, local) |
| R-B4 | Safeguards: allowlisted CSS vars, no JS/SQL/HTML/unsafe CSS, no effect on business logic, stable admin UI, publish logged | ☑ (pgTAP + unit; acceptance 20) |
| R-B5 | CMS: homepage sections order/enable, banners, featured pools/auctions, headings, CTAs, footer, nav, SEO, preview, draft/publish, all changes logged & reversible | ☑ (featured picker added in Phase 10, TD-76) |
| R-B6 | No gradient blobs, no glassmorphism navbar, display + text font pairing, 8px grid, single radius, motion language (PoolX doc) | ☐ |

## C. PoolX (§5) — see POOLX_REQUIREMENTS.md
R-C1 PoolX home with live (real-data) pool card · R-C2 categories (admin CRUD) · R-C3 listing w/ search/filter/sort ·
R-C4 pool requests + approval · R-C5 join/withdraw/no duplicates · R-C6 configurable tiers from real data ·
R-C7 auditable contributions, separate from deposits · R-C8 completion → orders → delivery → refunds/disputes ·
R-C9 PoolX admin. Status: ☐ all

## D. Auction (§6, §8) — see AUCTION_REQUIREMENTS.md
R-D1 auction home · R-D2 categories/subcategories · R-D3 listing creation (admin/verified sellers) ·
R-D4 used-car fields + masking + no false verification claims · R-D5 Timed English + Reserve; extensible engine ·
R-D6 detail page · R-D7 server-authoritative atomic bidding · R-D8 realtime (non-authoritative) ·
R-D9 automated idempotent closing, optional anti-sniping. Status: ☐ all

## E. Mandatory deposit & refunds (§7) — see AUCTION_DEPOSIT_RULES.md / REFUND_WORKFLOW.md
R-E1 positive deposit on every auction, no disable switch, DB + server enforced · R-E2 11-step bidder workflow ·
R-E3 one deposit per user per auction · R-E4 full refunds for all eligible non-winners · R-E5 winner adjustment exactly once ·
R-E6 default handling only per legally approved policy · R-E7 idempotent refund engine w/ retries & reconciliation ·
R-E8 14 explicit statuses + valid transitions · R-E9 My Auction Deposits page · R-E10 refund notifications (☑ Phase 8). Status: ☐ all

## F. Accounts, dashboards, sellers, admin (§9–§11)
R-F1 auth: register/login/logout/email+phone verify/reset/sessions/profile/deletion · R-F2 bidder & seller KYC ·
R-F3 unified dashboard (Overview / PoolX / Auction / Shared) w/o mixed balances · R-F4 seller portal (toggleable) ·
R-F5 Super Admin dashboards with separated metrics · R-F6 RBAC 11 roles, configurable permissions, MFA for staff ·
R-F7 user management · R-F8 deposit admin module. Status: ☐ all

## G. Payments & finance (§12)
R-G1 provider abstraction, India provider, signed webhooks, refunds, reconciliation ⚑ OD-02 ·
R-G2 separate domains · R-G3 double-entry ledger, paise integers · R-G4 no wallet / holding funds without approval ⚑ OD-03 ·
R-G5 no live payments before credentials, webhooks, legal review, settlement arrangement ⚑

## H. Notifications, search (§15–§16)
R-H1 central notification service, PoolX + Auction event lists, in-app + email (+SMS/WhatsApp when configured), preferences, delivery tracking — ◐ built (Phase 8); e-mail provider / SMS / WhatsApp pending OD-07 ·
R-H2 PoolX + Auction search with filters/sort/pagination/empty states — ☑ per module, plus combined `/search` (TD-78)

## I. Non-functional (§17–§21, §25, Appendix A/B)
R-I1 Security controls list §17 + OWASP ASVS 5.0.0 baseline → SECURITY_CHECKLIST.md ·
R-I2 SEO §18 (metadata, canonical, OG/Twitter, favicons, robots, sitemap, manifest, JSON-LD, breadcrumbs, 404/500, noindex private) ·
R-I3 GA4 + Search Console w/ consent; no sensitive data to analytics ·
R-I4 WCAG 2.2 AA, 6 breakpoint ranges, no horizontal overflow ·
R-I5 Reliability: error boundaries, loading/empty states, duplicate-submit prevention, health check, monitoring ·
R-I6 CWV: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 (measured) ·
R-I7 Backups, restore test, rollback ·
R-I8 Legal pages incl. Refund & Cancellation, Shipping, Cookie, Disclaimer — owner/legal review ⚑

## J. Process (§22–§24, §28)
R-J1 continuity docs maintained each session · R-J2 phased roadmap 0–10 · R-J3 20 mandatory auction acceptance tests automated · R-J4 command vocabulary (START…RELEASE)

## K. Business rules (§26) — all 20 rules are binding; they are encoded as invariants in AUCTION_DEPOSIT_RULES.md, FINANCIAL_ARCHITECTURE.md and ADMIN_PERMISSION_MATRIX.md.
