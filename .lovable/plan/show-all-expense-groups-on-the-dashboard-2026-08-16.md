# Show all expense groups on the dashboard

## Problem
The dashboard's "Expense by group (this month)" table only lists the top 6 groups by amount (`src/routes/index.tsx:115` slices the list). Smaller groups such as Non-Veg and Utilities fall off the list even though they have spend this month.

## Change
- Remove the top-6 cut so every expense group with spend this month is listed, sorted highest to lowest.
- Keep the section scrollable so a long list doesn't stretch the page, and keep the sticky header row.
- Add a total row at the bottom so the group amounts visibly add up to this month's total expense.
- No change to data, filters, or the current-month scope.

## Technical detail
Single file: `src/routes/index.tsx` — drop `.slice(0, 6)` from the `byCategory` memo and add a `<tfoot>` total to the existing table.
