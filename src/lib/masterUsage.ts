import type { Budget, MasterCollection, MasterItem, Transaction } from "./types";

export interface MasterUsage {
  transactions: number;
  budgets: number;
  children: number;
}

/** How many records still point at a master (ids are unique across collections). */
export function masterUsage(
  id: string,
  transactions: Transaction[],
  budgets: Budget[],
  masters: Record<MasterCollection, MasterItem[]>,
): MasterUsage {
  return {
    transactions: transactions.filter(
      (t) =>
        t.groupId === id || t.subGroupId === id || t.includesId === id || t.paymentSourceId === id,
    ).length,
    budgets: budgets.filter((b) => b.groupId === id).length,
    children: Object.values(masters).reduce(
      (n, list) => n + list.filter((m) => m.parentId === id).length,
      0,
    ),
  };
}

/** A sentence explaining why the master cannot be deleted, or null if it is unused. */
export function usageBlocker(name: string, usage: MasterUsage): string | null {
  const parts = [
    usage.transactions && `${usage.transactions} transaction${usage.transactions === 1 ? "" : "s"}`,
    usage.budgets && `${usage.budgets} budget${usage.budgets === 1 ? "" : "s"}`,
    usage.children && `${usage.children} sub item${usage.children === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `"${name}" is used by ${parts.join(", ")}. Move or delete those first, or rename it instead.`;
}
