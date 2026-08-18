import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inr, shortDate } from "@/lib/format";
import { signedInvestment } from "@/lib/investment";
import type { Transaction } from "@/lib/types";

export interface DrilldownProps {
  title: string;
  transactions: Transaction[];
  nameOf: (id: string | null) => string;
  memberName: (t: Transaction) => string;
  onClose: () => void;
}

/** Modal listing every transaction behind a total, by date with narration. */
export function TxnDrilldown({ title, transactions, nameOf, memberName, onClose }: DrilldownProps) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.reduce((sum, t) => {
    const amount = Number(t.amount);
    if (t.type === "income") return sum + amount;
    if (t.type === "investment") return sum + signedInvestment(nameOf(t.subGroupId), amount);
    return sum - amount;
  }, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {sorted.length} {sorted.length === 1 ? "entry" : "entries"} · net {inr(total)}
          </p>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Narration</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-2.5">{shortDate(t.date)}</td>
                  <td className="px-4 py-2.5">
                    {nameOf(t.groupId)}
                    <span className="text-muted-foreground"> · {nameOf(t.subGroupId)}</span>
                    {t.includesId && (
                      <span className="text-muted-foreground"> · {nameOf(t.includesId)}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {nameOf(t.paymentSourceId)} · {memberName(t)}
                      {t.necessity ? ` · ${t.necessity}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{t.remarks || "—"}</td>
                  <td
                    className={`num px-4 py-2.5 text-right font-medium ${
                      t.type === "income" ? "text-success" : t.type === "expense" ? "text-destructive" : ""
                    }`}
                  >
                    {t.type === "investment"
                      ? inr(signedInvestment(nameOf(t.subGroupId), Number(t.amount)))
                      : `${t.type === "income" ? "+" : "−"}${inr(Number(t.amount))}`}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No transactions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
