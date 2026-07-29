export type Role = "admin" | "member" | "viewer";

export type MasterCollection =
  | "expenseGroups"
  | "expenseSubGroups"
  | "incomeGroups"
  | "incomeSubGroups"
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

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  date: string; // yyyy-MM-dd
  type: TransactionType;
  groupId: string;
  subGroupId: string | null;
  paymentSourceId: string;
  amount: number;
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const MASTER_LABELS: Record<MasterCollection, { title: string; singular: string }> = {
  expenseGroups: { title: "Expense Groups", singular: "Expense Group" },
  expenseSubGroups: { title: "Expense Sub Groups", singular: "Expense Sub Group" },
  incomeGroups: { title: "Income Groups", singular: "Income Group" },
  incomeSubGroups: { title: "Income Sub Groups", singular: "Income Sub Group" },
  paymentSources: { title: "Payment Sources", singular: "Payment Source" },
};

export const MASTER_SLUGS: Record<string, MasterCollection> = {
  "expense-groups": "expenseGroups",
  "expense-sub-groups": "expenseSubGroups",
  "income-groups": "incomeGroups",
  "income-sub-groups": "incomeSubGroups",
  "payment-sources": "paymentSources",
};