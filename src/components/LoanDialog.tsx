import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { todayISO } from "@/lib/format";
import type { Loan } from "@/lib/types";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Draft = {
  name: string;
  subGroupName: string;
  principal: string;
  ratePercent: string;
  startDate: string;
  method: "emi" | "daily";
  note: string;
};

const blank = (): Draft => ({
  name: "",
  subGroupName: "",
  principal: "",
  ratePercent: "",
  startDate: todayISO(),
  method: "emi",
  note: "",
});

/** Validates a loan draft; returns the loan fields or an error message. */
function parseLoanDraft(d: Draft): Omit<Loan, "id"> | string {
  const name = d.name.trim();
  const principal = Number(d.principal);
  const rate = Number(d.ratePercent);
  if (!name) return "Enter a name for the loan";
  if (!d.subGroupName) return "Choose the sub group its payments are recorded under";
  if (!Number.isFinite(principal) || principal <= 0) return "Loan amount must be more than zero";
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "Interest rate must be 0–100%";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) return "Choose a start date";
  return {
    name: name.slice(0, 60),
    subGroupName: d.subGroupName,
    principal,
    annualRate: Math.round(rate * 10000) / 1000000,
    startDate: d.startDate,
    method: d.method,
    note: d.note.trim().slice(0, 200),
  };
}

export function LoanDialog({
  open,
  onOpenChange,
  loan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan | null;
}) {
  const { masters, saveLoan } = useApp();
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);

  // Payments are matched to a loan by a sub group under the "Loans" expense group.
  const loanSubGroups = useMemo(() => {
    const loanGroups = new Set(
      masters.expenseGroups.filter((g) => g.name.trim().toLowerCase() === "loans").map((g) => g.id),
    );
    return masters.expenseSubGroups
      .filter((s) => loanGroups.has(s.parentId ?? ""))
      .map((s) => s.name)
      .sort();
  }, [masters]);

  useEffect(() => {
    if (!open) return;
    setDraft(
      loan
        ? {
            name: loan.name,
            subGroupName: loan.subGroupName,
            principal: String(loan.principal),
            ratePercent: String(Math.round(loan.annualRate * 1000000) / 10000),
            startDate: loan.startDate,
            method: loan.method,
            note: loan.note ?? "",
          }
        : blank(),
    );
  }, [open, loan]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseLoanDraft(draft);
    if (typeof parsed === "string") return toast.error(parsed);
    setBusy(true);
    try {
      await saveLoan(parsed, loan?.id);
      toast.success(loan ? "Loan updated" : "Loan added");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save loan");
    } finally {
      setBusy(false);
    }
  };

  const subGroupOptions =
    draft.subGroupName && !loanSubGroups.includes(draft.subGroupName)
      ? [draft.subGroupName, ...loanSubGroups]
      : loanSubGroups;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{loan ? "Edit loan" : "Add loan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="loan-name">Name</Label>
            <Input
              id="loan-name"
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Home Loan"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="loan-sub">Payments recorded under Loans ›</Label>
            <select
              id="loan-sub"
              className={selectClass}
              value={draft.subGroupName}
              onChange={(e) => set("subGroupName", e.target.value)}
            >
              <option value="">Choose a sub group…</option>
              {subGroupOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {loanSubGroups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add a sub group under the "Loans" expense group in Masters first.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-principal">Loan amount (₹)</Label>
            <Input
              id="loan-principal"
              inputMode="decimal"
              value={draft.principal}
              onChange={(e) => set("principal", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-rate">Interest rate (% a year)</Label>
            <Input
              id="loan-rate"
              inputMode="decimal"
              value={draft.ratePercent}
              onChange={(e) => set("ratePercent", e.target.value)}
              placeholder="9.99"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-start">Balance as on</Label>
            <Input
              id="loan-start"
              type="date"
              value={draft.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-method">Interest</Label>
            <select
              id="loan-method"
              className={selectClass}
              value={draft.method}
              onChange={(e) => set("method", e.target.value as Draft["method"])}
            >
              <option value="emi">Monthly EMI</option>
              <option value="daily">Daily balance (e.g. gold loan)</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="loan-note">Note</Label>
            <Input
              id="loan-note"
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="72 EMIs of ₹27,781 from 10 Nov 2026"
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
