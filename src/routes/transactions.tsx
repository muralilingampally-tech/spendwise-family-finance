import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import { inr, shortDate, todayISO } from "@/lib/format";
import type { Transaction, TransactionType } from "@/lib/types";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — SpendWise" },
      {
        name: "description",
        content: "Add, edit, search and filter income and expense transactions.",
      },
      { property: "og:title", content: "Transactions — SpendWise" },
      { property: "og:description", content: "Record and search every income and expense entry." },
    ],
  }),
  component: TransactionsPage,
});

type FormValues = {
  date: string;
  type: TransactionType;
  groupId: string;
  subGroupId: string;
  paymentSourceId: string;
  amount: string;
  remarks: string;
  createdBy: string;
};

const emptyValues: FormValues = {
  date: todayISO(),
  type: "expense",
  groupId: "",
  subGroupId: "",
  paymentSourceId: "",
  amount: "",
  remarks: "",
  createdBy: "",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TransactionsPage() {
  const { transactions, masters, members, saveTransaction, deleteTransaction, user } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | TransactionType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const form = useForm<FormValues>({ defaultValues: emptyValues });
  const type = form.watch("type");
  const groupId = form.watch("groupId");

  const groups = type === "income" ? masters.incomeGroups : masters.expenseGroups;
  const subGroups = (type === "income" ? masters.incomeSubGroups : masters.expenseSubGroups).filter(
    (s) => s.parentId === groupId,
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
    return (t: Transaction) => map.get(t.createdBy) || t.createdByName || "Unknown";
  }, [members, user]);

  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.id, m.displayName || m.email || "Member"));
    transactions.forEach((t) => {
      if (t.createdBy && !map.has(t.createdBy)) map.set(t.createdBy, t.createdByName || "Unknown");
    });
    if (user) map.set(user.uid, user.displayName || user.email || "You");
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [members, transactions, user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (groupFilter && t.groupId !== groupFilter) return false;
      if (sourceFilter && t.paymentSourceId !== sourceFilter) return false;
      if (userFilter && t.createdBy !== userFilter) return false;
      if (!q) return true;
      return [
        t.date,
        String(t.amount),
        t.remarks,
        memberName(t),
        nameOf(t.groupId),
        nameOf(t.subGroupId),
        nameOf(t.paymentSourceId),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, search, typeFilter, from, to, groupFilter, sourceFilter, userFilter, nameOf, memberName]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filtered.forEach((t) =>
      t.type === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount)),
    );
    return { income, expense };
  }, [filtered]);

  const openNew = () => {
    setEditing(null);
    form.reset({ ...emptyValues, createdBy: user?.uid ?? "" });
    setOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setEditing(t);
    form.reset({
      date: t.date,
      type: t.type,
      groupId: t.groupId,
      subGroupId: t.subGroupId ?? "",
      paymentSourceId: t.paymentSourceId,
      amount: String(t.amount),
      remarks: t.remarks ?? "",
      createdBy: t.createdBy ?? user?.uid ?? "",
    });
    setOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const owner = memberOptions.find((m) => m.id === values.createdBy);
      await saveTransaction(
        {
          date: values.date,
          type: values.type,
          groupId: values.groupId,
          subGroupId: values.subGroupId || null,
          paymentSourceId: values.paymentSourceId,
          amount,
          remarks: values.remarks.trim().slice(0, 500),
          createdBy: values.createdBy || user?.uid,
          createdByName: owner?.name ?? user?.displayName ?? user?.email ?? null,
        },
        editing?.id,
      );
      toast.success(editing ? "Transaction updated" : "Transaction added");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save transaction");
    } finally {
      setBusy(false);
    }
  });

  const canDelete = user?.role === "admin";

  return (
    <AppShell
      title="Transactions"
      actions={
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" /> New
        </Button>
      }
    >
      <div className="card-surface grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
        <Input
          placeholder="Search remarks, amount, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:col-span-3 lg:col-span-2"
        />
        <select
          className={selectClass}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
        >
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select
          className={selectClass}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {[...masters.expenseGroups, ...masters.incomeGroups].map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
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
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} entries</span>
        <span className="text-success">Income {inr(totals.income)}</span>
        <span className="text-destructive">Expense {inr(totals.expense)}</span>
      </div>

      <section className="card-surface mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Remarks</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-3">{shortDate(t.date)}</td>
                <td className="px-4 py-3 capitalize">{t.type}</td>
                <td className="px-4 py-3">
                  {nameOf(t.groupId)}
                  <span className="text-muted-foreground"> · {nameOf(t.subGroupId)}</span>
                </td>
                <td className="px-4 py-3">{nameOf(t.paymentSourceId)}</td>
                <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground">{t.remarks}</td>
                <td
                  className={`num px-4 py-3 text-right font-medium ${
                    t.type === "income" ? "text-success" : "text-destructive"
                  }`}
                >
                  {inr(Number(t.amount))}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete"
                        onClick={async () => {
                          await deleteTransaction(t.id);
                          toast.success("Transaction deleted");
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No transactions match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit transaction" : "New transaction"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...form.register("date", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                className={selectClass}
                {...form.register("type", {
                  onChange: () => form.reset({ ...form.getValues(), groupId: "", subGroupId: "" }),
                })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="groupId">{type === "income" ? "Income group" : "Expense group"}</Label>
              <select id="groupId" className={selectClass} {...form.register("groupId", { required: true })}>
                <option value="">Select…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subGroupId">Sub group</Label>
              <select id="subGroupId" className={selectClass} {...form.register("subGroupId")}>
                <option value="">Select…</option>
                {subGroups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentSourceId">Payment source</Label>
              <select
                id="paymentSourceId"
                className={selectClass}
                {...form.register("paymentSourceId", { required: true })}
              >
                <option value="">Select…</option>
                {masters.paymentSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...form.register("amount", { required: true })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Input id="remarks" maxLength={500} placeholder="Optional note" {...form.register("remarks")} />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {editing ? "Save changes" : "Add transaction"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}