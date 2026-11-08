import { beforeEach, describe, expect, mock, test } from "bun:test";

const list = mock(async () => []);
const create = mock(async (_family: string, _collection: string, data: Record<string, unknown>) => ({ ...data, id: "saved-entry" }));
const update = mock(async () => {});
const remove = mock(async () => {});
mock.module("./repo", () => ({
  repo: { list, create, update, remove },
  ensureMembership: async () => {},
  seedFamilyMasters: async () => {},
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
  list.mockClear(); create.mockClear(); update.mockClear(); remove.mockClear();
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