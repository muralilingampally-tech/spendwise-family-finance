/// <reference types="bun" />
import { beforeEach, describe, expect, mock, test } from "bun:test";

// Force the browser-storage repo and give it an in-memory localStorage.
mock.module("./firebase", () => ({
  isFirebaseConfigured: false,
  sharedFamilyId: null,
  allowedEmails: [],
  isEmailAllowed: () => true,
  getFirebaseAuth: async () => {
    throw new Error("Firebase Auth must not be used in these tests");
  },
  getFirestoreDb: async () => {
    throw new Error("Firestore must not be used in these tests");
  },
}));
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const { repo, seedFamilyMasters } = await import("./repo");
const { SEED_VERSION } = await import("./seed");
const { backupCounts, createBackup, parseBackup, restoreBackup } = await import("./backup");

const FAMILY = "fam";
const entry = { date: "2026-11-08", type: "expense", amount: 250, remarks: "Lunch" };

beforeEach(() => store.clear());

describe("seeding never loses data", () => {
  test("a new family gets the starter masters", async () => {
    await seedFamilyMasters(FAMILY);
    expect((await repo.list(FAMILY, "expenseGroups")).length).toBeGreaterThan(0);
    expect((await repo.list(FAMILY, "paymentSources")).length).toBeGreaterThan(0);
  });

  test("a seed version upgrade keeps entries, budgets and custom masters", async () => {
    await seedFamilyMasters(FAMILY);
    const groups = await repo.list(FAMILY, "expenseGroups");
    const custom = await repo.create(FAMILY, "expenseGroups", {
      name: "My Custom Group",
      active: true,
    });
    await repo.create(FAMILY, "transactions", { ...entry, groupId: groups[0].id });
    await repo.create(FAMILY, "budgets", {
      period: "2026-11",
      groupId: groups[0].id,
      amount: 5000,
    });
    // Simulate an older workspace, as if SEED_VERSION had just been bumped.
    store.set(`spendwise:${FAMILY}:seedVersion`, String(SEED_VERSION - 1));

    await seedFamilyMasters(FAMILY);

    expect(await repo.list(FAMILY, "transactions")).toHaveLength(1);
    expect(await repo.list(FAMILY, "budgets")).toHaveLength(1);
    const after = await repo.list(FAMILY, "expenseGroups");
    expect(after.map((g) => g.id)).toContain(custom.id);
    // Starter masters that already existed are reused, not duplicated.
    expect(after).toHaveLength(groups.length + 1);
    expect(store.get(`spendwise:${FAMILY}:seedVersion`)).toBe(String(SEED_VERSION));
  });

  test("an upgrade restores a missing starter master without touching the rest", async () => {
    await seedFamilyMasters(FAMILY);
    const before = await repo.list(FAMILY, "paymentSources");
    await repo.remove(FAMILY, "paymentSources", before[0].id);
    store.set(`spendwise:${FAMILY}:seedVersion`, String(SEED_VERSION - 1));

    await seedFamilyMasters(FAMILY);

    const after = await repo.list(FAMILY, "paymentSources");
    expect(after).toHaveLength(before.length);
    expect(after.map((p) => p.name).sort()).toEqual(before.map((p) => p.name).sort());
  });
});

describe("backup and restore", () => {
  test("round-trips every record under its original id", async () => {
    await seedFamilyMasters(FAMILY);
    const t = await repo.create(FAMILY, "transactions", entry);
    await repo.create(FAMILY, "budgets", { period: "2026-11", groupId: "g", amount: 5000 });
    const backup = parseBackup(JSON.stringify(await createBackup(FAMILY)));

    store.clear();
    await restoreBackup(FAMILY, backup);

    const txns = await repo.list(FAMILY, "transactions");
    expect(txns).toEqual([{ ...entry, id: t.id }]);
    expect(backupCounts(await createBackup(FAMILY))).toEqual(backupCounts(backup));
  });

  test("restoring twice creates no duplicates and keeps newer records", async () => {
    await repo.create(FAMILY, "transactions", entry);
    const backup = await createBackup(FAMILY);
    const newer = await repo.create(FAMILY, "transactions", { ...entry, amount: 99 });

    await restoreBackup(FAMILY, backup);
    await restoreBackup(FAMILY, backup);

    const txns = await repo.list(FAMILY, "transactions");
    expect(txns).toHaveLength(2);
    expect(txns.map((x) => x.id)).toContain(newer.id);
  });

  test("rejects files that are not SpendWise backups", () => {
    expect(() => parseBackup("not json")).toThrow("not valid JSON");
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow("not a SpendWise backup");
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: "spendwise",
          format: 1,
          collections: { transactions: [{ amount: 1 }] },
        }),
      ),
    ).toThrow("without an id");
  });
});
