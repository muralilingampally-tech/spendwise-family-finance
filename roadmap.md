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
- [x] Tab switching keeps the sidebar and header mounted; charts mount after the first paint.

# Family collaboration and automation
- [x] Real roles (admin / member / viewer) read from Firestore and never overwritten on sign-in; admins manage them in Settings.
- [x] Firestore rules validate every write and enforce roles server-side; 15 emulator tests in `firestore-tests/`.
- [x] Live sync of transactions and budgets between family members (verified against the emulator).
- [x] Recurring entries (rent, EMIs, SIPs, salary) with idempotent monthly posting, skip, and 12-month catch-up.
- [x] Loans managed in the app (moved once from the old hard-coded list).

# Next
- [ ] Deploy `firestore.rules` (`firebase deploy --only firestore:rules`).
- [ ] Monthly net-worth trend chart.
- [ ] Savings goals with progress.
