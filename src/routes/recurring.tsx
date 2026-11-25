import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, Pencil, Plus, Repeat, SkipForward, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import { can } from "@/lib/permissions";
import { inr, monthLabel, shortDate, todayISO } from "@/lib/format";
import { dueOccurrences, type Occurrence } from "@/lib/recurring";
import type { MasterCollection, RecurringRule, TransactionType } from "@/lib/types";

export const Route = createFileRoute("/recurring")({
  head: () => ({
    meta: [
      { title: "Recurring — SpendWise" },
      {
        name: "description",
        content: "Monthly entries such as EMIs, rent, SIPs and salary, posted in one tap.",
      },
      { property: "og:title", content: "Recurring — SpendWise" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: RecurringPage,
});

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GROUPS: Record<TransactionType, MasterCollection> = {
  expense: "expenseGroups",
  income: "incomeGroups",
  investment: "investmentGroups",
};
const SUB_GROUPS: Record<TransactionType, MasterCollection> = {
  expense: "expenseSubGroups",
  income: "incomeSubGroups",
  investment: "investmentSubGroups",
};

type Draft = {
  name: string;
  type: TransactionType;
  groupId: string;
  subGroupId: string;
  paymentSourceId: string;
  amount: string;
  dayOfMonth: string;
  startPeriod: string;
  endPeriod: string;
  remarks: string;
  active: boolean;
};

const blank = (): Draft => ({
  name: "",
  type: "expense",
  groupId: "",
  subGroupId: "",
  paymentSourceId: "",
  amount: "",
  dayOfMonth: String(Number(todayISO().slice(8, 10))),
  startPeriod: todayISO().slice(0, 7),
  endPeriod: "",
  remarks: "",
  active: true,
});

function RecurringPage() {
  const {
    masters,
    transactions,
    recurring,
    user,
    saveRecurring,
    deleteRecurring,
    postRecurring,
    skipRecurring,
  } = useApp();
  const canWrite = can(user?.role, "write");
  const canDelete = can(user?.role, "delete");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState<string | null>(null);

  const today = todayISO();
  const due = useMemo(
    () => dueOccurrences(recurring, transactions, today),
    [recurring, transactions, today],
  );

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(masters).forEach((list) => list.forEach((m) => map.set(m.id, m.name)));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? "—") : "—");
  }, [masters]);

  const groups = masters[GROUPS[draft.type]];
  const subGroups = masters[SUB_GROUPS[draft.type]].filter((s) => s.parentId === draft.groupId);

  useEffect(() => {
    if (!open) return;
    setDraft(
      editing
        ? {
            name: editing.name,
            type: editing.type,
            groupId: editing.groupId,
            subGroupId: editing.subGroupId ?? "",
            paymentSourceId: editing.paymentSourceId,
            amount: String(editing.amount),
            dayOfMonth: String(editing.dayOfMonth),
            startPeriod: editing.startPeriod,
            endPeriod: editing.endPeriod ?? "",
            remarks: editing.remarks ?? "",
            active: editing.active,
          }
        : blank(),
    );
  }, [open, editing]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const openRule = (rule: RecurringRule | null) => {
    setEditing(rule);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(draft.amount);
    const day = Number(draft.dayOfMonth);
    if (!draft.name.trim()) return toast.error("Give it a name, e.g. Rent");
    if (!draft.groupId) return toast.error("Choose a group");
    if (!draft.paymentSourceId) return toast.error("Choose a payment source");
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("Amount must be more than zero");
    if (!Number.isInteger(day) || day < 1 || day > 31) return toast.error("Day must be 1–31");
    if (!/^\d{4}-\d{2}$/.test(draft.startPeriod)) return toast.error("Choose a start month");
    if (draft.endPeriod && draft.endPeriod < draft.startPeriod) {
      return toast.error("End month must be after the start month");
    }
    setBusy("form");
    try {
      await saveRecurring(
        {
          name: draft.name.trim().slice(0, 60),
          type: draft.type,
          groupId: draft.groupId,
          subGroupId: draft.subGroupId || null,
          paymentSourceId: draft.paymentSourceId,
          amount,
          dayOfMonth: day,
          startPeriod: draft.startPeriod,
          endPeriod: draft.endPeriod || null,
          remarks: draft.remarks.trim().slice(0, 500),
          active: draft.active,
        },
        editing?.id,
      );
      toast.success(editing ? "Recurring entry updated" : "Recurring entry added");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const post = async (list: Occurrence[], key: string) => {
    setBusy(key);
    try {
      const n = await postRecurring(list);
      toast.success(`Posted ${n} entr${n === 1 ? "y" : "ies"}`);
    } catch (error) {
      toast.error(
        `Posting stopped: ${error instanceof Error ? error.message : "a write failed"}. Posting again is safe; nothing is duplicated.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const skip = async (o: Occurrence) => {
    setBusy(o.id);
    try {
      await skipRecurring(o.rule.id, o.period);
      toast.success(`Skipped ${o.rule.name} for ${monthLabel(o.period)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (rule: RecurringRule) => {
    if (!window.confirm(`Delete "${rule.name}"? Entries it already posted stay in Transactions.`)) {
      return;
    }
    try {
      await deleteRecurring(rule.id);
      toast.success(`Deleted "${rule.name}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  return (
    <AppShell
      title="Recurring"
      actions={
        canWrite ? (
          <Button size="sm" onClick={() => openRule(null)}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        ) : undefined
      }
    >
      <section className="card-surface mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Due now</h2>
            <p className="text-sm text-muted-foreground">
              {due.length === 0
                ? "Everything is posted."
                : `${due.length} entr${due.length === 1 ? "y is" : "ies are"} due, including missed months from the last year.`}
            </p>
          </div>
          {canWrite && due.length > 1 && (
            <Button size="sm" onClick={() => post(due, "all")} disabled={busy !== null}>
              <CheckCheck className="mr-1 h-4 w-4" />
              {busy === "all" ? "Posting…" : `Post all ${due.length}`}
            </Button>
          )}
        </div>
        {due.length > 0 && (
          <ul className="mt-3 divide-y divide-border">
            {due.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{o.rule.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {shortDate(o.date)} · {nameOf(o.rule.groupId)}
                    {o.rule.subGroupId ? ` › ${nameOf(o.rule.subGroupId)}` : ""} ·{" "}
                    {nameOf(o.rule.paymentSourceId)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`num text-sm font-semibold ${o.rule.type === "income" ? "text-success" : "text-destructive"}`}
                  >
                    {inr(o.rule.amount)}
                  </span>
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => skip(o)}
                        disabled={busy !== null}
                        aria-label={`Skip ${o.rule.name} for ${monthLabel(o.period)}`}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                      <Button size="sm" onClick={() => post([o], o.id)} disabled={busy !== null}>
                        {busy === o.id ? "Posting…" : "Post"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Every month on</th>
                <th className="px-4 py-3">From – to</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id} className={`border-t border-border ${r.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-medium">
                    {r.name}
                    {!r.active && (
                      <span className="ml-2 text-xs text-muted-foreground">(paused)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {nameOf(r.groupId)}
                    {r.subGroupId ? ` › ${nameOf(r.subGroupId)}` : ""}
                  </td>
                  <td className="px-4 py-3">Day {r.dayOfMonth}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {monthLabel(r.startPeriod)} – {r.endPeriod ? monthLabel(r.endPeriod) : "no end"}
                  </td>
                  <td
                    className={`num px-4 py-3 text-right font-medium ${r.type === "income" ? "text-success" : "text-destructive"}`}
                  >
                    {inr(r.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {canWrite && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() => openRule(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          onClick={() => remove(r)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {recurring.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <Repeat className="mx-auto mb-2 h-6 w-6" />
                    No recurring entries yet. Add rent, EMIs, SIPs or salary once and post them each
                    month in one tap.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recurring entry" : "New recurring entry"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-name">Name</Label>
              <Input
                id="r-name"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Rent"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-type">Type</Label>
              <select
                id="r-type"
                className={selectClass}
                value={draft.type}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    type: e.target.value as TransactionType,
                    groupId: "",
                    subGroupId: "",
                  }))
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-amount">Amount (₹)</Label>
              <Input
                id="r-amount"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-group">Group</Label>
              <select
                id="r-group"
                className={selectClass}
                value={draft.groupId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, groupId: e.target.value, subGroupId: "" }))
                }
              >
                <option value="">Choose…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-sub">Sub group</Label>
              <select
                id="r-sub"
                className={selectClass}
                value={draft.subGroupId}
                onChange={(e) => set("subGroupId", e.target.value)}
                disabled={subGroups.length === 0}
              >
                <option value="">None</option>
                {subGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-source">Payment source</Label>
              <select
                id="r-source"
                className={selectClass}
                value={draft.paymentSourceId}
                onChange={(e) => set("paymentSourceId", e.target.value)}
              >
                <option value="">Choose…</option>
                {masters.paymentSources.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-day">Day of month</Label>
              <Input
                id="r-day"
                type="number"
                min={1}
                max={31}
                value={draft.dayOfMonth}
                onChange={(e) => set("dayOfMonth", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-start">From month</Label>
              <Input
                id="r-start"
                type="month"
                value={draft.startPeriod}
                onChange={(e) => set("startPeriod", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-end">Until month (optional)</Label>
              <Input
                id="r-end"
                type="month"
                value={draft.endPeriod}
                onChange={(e) => set("endPeriod", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-remarks">Remarks</Label>
              <Input
                id="r-remarks"
                value={draft.remarks}
                onChange={(e) => set("remarks", e.target.value)}
                placeholder="Shown on each posted entry (defaults to the name)"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="r-active"
                checked={draft.active}
                onCheckedChange={(v) => set("active", v)}
              />
              <Label htmlFor="r-active">Active (paused entries are never due)</Label>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Months shorter than the chosen day post on their last day.
            </p>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy === "form"}>
                {busy === "form" ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
