# New master structure, investments, essential tags, income by person

## 1. Master data rebuilt from your sheet

Expense side becomes three levels: **Group > Sub Group > Includes**.

```text
Home food  >  Staples  >  Nuts & Dates | Seeds | Coffee & Tea powder | Sugar | ...
Outside food > Food order > Food | Munchies | Chocolates | Ice creams | Bakery items
```

- All 14 expense groups and their sub groups from Master_Index.xlsx replace the current list.
- The "Includes" column becomes a third, optional dropdown on the entry form (seeded from the sheet, editable in Masters like the others).
- Income sub groups replaced with: Salary, Audit fees (Tax audit), Certifications, ITR/GST, Other Income.
- Payment sources replaced with: ICICI-CC(MK), ICICI-CC(RG), Amazon Card, Swiggy Card, Axis Card, ICICI-MK, ICICI-RG, SBI-MK, SBI-RG.

## 2. Investments as a third type

- New type alongside Income and Expense, with group **Investments** and sub groups **Amount Invested** and **Amount Realized**.
- Entry form gets a third type toggle; investments are excluded from income/expense totals and shown as their own line in reports and on the dashboard.

## 3. Essential / Discretionary

- Optional tag that appears only when the selected group is **Outside food**.
- Stored on the transaction, shown as a column on Transactions, and usable as a group-by / filter in Reports so you can see how much outside-food spend was discretionary.

## 4. Dashboard: income by person

Total Income card shows the combined figure with a per-person breakdown under it:

```text
TOTAL INCOME            TOTAL EXPENSE
Rs 2,50,600.00          Rs 2,19,344.00
  Murali      1,80,000    Murali      1,40,000
  Rajeshwari    70,600    Rajeshwari    79,344
```

Names come from whoever the entry is attributed to.

## 5. Fresh start

Old masters and all existing transactions/budgets are cleared once after this change, then the new master set is seeded, so nothing points at deleted groups.

## Technical notes

- `src/lib/types.ts`: add `expenseIncludes`, `investmentGroups`, `investmentSubGroups` master collections; extend `TransactionType` with `investment`; add `includesId` and `necessity: "essential" | "discretionary" | null` to `Transaction`.
- `src/lib/seed.ts`: rewrite seed rows from the spreadsheet, including the third-level includes rows keyed by sub group.
- `src/lib/repo.ts`: extend `MASTER_COLLECTIONS`; add a one-time versioned reset (marker doc in `families/{id}/meta`) that deletes old masters/transactions/budgets, then reseeds.
- `src/routes/transactions.tsx`: type toggle with Investment, cascading Group > Sub Group > Includes selects, conditional necessity select, new table columns and filters.
- `src/routes/index.tsx`: per-person rows inside the income/expense summary cards.
- `src/routes/reports.tsx`: `includes` and `necessity` dimensions plus investment totals.
- `src/routes/masters.$type.tsx`: new tabs for Includes and Investment groups/sub groups, with parent resolution for the third level.
- `src/routes/budget.tsx`: budget rows follow the new expense groups automatically.