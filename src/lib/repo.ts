import { getFirestoreDb, isFirebaseConfigured } from "./firebase";
import { normalizeDate } from "./format";
import { SEED_VERSION, buildSeedRows } from "./seed";
import type { Budget, MasterCollection, MasterItem, Member, Transaction } from "./types";

export const MASTER_COLLECTIONS: MasterCollection[] = [
  "expenseGroups",
  "expenseSubGroups",
  "expenseIncludes",
  "incomeGroups",
  "incomeSubGroups",
  "investmentGroups",
  "investmentSubGroups",
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
  // Older rows may carry a non-canonical date; normalise on read so filters,
  // sorting and reports all work on a single yyyy-MM-dd format.
  return rows
    .map((t) => ({ ...t, date: normalizeDate(t.date) ?? t.date }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const versionKey = (familyId: string) => `spendwise:${familyId}:seedVersion`;

async function readSeedVersion(familyId: string): Promise<number> {
  if (!isFirebaseConfigured) {
    return Number(window.localStorage.getItem(versionKey(familyId)) ?? 0);
  }
  const { db, mod } = await getFirestoreDb();
  const snap = await mod.getDoc(mod.doc(db, "families", familyId, "meta", "seed"));
  return Number((snap.data() as { version?: number } | undefined)?.version ?? 0);
}

async function writeSeedVersion(familyId: string, version: number) {
  if (!isFirebaseConfigured) {
    window.localStorage.setItem(versionKey(familyId), String(version));
    return;
  }
  const { db, mod } = await getFirestoreDb();
  await mod.setDoc(
    mod.doc(db, "families", familyId, "meta", "seed"),
    { version, updatedAt: now() },
    { merge: true },
  );
}

async function wipeCollection(familyId: string, collection: string) {
  const rows = await repo.list(familyId, collection);
  await Promise.all(rows.map((r) => repo.remove(familyId, collection, r.id)));
}

/**
 * Seeds master data for a new family, and reseeds once whenever SEED_VERSION
 * changes (the master structure was replaced, so stale rows and the entries
 * pointing at them are cleared first).
 */
export async function seedFamilyMasters(familyId: string) {
  const version = await readSeedVersion(familyId);
  const existing = await repo.list(familyId, "expenseGroups");
  if (version >= SEED_VERSION && existing.length > 0) return;

  if (version < SEED_VERSION) {
    for (const c of [...MASTER_COLLECTIONS, "transactions", "budgets"]) {
      await wipeCollection(familyId, c);
    }
  }

  const parents = new Map<string, string>();

  for (const row of buildSeedRows()) {
    const created = await repo.create(familyId, row.collection, {
      name: row.name,
      parentId: row.parentKey ? (parents.get(row.parentKey) ?? null) : null,
      kind: row.kind ?? null,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    });

    if (!row.parentKey) {
      parents.set(`${row.collection}:${row.name}`, created.id);
    } else if (row.collection === "expenseSubGroups") {
      const groupName = row.parentKey.split(":")[1];
      parents.set(`expenseSubGroups:${groupName} › ${row.name}`, created.id);
    }
  }

  await writeSeedVersion(familyId, SEED_VERSION);
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
