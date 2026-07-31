import { getFirestoreDb, isFirebaseConfigured } from "./firebase";
import { buildSeedRows } from "./seed";
import type { Budget, MasterCollection, MasterItem, Member, Transaction } from "./types";

export const MASTER_COLLECTIONS: MasterCollection[] = [
  "expenseGroups",
  "expenseSubGroups",
  "incomeGroups",
  "incomeSubGroups",
  "paymentSources",
];

type Row = Record<string, unknown> & { id: string };

export interface Repo {
  list(familyId: string, collection: string): Promise<Row[]>;
  create(familyId: string, collection: string, data: Record<string, unknown>): Promise<Row>;
  update(
    familyId: string,
    collection: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  remove(familyId: string, collection: string, id: string): Promise<void>;
}

/* ------------------------------ local fallback ----------------------------- */

const key = (familyId: string, collection: string) => `spendwise:${familyId}:${collection}`;

function read(familyId: string, collection: string): Row[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key(familyId, collection)) ?? "[]") as Row[];
  } catch {
    return [];
  }
}

function write(familyId: string, collection: string, rows: Row[]) {
  window.localStorage.setItem(key(familyId, collection), JSON.stringify(rows));
}

const localRepo: Repo = {
  async list(familyId, collection) {
    return read(familyId, collection);
  },
  async create(familyId, collection, data) {
    const rows = read(familyId, collection);
    const row = { ...data, id: crypto.randomUUID() } as Row;
    rows.push(row);
    write(familyId, collection, rows);
    return row;
  },
  async update(familyId, collection, id, data) {
    const rows = read(familyId, collection).map((r) => (r.id === id ? { ...r, ...data } : r));
    write(familyId, collection, rows);
  },
  async remove(familyId, collection, id) {
    write(
      familyId,
      collection,
      read(familyId, collection).filter((r) => r.id !== id),
    );
  },
};

/* -------------------------------- firestore -------------------------------- */

const firestoreRepo: Repo = {
  async list(familyId, collection) {
    const { db, mod } = await getFirestoreDb();
    const snap = await mod.getDocs(mod.collection(db, "families", familyId, collection));
    return snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
  },
  async create(familyId, collection, data) {
    const { db, mod } = await getFirestoreDb();
    const ref = await mod.addDoc(mod.collection(db, "families", familyId, collection), data);
    return { ...data, id: ref.id } as Row;
  },
  async update(familyId, collection, id, data) {
    const { db, mod } = await getFirestoreDb();
    await mod.updateDoc(mod.doc(db, "families", familyId, collection, id), data);
  },
  async remove(familyId, collection, id) {
    const { db, mod } = await getFirestoreDb();
    await mod.deleteDoc(mod.doc(db, "families", familyId, collection, id));
  },
};

export const repo: Repo = isFirebaseConfigured ? firestoreRepo : localRepo;

/* ---------------------------------- api ----------------------------------- */

const now = () => new Date().toISOString();

export async function loadMasters(familyId: string) {
  const entries = await Promise.all(
    MASTER_COLLECTIONS.map(async (c) => {
      const rows = (await repo.list(familyId, c)) as unknown as MasterItem[];
      return [c, rows.sort((a, b) => a.name.localeCompare(b.name))] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<MasterCollection, MasterItem[]>;
}

export async function loadTransactions(familyId: string) {
  const rows = (await repo.list(familyId, "transactions")) as unknown as Transaction[];
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Seeds master data the first time a family is created. */
export async function seedFamilyMasters(familyId: string) {
  const existing = await repo.list(familyId, "expenseGroups");
  if (existing.length > 0) return;

  const rows = buildSeedRows();
  const parents = new Map<string, string>();

  for (const row of rows.filter((r) => !r.parentName)) {
    const created = await repo.create(familyId, row.collection, {
      name: row.name,
      kind: row.kind ?? null,
      parentId: null,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
    parents.set(`${row.collection}:${row.name}`, created.id);
  }

  for (const row of rows.filter((r) => r.parentName)) {
    const parentCollection =
      row.collection === "expenseSubGroups" ? "expenseGroups" : "incomeGroups";
    await repo.create(familyId, row.collection, {
      name: row.name,
      parentId: parents.get(`${parentCollection}:${row.parentName}`) ?? null,
      kind: null,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });
  }
}
/** Registers the signed-in user as a member of the family (needed by Firestore rules). */
export async function ensureMembership(uid: string, familyId: string, profile: Record<string, unknown>) {
  if (!isFirebaseConfigured) return;
  const { db, mod } = await getFirestoreDb();
  await mod.setDoc(
    mod.doc(db, "users", uid),
    { ...profile, familyId, updatedAt: now() },
    { merge: true },
  );
  // Family-scoped member directory so both partners can see each other's names.
  await mod.setDoc(
    mod.doc(db, "families", familyId, "members", uid),
    { ...profile, updatedAt: now() },
    { merge: true },
  );
}

export async function loadMembers(familyId: string): Promise<Member[]> {
  const rows = (await repo.list(familyId, "members")) as unknown as Member[];
  return rows.sort((a, b) => (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? ""));
}

export async function loadBudgets(familyId: string): Promise<Budget[]> {
  const rows = (await repo.list(familyId, "budgets")) as unknown as Budget[];
  return rows.sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
}
