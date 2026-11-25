/// <reference types="bun" />
import { beforeEach, describe, expect, mock, test } from "bun:test";

const list = mock(async () => []);
const create = mock(async (_family: string, _collection: string, data: Record<string, unknown>) => ({ ...data, id: "saved-entry" }));
const update = mock(async () => {});
const remove = mock(async () => {});
const set = mock(async () => {});
mock.module("./repo", () => ({
  repo: { list, create, update, remove, set },
  ensureMembership: async () => {},
  seedFamilyMasters: async () => {},
  dedupeMasters: async () => false,
  loadMasters: list,
  loadTransactions: list,
  loadMembers: list,
  loadBudgets: list,
}));
const { useApp } = await import("./store");

const entry = {
  date: "2026-11-08", type: "expense" as const, groupId: "food",
  subGroupId: null, paymentSourceId: "cash", amount: 250,
  remarks: "Lunch", createdBy: "test-user", createdAt: "2026-11-08", updatedAt: "2026-11-08",
};

beforeEach(() => {
  list.mockClear(); create.mockClear(); update.mockClear(); remove.mockClear(); set.mockClear();
  useApp.setState({
    user: { uid: "test-user", familyId: "test-family", displayName: "Tester", email: null, photoURL: null, role: "admin" },
    transactions: [],
  });
});

describe("entry updates without full-family reloads", () => {
  test("a confirmed save appears with its persistent ID and canonical date", async () => {
    await useApp.getState().saveTransaction({ ...entry, date: "08/11/2026" });
    expect(useApp.getState().transactions[0]).toMatchObject({ id: "saved-entry", date: "2026-11-08", amount: 250 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(0);
  });
  test("editing preserves other entries and updates date ordering", async () => {
    useApp.setState({ transactions: [{ ...entry, id: "edit" }, { ...entry, id: "other" }] });
    await useApp.getState().saveTransaction({ amount: 400, date: "2026-11-09" }, "edit");
    expect(useApp.getState().transactions.map((t) => [t.id, t.amount])).toEqual([["edit", 400], ["other", 250]]);
    expect(list).toHaveBeenCalledTimes(0);
  });
  test("deleting removes only the confirmed entry", async () => {
    useApp.setState({ transactions: [{ ...entry, id: "delete" }, { ...entry, id: "keep" }] });
    await useApp.getState().deleteTransaction("delete");
    expect(useApp.getState().transactions.map((t) => t.id)).toEqual(["keep"]);
    expect(list).toHaveBeenCalledTimes(0);
  });
  test("failed writes leave the saved list unchanged", async () => {
    create.mockImplementationOnce(async () => { throw new Error("Write denied"); });
    await expect(useApp.getState().saveTransaction(entry)).rejects.toThrow("Write denied");
    expect(useApp.getState().transactions).toEqual([]);
  });
  test("imports update the list without rereading family collections", async () => {
    await useApp.getState().bulkImportTransactions([entry, { ...entry, amount: 100 }]);
    expect(useApp.getState().transactions.map((t) => t.amount)).toEqual([250, 100]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledTimes(0);
  });
});
const master = (id: string, name: string) => ({
  id, name, parentId: null, kind: null, active: true, createdAt: "", updatedAt: "",
});
const emptyMasters = {
  expenseGroups: [], expenseSubGroups: [], expenseIncludes: [], incomeGroups: [],
  incomeSubGroups: [], investmentGroups: [], investmentSubGroups: [], paymentSources: [],
};

describe("masters and budgets save without full-family reloads", () => {
  test("adding, renaming and deleting a master updates only that list", async () => {
    useApp.setState({ masters: { ...emptyMasters, expenseGroups: [master("b", "Bills")] } });
    create.mockImplementationOnce(async (_f: string, _c: string, data: Record<string, unknown>) => ({ ...data, id: "a" }));
    await useApp.getState().saveMaster("expenseGroups", { name: "Auto" });
    expect(useApp.getState().masters.expenseGroups.map((m) => m.name)).toEqual(["Auto", "Bills"]);

    await useApp.getState().saveMaster("expenseGroups", { name: "Utilities" }, "b");
    expect(useApp.getState().masters.expenseGroups.map((m) => m.name)).toEqual(["Auto", "Utilities"]);

    await useApp.getState().deleteMaster("expenseGroups", "a");
    expect(useApp.getState().masters.expenseGroups.map((m) => m.id)).toEqual(["b"]);
    expect(list).toHaveBeenCalledTimes(0);
  });

  test("a failed master write leaves the list unchanged", async () => {
    useApp.setState({ masters: { ...emptyMasters, expenseGroups: [master("b", "Bills")] } });
    remove.mockImplementationOnce(async () => { throw new Error("denied"); });
    await expect(useApp.getState().deleteMaster("expenseGroups", "b")).rejects.toThrow("denied");
    expect(useApp.getState().masters.expenseGroups).toHaveLength(1);
  });

  test("saving many budgets updates existing rows and adds new ones, no reload", async () => {
    useApp.setState({
      budgets: [{ id: "x", period: "2026-11", type: "expense", groupId: "food", amount: 100, createdAt: "", updatedAt: "" }],
    });
    create.mockImplementationOnce(async (_f: string, _c: string, data: Record<string, unknown>) => ({ ...data, id: "y" }));
    await useApp.getState().saveBudgets([
      { period: "2026-11", groupId: "food", amount: 500 },
      { period: "2026-11", groupId: "rent", amount: 9000 },
    ]);
    const budgets = useApp.getState().budgets;
    expect(budgets.find((b) => b.groupId === "food")?.amount).toBe(500);
    expect(budgets.find((b) => b.groupId === "rent")?.id).toBe("y");
    expect(budgets).toHaveLength(2);
    expect(list).toHaveBeenCalledTimes(0);
  });

  test("when one budget fails, the ones that saved are kept and the error surfaces", async () => {
    useApp.setState({ budgets: [] });
    create
      .mockImplementationOnce(async (_f: string, _c: string, data: Record<string, unknown>) => ({ ...data, id: "ok" }))
      .mockImplementationOnce(async () => { throw new Error("offline"); });
    await expect(
      useApp.getState().saveBudgets([
        { period: "2026-11", groupId: "a", amount: 1 },
        { period: "2026-11", groupId: "b", amount: 2 },
      ]),
    ).rejects.toThrow("offline");
    expect(useApp.getState().budgets.map((b) => b.id)).toEqual(["ok"]);
  });
});

describe("undo delete", () => {
  test("restoring puts the entry back under the same id", async () => {
    const t = { ...entry, id: "gone" };
    useApp.setState({ transactions: [{ ...entry, id: "keep", date: "2026-11-01" }] });
    await useApp.getState().restoreTransaction(t);
    expect(set).toHaveBeenCalledTimes(1);
    expect((set.mock.calls[0] as unknown[])[2]).toBe("gone");
    expect(useApp.getState().transactions.map((x) => x.id)).toEqual(["gone", "keep"]);
  });
});
