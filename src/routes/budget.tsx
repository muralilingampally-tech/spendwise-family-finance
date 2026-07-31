import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Save, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import type { TransactionType } from "@/lib/types";

export const Route = createFileRoute("/budget")({
  head: () => ({
    meta: [
      { title: "Budget vs Actual — SpendWise" },
      {
        name: "description",
        content:
          "Set a monthly budget for every expense group and track actual spend, forecast and remaining budget before you cross the limit.",
      },
      { property: "og:title", content: "Budget vs Actual — SpendWise" },
      {
        property: "og:description",
        content: "Budget, actual, forecast and variance for every family spending group.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BudgetPage,
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const daysInMonth = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

function BudgetPage() {
  const { masters, transactions, budgets, saveBudget } = useApp();
  const [period, setPeriod] = useState(() => todayISO().slice(0, 7));
  const [type, setType] = useState<TransactionType>("expense");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const groups = type === "expense" ? masters.expenseGroups : masters.incomeGroups;

  const budgetFor = useMemo(() => {
    const map = new Map<string, number>();
    budgets
      .filter((b) => b.period === period)
      .forEach((b) => map.set(b.groupId, Number(b.amount) || 0));
    return map;
  }, [budgets, period]);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        groups.map((g) => [g.id, budgetFor.has(g.id) ? String(budgetFor.get(g.id)) : ""]),
      ),
    );
  }, [period, type, groups, budgetFor]);

  const today = todayISO();
  const currentPeriod = today.slice(0, 7);
  const total = daysInMonth(period);
  const elapsed =
    period > currentPeriod ? 0 : period < currentPeriod ? total : Number(today.slice(8, 10));

  const actuals = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter((t) => t.type === type && t.date.slice(0, 7) === period)
      .forEach((t) => map.set(t.groupId, (map.get(t.groupId) ?? 0) + Number(t.amount)));
    return map;
  }, [transactions, type, period]);

  const rows = useMemo(
    () =>
      groups.map((g) => {
        const budget = budgetFor.get(g.id) ?? 0;
        const actual = actuals.get(g.id) ?? 0;
        const forecast = elapsed > 0 ? (actual / elapsed) * total : actual;
        return {
          id: g.id,
          name: g.name,
          budget,
          actual,
          forecast,
          variance: budget - actual,
          forecastVariance: budget - forecast,
          used: budget > 0 ? (actual / budget) * 100 : 0,
        };
      }),
    [groups, budgetFor, actuals, elapsed, total],
  );

  const grand = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          budget: acc.budget + r.budget,
          actual: acc.actual + r.actual,
          forecast: acc.forecast + r.forecast,
        }),
        { budget: 0, actual: 0, forecast: 0 },
      ),
    [rows],
  );

  const save = async (groupId: string) => {
    setSaving(groupId);
    try {
      await saveBudget({ period, groupId, type, amount: Number(drafts[groupId] || 0) });
    } finally {
      setSaving(null);
    }
  };

  const saveAll = async () => {
    setSaving("all");
    try {
      for (const g of groups) {
        const value = Number(drafts[g.id] || 0);
        if (value !== (budgetFor.get(g.id) ?? 0)) {
          await saveBudget({ period, groupId: g.id, type, amount: value });
        }
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell
      title="Budget vs Actual"
      actions={
        <Button size="sm" onClick={saveAll} disabled={saving !== null}>
          <Save className="mr-2 h-4 w-4" />
          Save all
        </Button>
      }
    >
      <section className="card-surface p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="period">Budget month</Label>
            <Input
              id="period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value || currentPeriod)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="btype">Budget for</Label>
            <select
              id="btype"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType)}
            >
              <option value="expense">Expense groups</option>
              <option value="income">Income groups (targets)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Month progress</Label>
            <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Day {elapsed} of {total}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Budget" value={inr(grand.budget)} tone="text-primary" />
        <Stat label="Actual" value={inr(grand.actual)} tone="text-destructive" />
        <Stat label="Forecast (month end)" value={inr(grand.forecast)} tone="" />
        <Stat
          label={grand.budget - grand.actual >= 0 ? "Budget left" : "Over budget"}
          value={inr(Math.abs(grand.budget - grand.actual))}
          tone={grand.budget - grand.actual >= 0 ? "text-success" : "text-destructive"}
        />
      </div>

      <section className="card-surface mt-4 overflow-hidden">
        <div className="px-5 py-4 text-sm font-semibold">
          Group-wise budget · actual · forecast · variance
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Group</th>
                <th className="px-3 py-2.5 font-medium">Budget</th>
                <th className="px-3 py-2.5 text-right font-medium">Actual</th>
                <th className="px-3 py-2.5 text-right font-medium">Forecast</th>
                <th className="px-3 py-2.5 text-right font-medium">Variance</th>
                <th className="px-3 py-2.5 text-right font-medium">Forecast var.</th>
                <th className="px-5 py-2.5 font-medium">Used</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const over = r.variance < 0;
                const risky = !over && r.forecastVariance < 0;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-3 py-3">
                      <Input
                        className="h-8 w-28"
                        inputMode="decimal"
                        placeholder="0"
                        value={drafts[r.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                        onBlur={() => {
                          if (Number(drafts[r.id] || 0) !== r.budget) void save(r.id);
                        }}
                      />
                    </td>
                    <td className="num px-3 py-3 text-right">{inr(r.actual)}</td>
                    <td className="num px-3 py-3 text-right text-muted-foreground">
                      {inr(r.forecast)}
                    </td>
                    <td
                      className={`num px-3 py-3 text-right font-medium ${
                        over ? "text-destructive" : "text-success"
                      }`}
                    >
                      {over ? `-${inr(Math.abs(r.variance))}` : inr(r.variance)}
                    </td>
                    <td
                      className={`num px-3 py-3 text-right ${
                        r.forecastVariance < 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {r.forecastVariance < 0
                        ? `-${inr(Math.abs(r.forecastVariance))}`
                        : inr(r.forecastVariance)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              over
                                ? "bg-destructive"
                                : risky
                                  ? "bg-chart-4"
                                  : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(100, Math.round(r.used))}%` }}
                          />
                        </div>
                        <span className="num text-xs text-muted-foreground">
                          {r.budget > 0 ? `${Math.round(r.used)}%` : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {over ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-1 font-medium text-destructive">
                          Over
                        </span>
                      ) : risky ? (
                        <span className="rounded-full bg-accent px-2 py-1 font-medium text-accent-foreground">
                          At risk
                        </span>
                      ) : r.budget > 0 ? (
                        <span className="rounded-full bg-success/10 px-2 py-1 font-medium text-success">
                          On track
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No budget</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    Add groups under Masters first, then set their monthly budget here.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/40 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="num px-3 py-3">{inr(grand.budget)}</td>
                  <td className="num px-3 py-3 text-right">{inr(grand.actual)}</td>
                  <td className="num px-3 py-3 text-right">{inr(grand.forecast)}</td>
                  <td className="num px-3 py-3 text-right">{inr(grand.budget - grand.actual)}</td>
                  <td className="num px-3 py-3 text-right">
                    {inr(grand.budget - grand.forecast)}
                  </td>
                  <td className="px-5 py-3" />
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Forecast projects the month-end total from the pace so far (actual ÷ days elapsed ×
          days in month). “At risk” means you are within budget today but on pace to cross it.
        </p>
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