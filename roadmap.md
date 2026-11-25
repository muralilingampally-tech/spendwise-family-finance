# Entry speed
- [x] Remove full-family reloads after transaction writes and narrow entry-page subscriptions.
- [x] Verify successful and failed saves, edits, deletes, and imports with targeted tests.
# Data safety
- [x] Seed upgrades add missing starter masters and never delete entries, budgets or custom masters.
- [x] JSON backup download and idempotent restore (by original id) in Settings, with tests.

# Everyday safety and speed
- [x] Masters and budgets update in memory after confirmed writes (no full-family reloads); "Save all" is one batch.
- [x] Duplicate-master merge runs in the background after load instead of blocking sign-in.
- [x] Deleting an entry offers Undo (restored under the same id); delete errors are shown.
- [x] Import skips rows already saved (one-to-one match) after confirmation; partial failures say how many saved.
- [x] Masters still used by entries, budgets or sub items cannot be deleted; others ask for confirmation.
- [x] Budget: copy last month's budgets as drafts; save errors are shown.
- [x] New entries remember the last type and payment source on this device.
- [x] Installable on phones: web manifest, icons, theme colour.
- [x] Tests for loan maths, date parsing, duplicate detection and master usage.

# Next
- [ ] Read roles from Firestore (everyone is currently admin) — needs a decision on who can delete.
- [ ] Firestore rules: validate transaction shape on write (needs `firebase deploy`).
- [ ] Live sync between family members (onSnapshot).
- [ ] Recurring entries (EMIs, rent, SIPs) and loans managed in-app instead of hard-coded.
