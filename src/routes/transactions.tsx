import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { inr, normalizeDate, shortDate, todayISO } from "@/lib/format";
import { NECESSITY_GROUPS } from "@/lib/seed";
import type { Necessity, Transaction, TransactionType } from "@/lib/types";

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
  includesId: string;
  necessity: "" | Necessity;
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
  includesId: "",
  necessity: "",
  paymentSourceId: "",
  amount: "",
  remarks: "",
  createdBy: "",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        records.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      records.push(row);
    }
  }

  return records;
}

function TransactionsPage() {
  const {
    transactions,
    masters,
    members,
    saveTransaction,
    bulkImportTransactions,
    deleteTransaction,
    user,
  } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const subGroupId = form.watch("subGroupId");

  const groups =
    type === "income"
      ? masters.incomeGroups
      : type === "investment"
        ? masters.investmentGroups
        : masters.expenseGroups;
  const subGroups = (
    type === "income"
      ? masters.incomeSubGroups
      : type === "investment"
        ? masters.investmentSubGroups
        : masters.expenseSubGroups
  ).filter((s) => s.parentId === groupId);
  const includesOptions =
    type === "expense" ? masters.expenseIncludes.filter((i) => i.parentId === subGroupId) : [];
  const showNecessity =
    type === "expense" &&
    NECESSITY_GROUPS.includes(masters.expenseGroups.find((g) => g.id === groupId)?.name ?? "");

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

  const allGroupNames = useMemo(
    () =>
      [...masters.expenseGroups, ...masters.incomeGroups, ...masters.investmentGroups].map(
        (g) => g.name,
      ),
    [masters.expenseGroups, masters.incomeGroups, masters.investmentGroups],
  );

  const allSubGroupNames = useMemo(
    () =>
      masters.expenseSubGroups
        .concat(masters.incomeSubGroups, masters.investmentSubGroups)
        .map((g) => g.name),
    [masters.expenseSubGroups, masters.incomeSubGroups, masters.investmentSubGroups],
  );

  const allPaymentSourceNames = useMemo(
    () => masters.paymentSources.map((s) => s.name),
    [masters.paymentSources],
  );

  const allMemberNames = useMemo(
    () => memberOptions.map((m) => m.name),
    [memberOptions],
  );

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
    let investment = 0;
    filtered.forEach((t) => {
      if (t.type === "income") income += Number(t.amount);
      else if (t.type === "investment")
        investment += signedInvestment(nameOf(t.subGroupId), Number(t.amount));
      else expense += Number(t.amount);
    });
    return { income, expense, investment };
  }, [filtered, nameOf]);

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
      includesId: t.includesId ?? "",
      necessity: t.necessity ?? "",
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
          includesId: values.type === "expense" ? values.includesId || null : null,
          necessity: values.type === "expense" ? (values.necessity || null) : null,
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

  const exportTemplate = () => {
    const helperLines = [
      "# Groups: " + allGroupNames.join(" | "),
      "# Sub groups: " + allSubGroupNames.join(" | "),
      "# Payment sources: " + allPaymentSourceNames.join(" | "),
      "# Entry by: " + allMemberNames.join(" | "),
      "# Date: yyyy-mm-dd preferred; dd/mm/yyyy, dd-mm-yyyy and 31 Jul 2026 also work.",
      "",
    ];
    const header = [
      "Date",
      "Type",
      "Group",
      "Sub group",
      "Includes",
      "Necessity",
      "Payment source",
      "Amount",
      "Remarks",
      "Entry by",
    ];
    const exampleRows = [
      [
        todayISO(),
        "expense",
        "Outside food",
        "Food order",
        "Munchies",
        "discretionary",
        "Swiggy Card",
        "250",
        "Evening order",
        user?.displayName || "",
      ],
      [
        todayISO(),
        "income",
        "Income",
        "Salary",
        "",
        "",
        "ICICI-MK",
        "12000",
        "Salary credit",
        user?.displayName || "",
      ],
    ];
    const csv = [
      ...helperLines,
      header.join(","),
      ...exampleRows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `spendwise-transactions-template-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const text = await file.text();
      const rows = parseCsvRecords(text).filter((record) => record.some((value) => value.trim() !== ""));
      const dataRows = rows.filter((record) => !record[0].trim().startsWith("#"));
      if (dataRows.length < 2) throw new Error("This CSV does not contain any transaction rows.");

      const header = dataRows[0].map((value) => normalizeHeader(value));
      const findColumn = (names: string[]) => {
        const idx = header.findIndex((value) => names.some((name) => value === name));
        if (idx === -1) throw new Error(`Missing required CSV column: ${names.join(" or ")}.`);
        return idx;
      };

      const dateIndex = findColumn(["date"]);
      const typeIndex = findColumn(["type"]);
      const groupIndex = findColumn(["group", "groupname"]);
      const subGroupIndex = findColumn(["subgroup", "subgroupname"]);
      const paymentSourceIndex = findColumn(["paymentsource", "paymentsourcename"]);
      const amountIndex = findColumn(["amount"]);
      const remarksIndex = findColumn(["remarks"]);
      const entryByIndex = header.findIndex((value) => value === "entryby");
      const includesIndex = header.findIndex((value) => value === "includes");
      const necessityIndex = header.findIndex(
        (value) => value === "necessity" || value === "tag",
      );

      const groupLookup = new Map<string, string>();
      masters.expenseGroups.forEach((item) => {
        groupLookup.set(`expense:${item.name.trim().toLowerCase()}`, item.id);
      });
      masters.incomeGroups.forEach((item) => {
        groupLookup.set(`income:${item.name.trim().toLowerCase()}`, item.id);
      });
      masters.investmentGroups.forEach((item) => {
        groupLookup.set(`investment:${item.name.trim().toLowerCase()}`, item.id);
      });

      const subGroupLookup = new Map<string, string>();
      masters.expenseSubGroups.forEach((item) => {
        subGroupLookup.set(`expense:${item.name.trim().toLowerCase()}`, item.id);
      });
      masters.incomeSubGroups.forEach((item) => {
        subGroupLookup.set(`income:${item.name.trim().toLowerCase()}`, item.id);
      });
      masters.investmentSubGroups.forEach((item) => {
        subGroupLookup.set(`investment:${item.name.trim().toLowerCase()}`, item.id);
      });

      const includesLookup = new Map<string, string>();
      masters.expenseIncludes.forEach((item) => {
        includesLookup.set(item.name.trim().toLowerCase(), item.id);
      });

      const paymentSourceLookup = new Map<string, string>();
      masters.paymentSources.forEach((item) => {
        paymentSourceLookup.set(item.name.trim().toLowerCase(), item.id);
      });

      const memberLookup = new Map<string, string>();
      memberOptions.forEach((member) => {
        memberLookup.set(member.name.trim().toLowerCase(), member.id);
      });

      const records = dataRows.slice(1).map((record, index) => {
        const row = index + 2;
        const rawDate = record[dateIndex]?.trim();
        const type = record[typeIndex]?.trim().toLowerCase();
        const groupName = record[groupIndex]?.trim();
        const subGroupName = record[subGroupIndex]?.trim();
        const paymentSourceName = record[paymentSourceIndex]?.trim();
        const amount = Number(record[amountIndex]?.trim());
        const remarks = record[remarksIndex]?.trim() ?? "";
        const entryByName = entryByIndex >= 0 ? record[entryByIndex]?.trim() ?? "" : "";
        const includesName = includesIndex >= 0 ? record[includesIndex]?.trim() ?? "" : "";
        const necessityRaw =
          necessityIndex >= 0 ? (record[necessityIndex]?.trim().toLowerCase() ?? "") : "";

        const date = normalizeDate(rawDate);
        if (!date) {
          throw new Error(
            `Row ${row}: could not read the date "${rawDate ?? ""}". Use yyyy-mm-dd, dd/mm/yyyy or 31 Jul 2026.`,
          );
        }
        if (type !== "income" && type !== "expense" && type !== "investment") {
          throw new Error(`Row ${row}: type must be income, expense or investment.`);
        }
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error(`Row ${row}: amount must be greater than zero.`);
        }

        const groupId = groupLookup.get(`${type}:${groupName.trim().toLowerCase()}`);
        if (!groupId) {
          throw new Error(`Row ${row}: group "${groupName}" was not found in your configured ${type} masters.`);
        }

        const paymentSourceId = paymentSourceLookup.get(paymentSourceName.trim().toLowerCase());
        if (!paymentSourceId) {
          throw new Error(`Row ${row}: payment source "${paymentSourceName}" was not found in your configured masters.`);
        }

        const subGroupId = subGroupName
          ? subGroupLookup.get(`${type}:${subGroupName.trim().toLowerCase()}`) ?? null
          : null;

        const createdBy = entryByName
          ? memberLookup.get(entryByName.trim().toLowerCase()) ?? user?.uid ?? ""
          : user?.uid ?? "";

        return {
          date,
          type,
          groupId,
          subGroupId,
          includesId: includesName ? includesLookup.get(includesName.toLowerCase()) ?? null : null,
          necessity:
            necessityRaw === "essential" || necessityRaw === "discretionary"
              ? (necessityRaw as Necessity)
              : null,
          paymentSourceId,
          amount,
          remarks,
          createdBy,
          createdByName: entryByName || user?.displayName || user?.email || "Unknown",
        } satisfies Partial<Transaction>;
      });

      await bulkImportTransactions(records);
      toast.success(`Imported ${records.length} transaction${records.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import CSV file");
    } finally {
      setImporting(false);
      if (event.target) event.target.value = "";
    }
  };

  return (
    <AppShell
      title="Transactions"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportTemplate}>
            <Download className="mr-1 h-4 w-4" /> Export CSV template
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1 h-4 w-4" /> {importing ? "Importing…" : "Import CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={importCsv}
          />
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>
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
          <option value="investment">Investment</option>
        </select>
        <select
          className={selectClass}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {[...masters.expenseGroups, ...masters.incomeGroups, ...masters.investmentGroups].map((g) => (
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
        <select
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
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} entries</span>
        <span className="text-success">Income {inr(totals.income)}</span>
        <span className="text-destructive">Expense {inr(totals.expense)}</span>
        <span className="text-primary">Investments {inr(totals.investment)}</span>
      </div>

      <section className="card-surface mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Tag</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">User</th>
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
                  {t.includesId && (
                    <span className="text-muted-foreground"> · {nameOf(t.includesId)}</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{t.necessity ?? "—"}</td>
                <td className="px-4 py-3">{nameOf(t.paymentSourceId)}</td>
                <td className="whitespace-nowrap px-4 py-3">{memberName(t)}</td>
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
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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
                  onChange: () =>
                    form.reset({
                      ...form.getValues(),
                      groupId: "",
                      subGroupId: "",
                      includesId: "",
                      necessity: "",
                    }),
                })}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="groupId">
                {type === "income"
                  ? "Income group"
                  : type === "investment"
                    ? "Investment group"
                    : "Expense group"}
              </Label>
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
              <select
                id="subGroupId"
                className={selectClass}
                {...form.register("subGroupId", {
                  onChange: () => form.setValue("includesId", ""),
                })}
              >
                <option value="">Select…</option>
                {subGroups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {includesOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="includesId">Includes</Label>
                <select id="includesId" className={selectClass} {...form.register("includesId")}>
                  <option value="">Select…</option>
                  {includesOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {showNecessity && (
              <div className="space-y-1.5">
                <Label htmlFor="necessity">Essential or discretionary</Label>
                <select id="necessity" className={selectClass} {...form.register("necessity")}>
                  <option value="">Not specified</option>
                  <option value="essential">Essential</option>
                  <option value="discretionary">Discretionary</option>
                </select>
              </div>
            )}
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
            <div className="space-y-1.5">
              <Label htmlFor="createdBy">Entry by</Label>
              <select id="createdBy" className={selectClass} {...form.register("createdBy")}>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
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