import { MASTER_COLLECTIONS, repo } from "./repo";

/** Collections captured in a backup: every master list plus entries and budgets. */
export const BACKUP_COLLECTIONS = [...MASTER_COLLECTIONS, "transactions", "budgets"] as const;
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

type Row = Record<string, unknown> & { id: string };

export interface Backup {
  app: "spendwise";
  format: 1;
  exportedAt: string;
  familyId: string;
  collections: Record<BackupCollection, Row[]>;
}

/** Reads every backed-up collection for the family. */
export async function createBackup(familyId: string): Promise<Backup> {
  const entries = await Promise.all(
    BACKUP_COLLECTIONS.map(async (c) => [c, await repo.list(familyId, c)] as const),
  );
  return {
    app: "spendwise",
    format: 1,
    exportedAt: new Date().toISOString(),
    familyId,
    collections: Object.fromEntries(entries) as Backup["collections"],
  };
}

export function backupFilename(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `spendwise-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/** Validates a backup file's contents; throws a readable error if it is not one. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const b = data as Partial<Backup> | null;
  if (
    !b ||
    b.app !== "spendwise" ||
    b.format !== 1 ||
    typeof b.collections !== "object" ||
    !b.collections
  ) {
    throw new Error("This file is not a SpendWise backup.");
  }
  const collections = {} as Backup["collections"];
  for (const c of BACKUP_COLLECTIONS) {
    const rows = (b.collections as Record<string, unknown>)[c] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Backup section "${c}" is malformed.`);
    for (const r of rows) {
      if (!r || typeof r !== "object" || typeof (r as Row).id !== "string" || !(r as Row).id) {
        throw new Error(`Backup section "${c}" has a record without an id.`);
      }
    }
    collections[c] = rows as Row[];
  }
  return {
    app: "spendwise",
    format: 1,
    exportedAt: String(b.exportedAt ?? ""),
    familyId: String(b.familyId ?? ""),
    collections,
  };
}

export function backupCounts(backup: Backup) {
  const masters = MASTER_COLLECTIONS.reduce((n, c) => n + backup.collections[c].length, 0);
  return {
    masters,
    transactions: backup.collections.transactions.length,
    budgets: backup.collections.budgets.length,
  };
}

/**
 * Writes every record in the backup back under its original id. Records that
 * already exist are overwritten with the backed-up version; records created
 * after the backup are left alone, so restoring never deletes anything and
 * restoring the same file twice creates no duplicates.
 */
export async function restoreBackup(
  familyId: string,
  backup: Backup,
  onProgress?: (done: number, total: number) => void,
) {
  const jobs = BACKUP_COLLECTIONS.flatMap((c) => backup.collections[c].map((row) => ({ c, row })));
  let done = 0;
  for (let offset = 0; offset < jobs.length; offset += 20) {
    await Promise.all(
      jobs.slice(offset, offset + 20).map(async ({ c, row }) => {
        const { id, ...data } = row;
        await repo.set(familyId, c, id, data);
      }),
    );
    done = Math.min(jobs.length, offset + 20);
    onProgress?.(done, jobs.length);
  }
  return done;
}
