import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, PiggyBank, Scale } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { signedInvestment } from "@/lib/investment";
import { inr, monthKey, monthLabel, shortDate } from "@/lib/format";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — SpendWise" },
      {
        name: "description",
        content: "See income, expenses and balance at a glance with monthly and category charts.",
      },
      { property: "og:title", content: "Dashboard — SpendWise" },
      {
        property: "og:description",
        content: "Income, expense and balance overview for your family finances.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { transactions: allTransactions, masters, members, user } = useApp();

  const currentMonth = useMemo(() => monthKey(new Date().toISOString()), []);
  const transactions = useMemo(
    () => allTransactions.filter((t) => monthKey(t.date) === currentMonth),
    [allTransactions, currentMonth],
  );

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(masters)
      .flat()
      .forEach((m) => map.set(m.id, m.name));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [masters]);

  const memberName = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.displayName || m.email || "Member"));
    if (user) map.set(user.uid, user.displayName || user.email || "You");
    return (t: (typeof transactions)[number]) =>
      map.get(t.createdBy) || t.createdByName || "Unknown";
  }, [members, user, transactions]);

  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; Income: number; Expense: number; Investment: number }>();
    transactions.forEach((t) => {
      const name = memberName(t);
      const row = map.get(name) ?? { name, Income: 0, Expense: 0, Investment: 0 };
      if (t.type === "income") row.Income += Number(t.amount);
      else if (t.type === "investment")
        row.Investment += signedInvestment(nameOf(t.subGroupId), Number(t.amount));
      else row.Expense += Number(t.amount);
      map.set(name, row);
    });
    return [...map.values()].sort((a, b) => b.Income + b.Expense - (a.Income + a.Expense));
  }, [transactions, memberName, nameOf]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let investment = 0;
    transactions.forEach((t) => {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "investment")
        investment += signedInvestment(nameOf(t.subGroupId), Number(t.amount));
      else expense += Number(t.amount);
    });
    return { income, expense, investment, balance: income - expense + investment };
  }, [transactions, nameOf]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; Income: number; Expense: number }>();
    allTransactions.forEach((t) => {
      if (t.type === "investment") return;
      const k = monthKey(t.date);
      const row = map.get(k) ?? { month: k, Income: 0, Expense: 0 };
      if (t.type === "income") row.Income += Number(t.amount);
      else row.Expense += Number(t.amount);
      map.set(k, row);
    });
    return [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((r) => ({ ...r, month: monthLabel(r.month) }));
  }, [allTransactions]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => map.set(t.groupId, (map.get(t.groupId) ?? 0) + Number(t.amount)));
    return [...map.entries()]
      .map(([id, value]) => ({ name: nameOf(id), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions, nameOf]);

  return (
    <AppShell
      title={`Dashboard — ${monthLabel(currentMonth)}`}
      actions={
        <Button asChild size="sm">
          <Link to="/transactions">Add transaction</Link>
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Showing {monthLabel(currentMonth)} only. For other months or custom ranges, use{" "}
        <Link to="/reports" className="text-primary hover:underline">
          Reports
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Income"
          value={totals.income}
          icon={ArrowUpRight}
          tone="success"
          breakdown={byUser.map((r) => ({ name: r.name, value: r.Income }))}
        />
        <StatCard
          label="Total Expense"
          value={totals.expense}
          icon={ArrowDownRight}
          tone="destructive"
          breakdown={byUser.map((r) => ({ name: r.name, value: r.Expense }))}
        />
        <StatCard
          label="Investments (net)"
          value={totals.investment}
          icon={PiggyBank}
          tone="primary"
          breakdown={byUser.map((r) => ({ name: r.name, value: r.Investment }))}
        />
        <StatCard label="Balance" value={totals.balance} icon={Scale} tone="primary" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="card-surface p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">Monthly income vs expense (last 6 months)</h2>
          <div className="mt-4 h-72">
            {monthly.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={60} />
                  <Tooltip
                    formatter={(v: number) => inr(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Income" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Expense" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Expense by group (this month)</h2>
          <div className="mt-4 h-72 overflow-auto">
            {byCategory.length === 0 ? (
              <Empty />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Group</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((c) => (
                    <tr key={c.name} className="border-t border-border">
                      <td className="px-3 py-2.5">{c.name}</td>
                      <td className="num px-3 py-2.5 text-right font-medium">{inr(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">By user (this month)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">User</th>
                <th className="px-5 py-2.5 text-right font-medium">Income</th>
                <th className="px-5 py-2.5 text-right font-medium">Expense</th>
                <th className="px-5 py-2.5 text-right font-medium">Investments</th>
                <th className="px-5 py-2.5 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="px-5 py-3">{r.name}</td>
                  <td className="num px-5 py-3 text-right text-success">{inr(r.Income)}</td>
                  <td className="num px-5 py-3 text-right text-destructive">{inr(r.Expense)}</td>
                  <td className="num px-5 py-3 text-right">{inr(r.Investment)}</td>
                  <td className="num px-5 py-3 text-right font-medium">{inr(r.Income - r.Expense)}</td>
                </tr>
              ))}
              {byUser.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
            {byUser.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.income)}</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.expense)}</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.investment)}</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.balance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">Recent transactions (this month)</h2>
          <Link to="/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 font-medium">Category</th>
                <th className="px-5 py-2.5 font-medium">Source</th>
                <th className="px-5 py-2.5 font-medium">User</th>
                <th className="px-5 py-2.5 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 8).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-5 py-3 whitespace-nowrap">{shortDate(t.date)}</td>
                  <td className="px-5 py-3">
                    {nameOf(t.groupId)}
                    <span className="text-muted-foreground"> · {nameOf(t.subGroupId)}</span>
                  </td>
                  <td className="px-5 py-3">{nameOf(t.paymentSourceId)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{memberName(t)}</td>
                  <td
                    className={`num px-5 py-3 text-right font-medium ${
                      t.type === "income" ? "text-success" : "text-destructive"
                    }`}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {inr(Number(t.amount))}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  breakdown,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "destructive" | "primary";
  breakdown?: { name: string; value: number }[];
}) {
  const toneClass = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    primary: "bg-primary/10 text-primary",
  }[tone];
  const rows = (breakdown ?? []).filter((r) => r.value > 0);
  return (
    <div className="card-surface p-5">
      <div className="flex items-center gap-4">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="num mt-0.5 text-2xl font-bold tracking-tight">{inr(value)}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3">
              <span className="truncate text-muted-foreground">{r.name}</span>
              <span className="num font-medium">{inr(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      Add transactions to see this chart.
    </div>
  );
}