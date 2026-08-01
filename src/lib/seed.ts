import type { MasterCollection } from "./types";

/**
 * Initial master data (Master_Index). Used ONLY to seed the data store; all
 * dropdowns read the stored masters, never these constants.
 *
 * Structure: Expense Group > Sub Group > Includes (optional third level).
 */
export const SEED_EXPENSE_TREE: Record<string, Record<string, string[]>> = {
  "Home food": {
    Staples: [
      "Nuts & Dates",
      "Seeds",
      "Coffee & Tea powder",
      "Sugar",
      "Zero calorie sugar",
      "Salt",
      "Oil",
      "Masalas",
      "Other",
    ],
    Vegetables: [],
    Fruits: [],
    "Milk and Curd": [],
    Eggs: [],
    Snacks: [],
    "Pulses and Other": ["Pulses", "Soya chunks", "Paneer", "Other"],
    Flours: [],
    "Other drinks": ["Chamomile tea", "Green tea"],
  },
  "Outside food": {
    "Food order": ["Food", "Munchies", "Chocolates", "Ice creams", "Bakery items"],
    "Tea & Coffee": [],
    Snacks: [],
    "Restaurant/Dine out": ["Bakery items"],
    Beverages: ["Soft drink", "Sugary drinks"],
  },
  "Household Maintenance": {
    Cleaning: ["Washroom", "Home", "Kitchen"],
    Washing: ["Detergent", "Comfort"],
    Maintenance: [],
  },
  "Non-Veg": {
    Fish: [],
    Chicken: [],
    Mutton: [],
    Other: [],
  },
  Clothing: {
    Murali: [],
    Rajeshwari: [],
  },
  Healthcare: {
    Medicines: [],
    "Lab Investigations": [],
    Consultations: [],
    Supplements: ["Zinc", "Vitamin D", "B12", "Magnesium", "Protein", "Omega 3"],
  },
  "Personal care": {
    "Hair Care": [],
    "Hair Oil": [],
    "Skin Care": [],
    Grooming: [],
  },
  Transportation: {
    "Car Fuel": [],
    "Bike Fuel": [],
    "Car Maintenance": ["Servicing", "Washing", "Tolls"],
    "Bike Maintenance": [],
    "Metro/Bus": [],
    "Cab/Bike": [],
  },
  Upskill: {
    Books: [],
    Courses: [],
    Certifications: [],
  },
  Electronics: {
    "Bluetooth Devices/Sound": [],
    "Other Accessories": [],
    Bedroom: [],
    Kitchen: [],
    Office: [],
  },
  Utilities: {
    "Mobile recharge": [],
    "DTH/Internet": [],
    Electricity: [],
    Water: [],
    "Rent and Maintenance": [],
    Gas: [],
  },
  Subscriptions: {
    OTT: [],
    "Youtube premium": [],
    "Kindle/Magazine": [],
    "ChatGPT/Gemini/Grok/Claude": [],
    "Other AI productivity tools": [],
  },
  Entertainment: {
    Movies: [],
    Amusement: [],
    Outings: [],
    Gaming: [],
  },
  Loans: {
    "Personal Loan": [],
    "Gold Loan": [],
    "Home Loan": [],
  },
  Insurance: {
    "Health insurance": ["Parents", "Self"],
    "Life insurance": ["Self"],
  },
};

/** Expense groups where the essential / discretionary tag is offered. */
export const NECESSITY_GROUPS = ["Outside food"];

export const SEED_INCOME_GROUPS: Record<string, string[]> = {
  Income: [
    "Salary",
    "Audit fees (Tax audit)",
    "Certifications",
    "ITR/GST",
    "Other Income",
  ],
};

export const SEED_INVESTMENT_GROUPS: Record<string, string[]> = {
  Investments: ["Amount Invested", "Amount Realized"],
};

export const SEED_PAYMENT_SOURCES: { name: string; kind: string }[] = [
  { name: "ICICI-CC(MK)", kind: "Credit Card" },
  { name: "ICICI-CC(RG)", kind: "Credit Card" },
  { name: "Amazon Card", kind: "Credit Card" },
  { name: "Swiggy Card", kind: "Credit Card" },
  { name: "Axis Card", kind: "Credit Card" },
  { name: "ICICI-MK", kind: "Bank Account" },
  { name: "ICICI-RG", kind: "Bank Account" },
  { name: "SBI-MK", kind: "Bank Account" },
  { name: "SBI-RG", kind: "Bank Account" },
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
  /** `${parentCollection}:${parentName}` — resolved after parents are created. */
  parentKey?: string;
  kind?: string;
};

/** Bumped whenever the seed structure changes; triggers a one-time reseed. */
export const SEED_VERSION = 2;

export function buildSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [];

  for (const [group, subs] of Object.entries(SEED_EXPENSE_TREE)) {
    rows.push({ collection: "expenseGroups", name: group });
    for (const [sub, includes] of Object.entries(subs)) {
      rows.push({
        collection: "expenseSubGroups",
        name: sub,
        parentKey: `expenseGroups:${group}`,
      });
      includes.forEach((item) =>
        rows.push({
          collection: "expenseIncludes",
          name: item,
          parentKey: `expenseSubGroups:${group} › ${sub}`,
        }),
      );
    }
  }

  for (const [group, subs] of Object.entries(SEED_INCOME_GROUPS)) {
    rows.push({ collection: "incomeGroups", name: group });
    subs.forEach((s) =>
      rows.push({ collection: "incomeSubGroups", name: s, parentKey: `incomeGroups:${group}` }),
    );
  }

  for (const [group, subs] of Object.entries(SEED_INVESTMENT_GROUPS)) {
    rows.push({ collection: "investmentGroups", name: group });
    subs.forEach((s) =>
      rows.push({
        collection: "investmentSubGroups",
        name: s,
        parentKey: `investmentGroups:${group}`,
      }),
    );
  }

  SEED_PAYMENT_SOURCES.forEach((p) =>
    rows.push({ collection: "paymentSources", name: p.name, kind: p.kind }),
  );

  return rows;
}
