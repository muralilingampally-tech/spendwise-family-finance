import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
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
  const { transactions, masters, members, user } = useApp();

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
    const map = new Map<string, { name: string; Income: number; Expense: number }>();
    transactions.forEach((t) => {
      const name = memberName(t);
      const row = map.get(name) ?? { name, Income: 0, Expense: 0 };
      if (t.type === "income") row.Income += Number(t.amount);
      else row.Expense += Number(t.amount);
      map.set(name, row);
    });
    return [...map.values()].sort((a, b) => b.Expense - a.Expense);
  }, [transactions, memberName]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach((t) =>
      t.type === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount)),
    );
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; Income: number; Expense: number }>();
    transactions.forEach((t) => {
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
  }, [transactions]);

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

  const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

  return (
    <AppShell
      title="Dashboard"
      actions={
        <Button asChild size="sm">
          <Link to="/transactions">Add transaction</Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Income" value={totals.income} icon={ArrowUpRight} tone="success" />
        <StatCard label="Total Expense" value={totals.expense} icon={ArrowDownRight} tone="destructive" />
        <StatCard label="Balance" value={totals.balance} icon={Scale} tone="primary" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="card-surface p-5 lg:col-span-3">
          <h2 className="text-sm font-semibold">Monthly income vs expense</h2>
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
          <h2 className="text-sm font-semibold">Expense by category</h2>
          <div className="mt-4 h-72">
            {byCategory.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={chartColors[i % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => inr(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className="card-surface mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">Recent transactions</h2>
          <Link to="/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
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
                  <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
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
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "destructive" | "primary";
}) {
  const toneClass = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    primary: "bg-primary/10 text-primary",
  }[tone];
  return (
    <div className="card-surface flex items-center gap-4 p-5">
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="num mt-0.5 text-2xl font-bold tracking-tight">{inr(value)}</p>
      </div>
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