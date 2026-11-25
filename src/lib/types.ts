export type Role = "admin" | "member" | "viewer";

export type MasterCollection =
  | "expenseGroups"
  | "expenseSubGroups"
  | "expenseIncludes"
  | "incomeGroups"
  | "incomeSubGroups"
  | "investmentGroups"
  | "investmentSubGroups"
  | "paymentSources";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  familyId: string;
  role: Role;
}

export interface MasterItem {
  id: string;
  name: string;
  /** For sub-groups: id of the parent group. */
  parentId?: string | null;
  /** For payment sources: Cash / Bank / Credit Card / Wallet / UPI */
  kind?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = "income" | "expense" | "investment";

/** Optional essential / discretionary tag (offered for Outside food). */
export type Necessity = "essential" | "discretionary";

export interface Transaction {
  id: string;
  date: string; // yyyy-MM-dd
  type: TransactionType;
  groupId: string;
  subGroupId: string | null;
  /** Third master level: the specific item included in the sub group. */
  includesId?: string | null;
  necessity?: Necessity | null;
  paymentSourceId: string;
  amount: number;
  remarks: string;
  createdBy: string;
  /** Denormalised display name of the person the entry belongs to. */
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string; // uid
  email?: string | null;
  displayName?: string | null;
  role?: Role;
}

/** A monthly budget preset for one group (expense or income). */
export interface Budget {
  id: string;
  /** yyyy-MM */
  period: string;
  type: TransactionType;
  groupId: string;
  amount: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const MASTER_LABELS: Record<MasterCollection, { title: string; singular: string }> = {
  expenseGroups: { title: "Expense Groups", singular: "Expense Group" },
  expenseSubGroups: { title: "Expense Sub Groups", singular: "Expense Sub Group" },
  expenseIncludes: { title: "Includes", singular: "Includes Item" },
  incomeGroups: { title: "Income Groups", singular: "Income Group" },
  incomeSubGroups: { title: "Income Sub Groups", singular: "Income Sub Group" },
  investmentGroups: { title: "Investment Groups", singular: "Investment Group" },
  investmentSubGroups: { title: "Investment Sub Groups", singular: "Investment Sub Group" },
  paymentSources: { title: "Payment Sources", singular: "Payment Source" },
};

export const MASTER_SLUGS: Record<string, MasterCollection> = {
  "expense-groups": "expenseGroups",
  "expense-sub-groups": "expenseSubGroups",
  includes: "expenseIncludes",
  "income-groups": "incomeGroups",
  "income-sub-groups": "incomeSubGroups",
  "investment-groups": "investmentGroups",
  "investment-sub-groups": "investmentSubGroups",
  "payment-sources": "paymentSources",
};
/**
 * A rule that creates the same entry every month (EMI, rent, SIP, salary).
 * Each month's entry is stored with the id `rec-<ruleId>-<yyyy-MM>`, so posting
 * the same month twice, from any device, can never create a duplicate.
 */
export interface RecurringRule {
  id: string;
  name: string;
  type: TransactionType;
  groupId: string;
  subGroupId: string | null;
  paymentSourceId: string;
  amount: number;
  remarks: string;
  /** 1-31; months that are shorter post on their last day. */
  dayOfMonth: number;
  /** yyyy-MM: first month to post. */
  startPeriod: string;
  /** yyyy-MM: last month to post, or null for no end. */
  endPeriod: string | null;
  /** Months the family chose not to post. */
  skipped: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A loan tracked on the Net Worth page. EMIs are matched by sub group name. */
export interface Loan {
  id: string;
  name: string;
  /** Sub group under the "Loans" expense group that its payments use. */
  subGroupName: string;
  principal: number;
  /** Annual rate as a fraction, e.g. 0.0999 for 9.99%. */
  annualRate: number;
  /** yyyy-MM-dd: balance baseline. */
  startDate: string;
  /** emi: monthly interest per payment; daily: interest on the daily balance. */
  method: "emi" | "daily";
  note: string;
  createdAt?: string;
  updatedAt?: string;
}
