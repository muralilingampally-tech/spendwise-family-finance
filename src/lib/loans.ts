import type { MasterItem, Transaction } from "./types";

/** Loan definitions (from the family's Loans sheet). EMIs are expense entries
 * under the "Loans" group, matched to a loan by its sub group name. */
export interface LoanDef {
  id: string;
  name: string;
  subGroupName: string;
  principal: number;
  annualRate: number;
  startDate: string; // yyyy-MM-dd, balance baseline
  method: "emi" | "daily";
  note: string;
}

export const LOANS: LoanDef[] = [
  {
    id: "personal",
    name: "Personal Loan",
    subGroupName: "Personal Loan",
    principal: 1500000,
    annualRate: 0.0999,
    startDate: "2026-10-10",
    method: "emi",
    note: "72 EMIs of ₹27,781 from 10 Nov 2026 · 9.99% p.a.",
  },
  {
    id: "gold",
    name: "Gold Loan",
    subGroupName: "Gold Loan",
    principal: 444600,
    annualRate: 0.0915,
    startDate: "2026-10-10",
    method: "daily",
    note: "Bullet repayment in 12 months · 9.15% p.a. on daily balance",
  },
];

const DAY = 86400000;
const days = (a: string, b: string) =>
  Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));

export interface LoanStatus {
  loan: LoanDef;
  paid: number;
  principalPaid: number;
  interestPaid: number;
  accrued: number;
  outstanding: number;
  payments: Transaction[];
}

export function loanPayments(
  loan: LoanDef,
  txns: Transaction[],
  groups: MasterItem[],
  subGroups: MasterItem[],
) {
  const groupIds = new Set(
    groups.filter((g) => g.name.trim().toLowerCase() === "loans").map((g) => g.id),
  );
  const subIds = new Set(
    subGroups
      .filter(
        (s) =>
          groupIds.has(s.parentId ?? "") &&
          s.name.trim().toLowerCase() === loan.subGroupName.toLowerCase(),
      )
      .map((s) => s.id),
  );
  return txns
    .filter((t) => t.type === "expense" && t.subGroupId && subIds.has(t.subGroupId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Outstanding as on `asOf`. Payments go to interest first, then principal.
 * EMI loans charge monthly interest (rate/12) per payment; daily loans accrue
 * interest on the daily closing balance (rate/365). */
export function loanStatus(loan: LoanDef, payments: Transaction[], asOf: string): LoanStatus {
  let bal = loan.principal;
  let accrued = 0;
  let principalPaid = 0;
  let interestPaid = 0;
  let last = loan.startDate;
  const used = payments.filter((p) => p.date <= asOf);
  for (const p of used) {
    const amt = Number(p.amount) || 0;
    let interest: number;
    if (loan.method === "emi") {
      interest = bal * (loan.annualRate / 12);
    } else {
      interest = accrued + bal * (loan.annualRate / 365) * days(last, p.date);
      if (p.date > last) last = p.date;
    }
    const toInterest = Math.min(amt, interest);
    const toPrincipal = Math.min(bal, amt - toInterest);
    interestPaid += toInterest;
    principalPaid += toPrincipal;
    bal -= toPrincipal;
    accrued = loan.method === "daily" ? interest - toInterest : 0;
  }
  if (loan.method === "daily" && asOf > last) {
    accrued += bal * (loan.annualRate / 365) * days(last, asOf);
  }
  return {
    loan,
    paid: used.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    principalPaid,
    interestPaid,
    accrued,
    outstanding: bal + accrued,
    payments: used,
  };
}
