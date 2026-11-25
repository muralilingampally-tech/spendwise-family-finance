import { toLocalISODate } from "./format";
import type { RecurringRule, Transaction } from "./types";

/** How far back missed months are offered, so a forgotten rule can't flood the list. */
export const CATCH_UP_MONTHS = 12;

export interface Occurrence {
  rule: RecurringRule;
  /** yyyy-MM */
  period: string;
  /** yyyy-MM-dd */
  date: string;
  /** Deterministic transaction id for this rule and month. */
  id: string;
}

export const occurrenceId = (ruleId: string, period: string) => `rec-${ruleId}-${period}`;

const addMonths = (period: string, n: number) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** The posting date for a rule in a month, clamped to the month's last day. */
export function occurrenceDate(dayOfMonth: number, period: string) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return toLocalISODate(new Date(y, m - 1, Math.min(Math.max(1, dayOfMonth), last)));
}

/**
 * Months that should have an entry by `today` but don't: the posting date has
 * arrived, the month is inside the rule's range and not skipped, and no entry
 * with the month's deterministic id exists. Oldest first.
 */
export function dueOccurrences(
  rules: RecurringRule[],
  transactions: Pick<Transaction, "id">[],
  today: string,
): Occurrence[] {
  const existing = new Set(transactions.map((t) => t.id));
  const current = today.slice(0, 7);
  const earliest = addMonths(current, -(CATCH_UP_MONTHS - 1));
  const due: Occurrence[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    const skipped = new Set(rule.skipped ?? []);
    let period = rule.startPeriod > earliest ? rule.startPeriod : earliest;
    for (; period <= current; period = addMonths(period, 1)) {
      if (rule.endPeriod && period > rule.endPeriod) break;
      if (skipped.has(period)) continue;
      const date = occurrenceDate(rule.dayOfMonth, period);
      if (date > today) continue;
      const id = occurrenceId(rule.id, period);
      if (!existing.has(id)) due.push({ rule, period, date, id });
    }
  }
  return due.sort((a, b) => a.date.localeCompare(b.date) || a.rule.name.localeCompare(b.rule.name));
}

/** The transaction to store for an occurrence. */
export function occurrenceTransaction(
  o: Occurrence,
  by: { uid: string; name: string },
  nowIso: string,
): Transaction {
  return {
    id: o.id,
    date: o.date,
    type: o.rule.type,
    groupId: o.rule.groupId,
    subGroupId: o.rule.subGroupId,
    includesId: null,
    necessity: null,
    paymentSourceId: o.rule.paymentSourceId,
    amount: o.rule.amount,
    remarks: o.rule.remarks || o.rule.name,
    createdBy: by.uid,
    createdByName: by.name,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
