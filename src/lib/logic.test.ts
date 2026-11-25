/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { normalizeDate, previousPeriod } from "./format";
import { LEGACY_LOANS as LOANS, loanStatus } from "./loans";
import { findSavedDuplicates } from "./duplicates";
import { masterUsage, usageBlocker } from "./masterUsage";
import { dueOccurrences, occurrenceDate, occurrenceId, occurrenceTransaction } from "./recurring";
import type { MasterCollection, MasterItem, Transaction } from "./types";

const txn = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: "2026-11-10",
  type: "expense",
  groupId: "g",
  subGroupId: null,
  paymentSourceId: "p",
  amount: 100,
  remarks: "",
  createdBy: "u",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("normalizeDate", () => {
  test.each([
    ["2026-11-08", "2026-11-08"],
    ["08/11/2026", "2026-11-08"], // day-first (Indian convention)
    ["12/31/2026", "2026-12-31"], // month-first only when day-first is impossible
    ["31 Jul 2026", "2026-07-31"],
    ["Jul 31, 2026", "2026-07-31"],
    ["31-Jul-26", "2026-07-31"],
    ["2026-11-08T18:30:00Z", "2026-11-08"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  test("rejects impossible dates instead of rolling them over", () => {
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeDate("2026-13-01")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });

  test("reads Excel serial numbers", () => {
    expect(normalizeDate(46000)).toBe("2025-12-09");
  });
});

describe("previousPeriod", () => {
  test("steps back a month, across the year boundary", () => {
    expect(previousPeriod("2026-11")).toBe("2026-10");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
});

describe("loanStatus", () => {
  const personal = LOANS.find((l) => l.id === "personal")!;
  const gold = LOANS.find((l) => l.id === "gold")!;

  test("an EMI pays a month's interest first, the rest reduces principal", () => {
    const s = loanStatus(personal, [txn({ amount: 27781, date: "2026-11-10" })], "2026-11-30");
    const interest = personal.principal * (personal.annualRate / 12);
    expect(s.interestPaid).toBeCloseTo(interest, 2);
    expect(s.principalPaid).toBeCloseTo(27781 - interest, 2);
    expect(s.outstanding).toBeCloseTo(personal.principal - (27781 - interest), 2);
  });

  test("payments after the as-of date are ignored", () => {
    const s = loanStatus(personal, [txn({ amount: 27781, date: "2026-12-10" })], "2026-11-30");
    expect(s.paid).toBe(0);
    expect(s.outstanding).toBe(personal.principal);
  });

  test("a daily-interest loan accrues on the daily balance with no payments", () => {
    const s = loanStatus(gold, [], "2026-11-09"); // 30 days after the 10 Oct start
    const accrued = gold.principal * (gold.annualRate / 365) * 30;
    expect(s.accrued).toBeCloseTo(accrued, 2);
    expect(s.outstanding).toBeCloseTo(gold.principal + accrued, 2);
  });

  test("a part payment on a daily loan clears accrued interest before principal", () => {
    const accrued = gold.principal * (gold.annualRate / 365) * 30;
    const s = loanStatus(gold, [txn({ amount: 10000, date: "2026-11-09" })], "2026-11-09");
    expect(s.interestPaid).toBeCloseTo(accrued, 2);
    expect(s.principalPaid).toBeCloseTo(10000 - accrued, 2);
    expect(s.accrued).toBeCloseTo(0, 6);
  });
});

describe("findSavedDuplicates", () => {
  const tea = {
    date: "2026-11-08",
    type: "expense" as const,
    groupId: "food",
    paymentSourceId: "cash",
    amount: 20,
    remarks: "Tea",
  };

  test("flags rows already saved, ignoring remark case and spacing", () => {
    expect(
      findSavedDuplicates(
        [tea],
        [
          { ...tea, remarks: " tea " },
          { ...tea, amount: 25 },
        ],
      ),
    ).toEqual([0]);
  });

  test("matches one-to-one, so genuine repeats in a file survive", () => {
    expect(findSavedDuplicates([tea, tea], [tea, tea, tea])).toEqual([0, 1]);
  });

  test("a different sub group or payment source is a different entry", () => {
    expect(
      findSavedDuplicates(
        [tea],
        [
          { ...tea, subGroupId: "x" },
          { ...tea, paymentSourceId: "upi" },
        ],
      ),
    ).toEqual([]);
  });
});

describe("masterUsage", () => {
  const item = (id: string, parentId: string | null = null): MasterItem => ({
    id,
    name: id,
    parentId,
    active: true,
    createdAt: "",
    updatedAt: "",
  });
  const masters = {
    expenseGroups: [item("food")],
    expenseSubGroups: [item("outside", "food")],
    expenseIncludes: [],
    incomeGroups: [],
    incomeSubGroups: [],
    investmentGroups: [],
    investmentSubGroups: [],
    paymentSources: [item("cash")],
  } as Record<MasterCollection, MasterItem[]>;
  const budgets = [
    {
      id: "b",
      period: "2026-11",
      type: "expense" as const,
      groupId: "food",
      amount: 1,
      createdAt: "",
      updatedAt: "",
    },
  ];

  test("counts transactions, budgets and sub items pointing at a master", () => {
    const transactions = [
      txn({ groupId: "food", paymentSourceId: "cash" }),
      txn({ groupId: "food" }),
    ];
    expect(masterUsage("food", transactions, budgets, masters)).toEqual({
      transactions: 2,
      budgets: 1,
      children: 1,
    });
    expect(masterUsage("cash", transactions, budgets, masters)).toEqual({
      transactions: 1,
      budgets: 0,
      children: 0,
    });
  });

  test("explains why a used master cannot be deleted, and allows unused ones", () => {
    expect(usageBlocker("Food", { transactions: 2, budgets: 1, children: 0 })).toBe(
      '"Food" is used by 2 transactions, 1 budget. Move or delete those first, or rename it instead.',
    );
    expect(usageBlocker("Spare", { transactions: 0, budgets: 0, children: 0 })).toBeNull();
  });
});

describe("recurring entries", () => {
  const rule = {
    id: "rent",
    name: "Rent",
    type: "expense" as const,
    groupId: "home",
    subGroupId: null,
    paymentSourceId: "bank",
    amount: 18000,
    remarks: "",
    dayOfMonth: 5,
    startPeriod: "2026-09",
    endPeriod: null,
    skipped: [] as string[],
    active: true,
    createdAt: "",
    updatedAt: "",
  };

  test("lists every unposted month up to today, oldest first", () => {
    const due = dueOccurrences([rule], [], "2026-11-25");
    expect(due.map((o) => o.date)).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
    expect(due[0].id).toBe("rec-rent-2026-09");
  });

  test("this month is not due before its day", () => {
    expect(dueOccurrences([rule], [], "2026-11-04").map((o) => o.period)).toEqual([
      "2026-09",
      "2026-10",
    ]);
  });

  test("posted, skipped and out-of-range months are not due", () => {
    const posted = [{ id: occurrenceId("rent", "2026-09") }];
    const r = { ...rule, skipped: ["2026-10"], endPeriod: "2026-10" };
    expect(dueOccurrences([r], posted, "2026-11-25")).toEqual([]);
    expect(dueOccurrences([{ ...rule, active: false }], [], "2026-11-25")).toEqual([]);
  });

  test("catch-up is limited to the last 12 months", () => {
    const due = dueOccurrences([{ ...rule, startPeriod: "2020-01" }], [], "2026-11-25");
    expect(due).toHaveLength(12);
    expect(due[0].period).toBe("2025-12");
  });

  test("short months post on their last day", () => {
    expect(occurrenceDate(31, "2026-02")).toBe("2026-02-28");
    expect(occurrenceDate(31, "2028-02")).toBe("2028-02-29");
    expect(occurrenceDate(31, "2026-04")).toBe("2026-04-30");
  });

  test("the posted entry carries the rule's details and its deterministic id", () => {
    const [o] = dueOccurrences([rule], [], "2026-09-30");
    const t = occurrenceTransaction(o, { uid: "u", name: "Me" }, "now");
    expect(t).toMatchObject({
      id: "rec-rent-2026-09",
      date: "2026-09-05",
      amount: 18000,
      groupId: "home",
      paymentSourceId: "bank",
      remarks: "Rent",
      createdBy: "u",
    });
  });
});
