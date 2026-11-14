# Bug Tracker

| ID | Date | Severity | Area | Description | Repro | Status |
|---|---|---|---|---|---|---|
| BUG-001 | 2026-11-14 | Medium | Account (mobile) | Every `/account` page scrolled horizontally on phones: the account menu's grid cell had no `min-w-0`, so its tab row widened the page (684 px at a 375 px viewport). | Open any `/account` page at 375 px width | Fixed (Phase 8): `min-w-0` on the account nav; checked in the browser at 375 px |
| BUG-002 | 2026-11-14 | Low | Notifications (mobile) | Notification settings table: `<fieldset>` minimum content width plus a 34rem table minimum forced overflow. | `/account/notifications/preferences` at 375 px | Fixed (Phase 8): `min-w-0` fieldset, smaller table minimum |
