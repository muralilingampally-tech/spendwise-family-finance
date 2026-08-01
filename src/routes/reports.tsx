import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { inr, monthKey, monthLabel, todayISO, toLocalISODate } from "@/lib/format";
import { signedInvestment } from "@/lib/investment";
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
type Dimension = "group" | "subGroup" | "includes" | "source" | "month" | "user" | "necessity";

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function rangeFor(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: toLocalISODate(new Date(y, m, 1)), to: toLocalISODate(new Date(y, m + 1, 0)) };
    case "lastMonth":
      return { from: toLocalISODate(new Date(y, m - 1, 1)), to: toLocalISODate(new Date(y, m, 0)) };
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
  const { transactions, masters, members, user } = useApp();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: todayISO().slice(0, 8) + "01", to: todayISO() });
  const [type, setType] = useState<"all" | TransactionType>("all");
  const [dimension, setDimension] = useState<Dimension>("group");
  const [sourceFilter, setSourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const range = preset === "custom" ? custom : rangeFor(preset);

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

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.displayName || m.email || "Member"));
    transactions.forEach((t) => {
      if (t.createdBy && !map.has(t.createdBy)) map.set(t.createdBy, t.createdByName || "Unknown");
    });
    if (user) map.set(user.uid, user.displayName || user.email || "You");
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [members, transactions, user]);

  const rows = useMemo(
    () =>
      transactions.filter((t) => {
        if (range.from && t.date < range.from) return false;
        if (range.to && t.date > range.to) return false;
        if (type !== "all" && t.type !== type) return false;
        if (sourceFilter && t.paymentSourceId !== sourceFilter) return false;
        if (userFilter && t.createdBy !== userFilter) return false;
        return true;
      }),
    [transactions, range.from, range.to, type, sourceFilter, userFilter],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    let invested = 0;
    let realized = 0;
    rows.forEach((t) => {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "investment") {
        const signed = signedInvestment(nameOf(t.subGroupId), Number(t.amount));
        if (signed >= 0) realized += signed;
        else invested += -signed;
      }
      else expense += Number(t.amount);
    });
    return {
      income,
      expense,
      invested,
      realized,
      investment: realized - invested,
      balance: income - expense,
      count: rows.length,
    };
  }, [rows, nameOf]);

  const keyFor = (t: (typeof rows)[number]) => {
    if (dimension === "group") return nameOf(t.groupId);
    if (dimension === "subGroup") return `${nameOf(t.groupId)} › ${nameOf(t.subGroupId)}`;
    if (dimension === "includes")
      return t.includesId ? `${nameOf(t.subGroupId)} › ${nameOf(t.includesId)}` : "Not specified";
    if (dimension === "necessity")
      return t.necessity ? t.necessity[0].toUpperCase() + t.necessity.slice(1) : "Not tagged";
    if (dimension === "source") return nameOf(t.paymentSourceId);
    if (dimension === "user") return memberName(t);
    return monthKey(t.date);
  };

  const breakdown = useMemo(() => {
    const map = new Map<string, { label: string; Income: number; Expense: number; Investment: number }>();
    rows.forEach((t) => {
      const k = keyFor(t);
      const row = map.get(k) ?? { label: k, Income: 0, Expense: 0, Investment: 0 };
      if (t.type === "income") row.Income += Number(t.amount);
      else if (t.type === "investment")
        row.Investment += signedInvestment(nameOf(t.subGroupId), Number(t.amount));
      else row.Expense += Number(t.amount);
      map.set(k, row);
    });
    const list = [...map.values()];
    return dimension === "month"
      ? list
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((r) => ({ ...r, label: monthLabel(r.label) }))
      : list.sort((a, b) => b.Income + b.Expense - (a.Income + a.Expense));
  }, [rows, dimension, nameOf, memberName]);

  /** Group → sub group tree for the selected range. */
  const groupTree = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        income: number;
        expense: number;
        investment: number;
        count: number;
        subs: Map<
          string,
          { label: string; income: number; expense: number; investment: number; count: number }
        >;
      }
    >();
    rows.forEach((t) => {
      const gid = t.groupId || "none";
      const group =
        map.get(gid) ??
        { id: gid, label: nameOf(t.groupId), income: 0, expense: 0, investment: 0, count: 0, subs: new Map() };
      const sid = t.subGroupId || "none";
      const sub =
        group.subs.get(sid) ??
        { label: nameOf(t.subGroupId), income: 0, expense: 0, investment: 0, count: 0 };
      const amount = Number(t.amount);
      if (t.type === "income") {
        group.income += amount;
        sub.income += amount;
      } else if (t.type === "investment") {
        const signed = signedInvestment(nameOf(t.subGroupId), amount);
        group.investment += signed;
        sub.investment += signed;
      } else {
        group.expense += amount;
        sub.expense += amount;
      }
      group.count += 1;
      sub.count += 1;
      group.subs.set(sid, sub);
      map.set(gid, group);
    });
    return [...map.values()]
      .map((g) => ({
        ...g,
        subRows: [...g.subs.values()].sort(
          (a, b) => b.income + b.expense - (a.income + a.expense),
        ),
      }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [rows, nameOf]);

  const shareData = useMemo(
    () =>
      groupTree
        .filter((g) => g.expense > 0)
        .slice(0, 6)
        .map((g) => ({ name: g.label, value: g.expense })),
    [groupTree],
  );

  const trend = useMemo(() => {
    const map = new Map<string, { key: string; Income: number; Expense: number; Investment: number }>();
    rows.forEach((t) => {
      const k = monthKey(t.date);
      const row = map.get(k) ?? { key: k, Income: 0, Expense: 0, Investment: 0 };
      if (t.type === "investment")
        row.Investment += signedInvestment(nameOf(t.subGroupId), Number(t.amount));
      else if (t.type === "income") row.Income += Number(t.amount);
      else row.Expense += Number(t.amount);
      map.set(k, row);
    });
    return [...map.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({ ...r, label: monthLabel(r.key), Net: r.Income - r.Expense }));
  }, [rows, nameOf]);

  const exportCsv = () => {
    const head = [
      "Date",
      "Type",
      "Group",
      "Sub group",
      "Includes",
      "Necessity",
      "Payment source",
      "User",
      "Amount",
      "Remarks",
    ];
    const body = rows.map((t) => [
      t.date,
      t.type,
      nameOf(t.groupId),
      nameOf(t.subGroupId),
      t.includesId ? nameOf(t.includesId) : "",
      t.necessity ?? "",
      nameOf(t.paymentSourceId),
      memberName(t),
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
              <option value="all">All entries</option>
              <option value="expense">Expense only</option>
              <option value="income">Income only</option>
              <option value="investment">Investments only</option>
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
              <option value="includes">Includes</option>
              <option value="necessity">Essential / discretionary</option>
              <option value="source">Payment source</option>
              <option value="month">Month</option>
              <option value="user">User</option>
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
          <div className="space-y-1.5">
            <Label htmlFor="userFilter">User</Label>
            <select
              id="userFilter"
              className={selectClass}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">All users</option>
              {memberOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Income" value={inr(totals.income)} tone="text-success" />
        <Stat label="Expense" value={inr(totals.expense)} tone="text-destructive" />
        <Stat label="Investments" value={inr(totals.investment)} tone="text-primary" />
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Expense share by group</h2>
          <div className="mt-2 h-72">
            {shareData.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No expenses in this range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={shareData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {shareData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold">Monthly trend</h2>
          <div className="mt-2 h-72">
            {trend.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Nothing to plot yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={70} />
                  <Tooltip
                    formatter={(v: number) => inr(v)}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Income" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Expense" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Net" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className="card-surface mt-4 overflow-hidden">
        <div className="px-5 py-4 text-sm font-semibold">
          Group-wise report ({range.from || "start"} → {range.to || "today"})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Group / sub group</th>
                <th className="px-3 py-2.5 text-right font-medium">Entries</th>
                <th className="px-3 py-2.5 text-right font-medium">Income</th>
                <th className="px-3 py-2.5 text-right font-medium">Expense</th>
                <th className="px-3 py-2.5 text-right font-medium">Invested</th>
                <th className="px-3 py-2.5 text-right font-medium">Net</th>
                <th className="px-5 py-2.5 text-right font-medium">% of expense</th>
              </tr>
            </thead>
            <tbody>
              {groupTree.map((g) => (
                <Fragment key={g.id}>
                  <tr className="border-t border-border">
                    <td className="px-5 py-3">
                      <button
                        className="flex items-center gap-1.5 font-medium"
                        onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${expanded[g.id] ? "rotate-90" : ""}`}
                        />
                        {g.label}
                      </button>
                    </td>
                    <td className="num px-3 py-3 text-right text-muted-foreground">{g.count}</td>
                    <td className="num px-3 py-3 text-right text-success">{inr(g.income)}</td>
                    <td className="num px-3 py-3 text-right text-destructive">{inr(g.expense)}</td>
                    <td className="num px-3 py-3 text-right">{inr(g.investment)}</td>
                    <td className="num px-3 py-3 text-right font-medium">{inr(g.income - g.expense)}</td>
                    <td className="num px-5 py-3 text-right text-muted-foreground">
                      {totals.expense > 0 ? `${((g.expense / totals.expense) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                  {expanded[g.id] &&
                    g.subRows.map((s) => (
                      <tr key={`${g.id}-${s.label}`} className="border-t border-border/60 bg-muted/20">
                        <td className="px-5 py-2.5 pl-12 text-muted-foreground">{s.label}</td>
                        <td className="num px-3 py-2.5 text-right text-muted-foreground">{s.count}</td>
                        <td className="num px-3 py-2.5 text-right">{inr(s.income)}</td>
                        <td className="num px-3 py-2.5 text-right">{inr(s.expense)}</td>
                        <td className="num px-3 py-2.5 text-right">{inr(s.investment)}</td>
                        <td className="num px-3 py-2.5 text-right">{inr(s.income - s.expense)}</td>
                        <td className="num px-5 py-2.5 text-right text-muted-foreground">
                          {totals.expense > 0 ? `${((s.expense / totals.expense) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              {groupTree.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    No entries for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
            {groupTree.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="num px-3 py-3 text-right">{totals.count}</td>
                  <td className="num px-3 py-3 text-right">{inr(totals.income)}</td>
                  <td className="num px-3 py-3 text-right">{inr(totals.expense)}</td>
                  <td className="num px-3 py-3 text-right">{inr(totals.investment)}</td>
                  <td className="num px-3 py-3 text-right">{inr(totals.balance)}</td>
                  <td className="num px-5 py-3 text-right">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="card-surface mt-4 overflow-hidden">
        <div className="px-5 py-4 text-sm font-semibold">Breakdown table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">
                  {dimension === "month"
                    ? "Month"
                    : dimension === "source"
                      ? "Source"
                      : dimension === "user"
                        ? "User"
                        : dimension === "necessity"
                          ? "Tag"
                          : "Category"}
                </th>
                <th className="px-5 py-2.5 text-right font-medium">Income</th>
                <th className="px-5 py-2.5 text-right font-medium">Expense</th>
                <th className="px-5 py-2.5 text-right font-medium">Invested</th>
                <th className="px-5 py-2.5 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-5 py-3">{r.label}</td>
                  <td className="num px-5 py-3 text-right text-success">{inr(r.Income)}</td>
                  <td className="num px-5 py-3 text-right text-destructive">{inr(r.Expense)}</td>
                  <td className="num px-5 py-3 text-right">{inr(r.Investment)}</td>
                  <td className="num px-5 py-3 text-right font-medium">{inr(r.Income - r.Expense)}</td>
                </tr>
              ))}
              {breakdown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
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
                  <td className="num px-5 py-3 text-right">{inr(totals.investment)}</td>
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
