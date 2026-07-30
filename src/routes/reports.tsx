import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { inr, monthKey, monthLabel, todayISO } from "@/lib/format";
import type { TransactionType } from "@/lib/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — SpendWise" },
      {
        name: "description",
        content:
          "Break down family income and expenses by group, sub group, payment source and any date range.",
      },
      { property: "og:title", content: "Reports — SpendWise" },
      {
        property: "og:description",
        content: "Monthly, yearly and custom-range reports for every group and payment source.",
      },
    ],
  }),
  component: ReportsPage,
});

type Preset = "month" | "lastMonth" | "year" | "lastYear" | "all" | "custom";
type Dimension = "group" | "subGroup" | "source" | "month";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "lastYear":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return { from: "", to: "" };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function ReportsPage() {
  const { transactions, masters } = useApp();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: todayISO().slice(0, 8) + "01", to: todayISO() });
  const [type, setType] = useState<"all" | TransactionType>("all");
  const [dimension, setDimension] = useState<Dimension>("group");
  const [sourceFilter, setSourceFilter] = useState("");

  const range = preset === "custom" ? custom : rangeFor(preset);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(masters)
      .flat()
      .forEach((m) => map.set(m.id, m.name));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [masters]);

  const rows = useMemo(
    () =>
      transactions.filter((t) => {
        if (range.from && t.date < range.from) return false;
        if (range.to && t.date > range.to) return false;
        if (type !== "all" && t.type !== type) return false;
        if (sourceFilter && t.paymentSourceId !== sourceFilter) return false;
        return true;
      }),
    [transactions, range.from, range.to, type, sourceFilter],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    rows.forEach((t) =>
      t.type === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount)),
    );
    return { income, expense, balance: income - expense, count: rows.length };
  }, [rows]);

  const keyFor = (t: (typeof rows)[number]) => {
    if (dimension === "group") return nameOf(t.groupId);
    if (dimension === "subGroup") return `${nameOf(t.groupId)} › ${nameOf(t.subGroupId)}`;
    if (dimension === "source") return nameOf(t.paymentSourceId);
    return monthKey(t.date);
  };

  const breakdown = useMemo(() => {
    const map = new Map<string, { label: string; Income: number; Expense: number }>();
    rows.forEach((t) => {
      const k = keyFor(t);
      const row = map.get(k) ?? { label: k, Income: 0, Expense: 0 };
      if (t.type === "income") row.Income += Number(t.amount);
      else row.Expense += Number(t.amount);
      map.set(k, row);
    });
    const list = [...map.values()];
    return dimension === "month"
      ? list
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((r) => ({ ...r, label: monthLabel(r.label) }))
      : list.sort((a, b) => b.Income + b.Expense - (a.Income + a.Expense));
  }, [rows, dimension, nameOf]);

  const exportCsv = () => {
    const head = ["Date", "Type", "Group", "Sub group", "Payment source", "Amount", "Remarks"];
    const body = rows.map((t) => [
      t.date,
      t.type,
      nameOf(t.groupId),
      nameOf(t.subGroupId),
      nameOf(t.paymentSourceId),
      String(t.amount),
      t.remarks ?? "",
    ]);
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `spendwise-report-${range.from || "start"}-${range.to || "today"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title="Reports"
      actions={
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      }
    >
      <section className="card-surface p-5">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                preset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {preset === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="all">Income &amp; expense</option>
              <option value="expense">Expense only</option>
              <option value="income">Income only</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dimension">Group by</Label>
            <select
              id="dimension"
              className={selectClass}
              value={dimension}
              onChange={(e) => setDimension(e.target.value as Dimension)}
            >
              <option value="group">Group</option>
              <option value="subGroup">Sub group</option>
              <option value="source">Payment source</option>
              <option value="month">Month</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source">Payment source</Label>
            <select
              id="source"
              className={selectClass}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="">All sources</option>
              {masters.paymentSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Income" value={inr(totals.income)} tone="text-success" />
        <Stat label="Expense" value={inr(totals.expense)} tone="text-destructive" />
        <Stat label="Balance" value={inr(totals.balance)} tone="text-primary" />
        <Stat label="Entries" value={String(totals.count)} tone="" />
      </div>

      <section className="card-surface mt-4 p-5">
        <h2 className="text-sm font-semibold">Breakdown chart</h2>
        <div className="mt-4 h-80">
          {breakdown.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No transactions in this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={70} />
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

      <section className="card-surface mt-4 overflow-hidden">
        <div className="px-5 py-4 text-sm font-semibold">Breakdown table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">
                  {dimension === "month" ? "Month" : dimension === "source" ? "Source" : "Category"}
                </th>
                <th className="px-5 py-2.5 text-right font-medium">Income</th>
                <th className="px-5 py-2.5 text-right font-medium">Expense</th>
                <th className="px-5 py-2.5 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-5 py-3">{r.label}</td>
                  <td className="num px-5 py-3 text-right text-success">{inr(r.Income)}</td>
                  <td className="num px-5 py-3 text-right text-destructive">{inr(r.Expense)}</td>
                  <td className="num px-5 py-3 text-right font-medium">{inr(r.Income - r.Expense)}</td>
                </tr>
              ))}
              {breakdown.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                    Nothing to report for this selection.
                  </td>
                </tr>
              )}
            </tbody>
            {breakdown.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.income)}</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.expense)}</td>
                  <td className="num px-5 py-3 text-right">{inr(totals.balance)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`num mt-1.5 text-xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
