# Bug Tracker

| ID | Date | Severity | Area | Description | Repro | Status |
|---|---|---|---|---|---|---|
| BUG-001 | 2026-11-14 | Medium | Account (mobile) | Every `/account` page scrolled horizontally on phones: the account menu's grid cell had no `min-w-0`, so its tab row widened the page (684 px at a 375 px viewport). | Open any `/account` page at 375 px width | Fixed (Phase 8): `min-w-0` on the account nav; checked in the browser at 375 px |
| BUG-002 | 2026-11-14 | Low | Notifications (mobile) | Notification settings table: `<fieldset>` minimum content width plus a 34rem table minimum forced overflow. | `/account/notifications/preferences` at 375 px | Fixed (Phase 8): `min-w-0` fieldset, smaller table minimum |
| BUG-003 | 2026-11-14 | Medium | Admin (mobile) | `/admin/sellers` was 188 px wider than a 320 px screen: the screen-reader-only labels inside the scrolling table are absolutely positioned and, with no positioned ancestor, escaped the scroll box. | `/admin/sellers` at 320 px | Fixed (Phase 9): every `overflow-x-auto` box is `relative`; sweep passes |
| BUG-004 | 2026-11-14 | Low | Admin (mobile) | `/admin/finance/ledger` journal entry tables (long monospace account names) were 21 px too wide at 320 px. | `/admin/finance/ledger` at 320 px | Fixed (Phase 9): entry tables wrapped in a scroll box; sweep passes |
| BUG-005 | 2026-11-14 | Medium | Accessibility (dark mode) | Danger buttons (e.g. "Request account deletion") used white text on the dark-mode red `#f87171` — contrast 2.77:1. | `/account/delete` in dark mode | Fixed (Phase 9): `--color-danger-ink` token (white light / `#1f0707` dark, 6.95:1); dark-mode axe added to both sweeps |
