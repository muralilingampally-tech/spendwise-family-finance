import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { inr, shortDate, todayISO, toLocalISODate } from "@/lib/format";
import { signedInvestment } from "@/lib/investment";
import { LOANS, loanPayments, loanStatus } from "@/lib/loans";

export const Route = createFileRoute("/networth")({
  head: () => ({
    meta: [
      { title: "Net Worth & Loans — SpendWise" },
      { name: "description", content: "Family balance versus loan outstanding, as on any date." },
      { property: "og:title", content: "Net Worth & Loans — SpendWise" },
      { property: "og:description", content: "Balance on the plus side, each loan on the minus side." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NetWorthPage,
});

const monthEnd = (d = new Date()) => toLocalISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));

function NetWorthPage() {
  const { masters, transactions } = useApp();
  const [asOf, setAsOf] = useState(todayISO());
  const [open, setOpen] = useState<string | null>(null);

  const subName = useMemo(() => {
    const m = new Map<string, string>();
    masters.investmentSubGroups.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [masters]);

  const balance = useMemo(() => {
    let inc = 0, exp = 0, inv = 0;
    for (const t of transactions) {
      if (t.date > asOf) continue;
      const a = Number(t.amount) || 0;
      if (t.type === "income") inc += a;
      else if (t.type === "expense") exp += a;
      else inv += signedInvestment(subName.get(t.subGroupId ?? ""), a);
    }
    return { inc, exp, inv, total: inc - exp + inv };
  }, [transactions, asOf, subName]);

  const loans = useMemo(
    () =>
      LOANS.map((l) =>
        loanStatus(l, loanPayments(l, transactions, masters.expenseGroups, masters.expenseSubGroups), asOf),
      ),
    [transactions, masters, asOf],
  );
  const debt = loans.reduce((s, l) => s + l.outstanding, 0);

  return (
    <AppShell title="Net Worth">
      <div className="mb-5 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">As on</label>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setAsOf(todayISO())}>Today</Button>
        <Button variant="outline" size="sm" onClick={() => setAsOf(monthEnd())}>End of this month</Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card label="Balance (plus side)" value={inr(balance.total)} tone="text-primary" />
        <Card label="Loans outstanding" value={inr(-debt)} tone="text-destructive" />
        <Card label="Net worth" value={inr(balance.total - debt)} tone={balance.total - debt >= 0 ? "text-primary" : "text-destructive"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">Plus side</h2>
          <Row k="Income till date" v={inr(balance.inc)} />
          <Row k="Expenses till date" v={inr(-balance.exp)} />
          <Row k="Investments (net)" v={inr(balance.inv)} />
          <Row k="Balance" v={inr(balance.total)} bold />
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">Minus side — loans</h2>
          {loans.map((s) => (
            <div key={s.loan.id} className="border-b border-border py-2 last:border-0">
              <button className="flex w-full justify-between text-left" onClick={() => setOpen(open === s.loan.id ? null : s.loan.id)}>
                <span>
                  <span className="font-medium">{s.loan.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.loan.note}</span>
                </span>
                <span className="font-semibold text-destructive">{inr(-s.outstanding)}</span>
              </button>
              <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
                <span>Loan amount: {inr(s.loan.principal)}</span>
                <span>Paid: {inr(s.paid)} ({s.payments.length})</span>
                <span>Principal repaid: {inr(s.principalPaid)}</span>
                <span>Interest paid: {inr(s.interestPaid)}</span>
                {s.accrued > 0 && <span>Interest due: {inr(s.accrued)}</span>}
              </div>
              {open === s.loan.id && (
                <ul className="mt-2 space-y-1 text-xs">
                  {s.payments.length === 0 && <li className="text-muted-foreground">No payments under Loans › {s.loan.subGroupName} yet.</li>}
                  {s.payments.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>{shortDate(p.date)} {p.remarks}</span>
                      <span>{inr(Number(p.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <Row k="Total outstanding" v={inr(-debt)} bold />
        </section>
      </div>
    </AppShell>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${bold ? "mt-1 border-t border-border pt-2 font-semibold" : ""}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
