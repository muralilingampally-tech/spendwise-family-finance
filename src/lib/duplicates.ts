import type { Transaction } from "./types";

type Comparable = Pick<
  Transaction,
  "date" | "type" | "groupId" | "subGroupId" | "paymentSourceId" | "amount" | "remarks"
>;

/** Everything that makes two entries "the same entry" for import purposes. */
export function entrySignature(t: Partial<Comparable>) {
  return [
    t.date ?? "",
    t.type ?? "",
    t.groupId ?? "",
    t.subGroupId ?? "",
    t.paymentSourceId ?? "",
    (Number(t.amount) || 0).toFixed(2),
    (t.remarks ?? "").trim().toLowerCase(),
  ].join("|");
}

/**
 * Indexes of `rows` that match an entry already saved. Matching is one-to-one:
 * if two identical teas are saved and the file has three, only two are flagged,
 * so genuinely repeated entries in a file are never lost.
 */
export function findSavedDuplicates(
  existing: Partial<Comparable>[],
  rows: Partial<Comparable>[],
): number[] {
  const counts = new Map<string, number>();
  for (const t of existing) {
    const k = entrySignature(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    const k = entrySignature(row);
    const n = counts.get(k) ?? 0;
    if (n > 0) {
      duplicates.push(index);
      counts.set(k, n - 1);
    }
  });
  return duplicates;
}
