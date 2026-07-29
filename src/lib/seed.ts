import type { MasterCollection } from "./types";

/**
 * Initial master data. This is used ONLY to seed a brand new family in the
 * data store (Firestore or local fallback). Nothing in the UI reads these
 * values directly — all dropdowns are driven by the stored masters.
 */
export const SEED_EXPENSE_GROUPS: Record<string, string[]> = {
  Food: [
    "Home Food",
    "Outside Food",
    "Groceries",
    "Milk & Curd",
    "Vegetables",
    "Fruits",
    "Bakery",
    "Snacks",
    "Tea & Coffee",
    "Swiggy",
    "Zomato",
    "Restaurant",
  ],
  Transportation: ["Fuel", "Metro", "Bus", "Cab", "Parking", "Vehicle Service"],
  Utilities: ["Electricity", "Water", "Internet", "Mobile Recharge", "Gas"],
  Medical: ["Doctor", "Medicines", "Lab Tests", "Hospital"],
  Shopping: ["Clothing", "Electronics", "Home Needs"],
  Entertainment: ["Streaming", "Movies", "Events"],
  Travel: ["Flights", "Hotels", "Local Travel"],
  Insurance: ["Health Insurance", "Life Insurance", "Vehicle Insurance"],
  EMI: ["Home Loan", "Vehicle Loan", "Personal Loan"],
  Education: ["School Fees", "Books", "Courses"],
  "Personal Care": ["Salon", "Cosmetics", "Fitness"],
  Family: ["Household Help", "Children", "Parents"],
  Gifts: ["Festival Gifts", "Donations"],
  Miscellaneous: ["Other"],
};

export const SEED_INCOME_GROUPS: Record<string, string[]> = {
  Salary: ["Salary", "Bonus", "Reimbursement"],
  "Professional Income": [
    "Audit",
    "GST",
    "Income Tax Return",
    "ROC",
    "Consultancy",
    "Certification",
  ],
  "Investment Income": ["Dividend", "Interest", "Capital Gain"],
  Refunds: ["Tax Refund", "Purchase Refund"],
  "Other Income": ["Other"],
};

export const SEED_PAYMENT_SOURCES: { name: string; kind: string }[] = [
  { name: "Cash", kind: "Cash" },
  { name: "ICICI Savings", kind: "Bank Account" },
  { name: "AU Bank", kind: "Bank Account" },
  { name: "Axis Airtel", kind: "Bank Account" },
  { name: "ICICI Credit Card", kind: "Credit Card" },
  { name: "Amazon ICICI Card", kind: "Credit Card" },
  { name: "Swiggy HDFC Card", kind: "Credit Card" },
  { name: "Paytm Wallet", kind: "Wallet" },
  { name: "UPI", kind: "UPI" },
];

export const PAYMENT_SOURCE_KINDS = [
  "Cash",
  "Bank Account",
  "Credit Card",
  "Wallet",
  "UPI",
] as const;

export type SeedRow = {
  collection: MasterCollection;
  name: string;
  parentName?: string;
  kind?: string;
};

export function buildSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const [group, subs] of Object.entries(SEED_EXPENSE_GROUPS)) {
    rows.push({ collection: "expenseGroups", name: group });
    subs.forEach((s) =>
      rows.push({ collection: "expenseSubGroups", name: s, parentName: group }),
    );
  }
  for (const [group, subs] of Object.entries(SEED_INCOME_GROUPS)) {
    rows.push({ collection: "incomeGroups", name: group });
    subs.forEach((s) => rows.push({ collection: "incomeSubGroups", name: s, parentName: group }));
  }
  SEED_PAYMENT_SOURCES.forEach((p) =>
    rows.push({ collection: "paymentSources", name: p.name, kind: p.kind }),
  );
  return rows;
}