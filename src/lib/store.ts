import { create } from "zustand";
import { getFirebaseAuth, isEmailAllowed, isFirebaseConfigured, sharedFamilyId } from "./firebase";
import {
  dedupeMasters,
  ensureMembership,
  loadBudgets,
  loadLoans,
  loadRecurring,
  seedLoans,
  loadMasters,
  loadMembers,
  loadTransactions,
  normalizeTransactions,
  repo,
  seedFamilyMasters,
} from "./repo";
import type {
  AppUser,
  Budget,
  Loan,
  MasterCollection,
  MasterItem,
  Member,
  RecurringRule,
  Role,
  Transaction,
} from "./types";
import { occurrenceTransaction, type Occurrence } from "./recurring";
import { normalizeDate } from "./format";

const emptyMasters = {
  expenseGroups: [],
  expenseSubGroups: [],
  expenseIncludes: [],
  incomeGroups: [],
  incomeSubGroups: [],
  investmentGroups: [],
  investmentSubGroups: [],
  paymentSources: [],
} as Record<MasterCollection, MasterItem[]>;

const LOCAL_USER_KEY = "spendwise:local-user";
const now = () => new Date().toISOString();

/** Every transaction is stored with a single canonical yyyy-MM-dd date. */
function withCanonicalDate<T extends Partial<Transaction>>(values: T): T {
  if (values.date == null) return values;
  const date = normalizeDate(values.date);
  if (!date) throw new Error(`Unrecognised date "${String(values.date)}".`);
  return { ...values, date };
}

interface AppState {
  ready: boolean;
  authError: string | null;
  dataError: string | null;
  loading: boolean;
  user: AppUser | null;
  masters: Record<MasterCollection, MasterItem[]>;
  transactions: Transaction[];
  members: Member[];
  budgets: Budget[];
  recurring: RecurringRule[];
  loans: Loan[];
  init: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  saveMaster: (
    collection: MasterCollection,
    values: Partial<MasterItem>,
    id?: string,
  ) => Promise<void>;
  deleteMaster: (collection: MasterCollection, id: string) => Promise<void>;
  saveTransaction: (values: Partial<Transaction>, id?: string) => Promise<void>;
  bulkImportTransactions: (rows: Array<Partial<Transaction>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  /** Puts a deleted transaction back under its original id (undo). */
  restoreTransaction: (transaction: Transaction) => Promise<void>;
  saveBudget: (values: BudgetInput) => Promise<void>;
  /** Saves several budgets; rows that saved are kept even if one fails. */
  saveBudgets: (values: BudgetInput[]) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  saveRecurring: (values: Partial<RecurringRule>, id?: string) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  /** Posts due months as entries; safe to repeat (deterministic ids). */
  postRecurring: (occurrences: Occurrence[]) => Promise<number>;
  skipRecurring: (ruleId: string, period: string) => Promise<void>;
  saveLoan: (values: Partial<Loan>, id?: string) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  /** Admin only: change another member's role. */
  setMemberRole: (uid: string, role: Role) => Promise<void>;
}

type BudgetInput = Partial<Budget> & { period: string; groupId: string };

const byName = (a: MasterItem, b: MasterItem) => a.name.localeCompare(b.name);
const byDateDesc = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date);
const byPeriodDesc = (a: Budget, b: Budget) => b.period.localeCompare(a.period);
const byRuleName = (a: RecurringRule, b: RecurringRule) => a.name.localeCompare(b.name);

let initialised = false;

/** Live listeners for the signed-in family; replaced on every sign-in. */
let unsubscribers: Array<() => void> = [];
export function stopLiveSync() {
  unsubscribers.forEach((stop) => stop());
  unsubscribers = [];
}

/** Keeps transactions and budgets in step with other family members' writes. */
export async function startLiveSync(
  familyId: string,
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
) {
  stopLiveSync();
  if (!repo.subscribe) return;
  const sameFamily = () => get().user?.familyId === familyId;
  const onError = (error: Error) => console.error("Live sync stopped", error);
  const stops = await Promise.all([
    repo.subscribe(
      familyId,
      "transactions",
      (rows) => {
        if (!sameFamily()) return;
        set({ transactions: normalizeTransactions(rows as unknown as Transaction[]) });
      },
      onError,
    ),
    repo.subscribe(
      familyId,
      "budgets",
      (rows) => {
        if (!sameFamily()) return;
        set({ budgets: (rows as unknown as Budget[]).sort(byPeriodDesc) });
      },
      onError,
    ),
  ]);
  if (sameFamily()) unsubscribers = stops;
  else stops.forEach((stop) => stop());
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  authError: null,
  dataError: null,
  loading: false,
  user: null,
  masters: emptyMasters,
  transactions: [],
  members: [],
  budgets: [],
  recurring: [],
  loans: [],

  init: () => {
    if (initialised || typeof window === "undefined") return;
    initialised = true;

    const boot = async (user: AppUser | null) => {
      set({ user });
      if (user) {
        try {
          await seedFamilyMasters(user.familyId);
          await seedLoans(user.familyId);
          set({ dataError: null });
        } catch (error) {
          console.error("Seeding master data failed", error);
          set({
            dataError:
              error instanceof Error && /permission|insufficient/i.test(error.message)
                ? "Firestore denied access. Deploy the security rules (firebase deploy --only firestore:rules) and make sure you are signed in with an allow-listed email."
                : (error instanceof Error ? error.message : "Could not load family data."),
          });
        }
        try {
          await get().refresh();
        } catch (error) {
          console.error("Loading family data failed", error);
        }
        // Merging duplicate masters scans every collection, so it runs after
        // the app is usable and reloads only if it actually changed something.
        void startLiveSync(user.familyId, set, get).catch((error) =>
          console.error("Starting live sync failed", error),
        );
        void dedupeMasters(user.familyId)
          .then((changed) => (changed ? get().refresh() : undefined))
          .catch((error) => console.error("Merging duplicate masters failed", error));
      } else {
        stopLiveSync();
        set({
          masters: emptyMasters,
          transactions: [],
          members: [],
          budgets: [],
          recurring: [],
          loans: [],
        });
      }
      set({ ready: true });
    };

    if (!isFirebaseConfigured) {
      const raw = window.localStorage.getItem(LOCAL_USER_KEY);
      void boot(raw ? (JSON.parse(raw) as AppUser) : null);
      return;
    }

    void (async () => {
      const { auth, mod } = await getFirebaseAuth();
      await mod.setPersistence(auth, mod.browserLocalPersistence);
      mod.onAuthStateChanged(auth, (fbUser) => {
        void (async () => {
          if (!fbUser) return boot(null);
          if (!isEmailAllowed(fbUser.email)) {
            await mod.signOut(auth);
            set({ authError: "This account is not allowed to access this workspace." });
            return boot(null);
          }
          const familyId = sharedFamilyId ?? fbUser.uid;
          // If the role cannot be read, fall back to the least surprising
          // safe default: can add entries, cannot delete or manage.
          let role: Role = "member";
          try {
            role = await ensureMembership(fbUser.uid, familyId, {
              email: fbUser.email,
              displayName: fbUser.displayName ?? fbUser.email,
            });
          } catch (error) {
            console.error("Registering membership failed", error);
          }
          await boot({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
            familyId,
            role,
          });
        })();
      });
    })();
  },

  signInWithGoogle: async () => {
    if (!isFirebaseConfigured) {
      return signInLocally("Demo User", "demo@spendwise.app", set);
    }
    const { auth, mod } = await getFirebaseAuth();
    await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
  },

  signInWithEmail: async (email, password) => {
    if (!isFirebaseConfigured) return signInLocally(email.split("@")[0], email, set);
    const { auth, mod } = await getFirebaseAuth();
    await mod.signInWithEmailAndPassword(auth, email, password);
  },

  signUpWithEmail: async (name, email, password) => {
    if (!isFirebaseConfigured) return signInLocally(name, email, set);
    const { auth, mod } = await getFirebaseAuth();
    const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
    await mod.updateProfile(cred.user, { displayName: name });
  },

  resetPassword: async (email) => {
    if (!isFirebaseConfigured) return;
    const { auth, mod } = await getFirebaseAuth();
    await mod.sendPasswordResetEmail(auth, email);
  },

  signOut: async () => {
    if (!isFirebaseConfigured) {
      window.localStorage.removeItem(LOCAL_USER_KEY);
      set({ user: null, masters: emptyMasters, transactions: [], members: [], budgets: [] });
      return;
    }
    const { auth, mod } = await getFirebaseAuth();
    await mod.signOut(auth);
  },

  refresh: async () => {
    const user = get().user;
    if (!user) return;
    set({ loading: true });
    try {
      const [masters, transactions, members, budgets, recurring, loans] = await Promise.all([
        loadMasters(user.familyId),
        loadTransactions(user.familyId),
        loadMembers(user.familyId).catch(() => [] as Member[]),
        loadBudgets(user.familyId).catch(() => [] as Budget[]),
        loadRecurring(user.familyId).catch(() => [] as RecurringRule[]),
        loadLoans(user.familyId).catch(() => [] as Loan[]),
      ]);
      set({ masters, transactions, members, budgets, recurring, loans });
    } finally {
      set({ loading: false });
    }
  },

  saveMaster: async (collection, values, id) => {
    const user = get().user;
    if (!user) return;
    if (id) {
      const patch = { ...values, updatedAt: now() };
      await repo.update(user.familyId, collection, id, patch);
      set((state) => ({
        masters: {
          ...state.masters,
          [collection]: state.masters[collection]
            .map((m) => (m.id === id ? { ...m, ...patch } : m))
            .sort(byName),
        },
      }));
    } else {
      const created = (await repo.create(user.familyId, collection, {
        name: "",
        parentId: null,
        kind: null,
        active: true,
        ...values,
        createdAt: now(),
        updatedAt: now(),
      })) as unknown as MasterItem;
      set((state) => ({
        masters: {
          ...state.masters,
          [collection]: [...state.masters[collection], created].sort(byName),
        },
      }));
    }
  },

  deleteMaster: async (collection, id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, collection, id);
    set((state) => ({
      masters: {
        ...state.masters,
        [collection]: state.masters[collection].filter((m) => m.id !== id),
      },
    }));
  },

  saveTransaction: async (values, id) => {
    const user = get().user;
    if (!user) return;
    values = withCanonicalDate(values);
    if (id) {
      const patch = { ...values, updatedAt: now() };
      await repo.update(user.familyId, "transactions", id, patch);
      set((state) => ({
        transactions: state.transactions
          .map((t) => t.id === id ? { ...t, ...patch } : t)
          .sort((a, b) => b.date.localeCompare(a.date)),
      }));
    } else {
      const created = await repo.create(user.familyId, "transactions", {
        ...values,
        createdBy: values.createdBy ?? user.uid,
        createdByName:
          values.createdByName ?? user.displayName ?? user.email ?? "Unknown",
        createdAt: now(),
        updatedAt: now(),
      });
      set((state) => ({
        transactions: [created as unknown as Transaction, ...state.transactions]
          .sort((a, b) => b.date.localeCompare(a.date)),
      }));
    }
  },

  bulkImportTransactions: async (rows) => {
    const user = get().user;
    if (!user) return;

    const canonicalRows = rows.map(withCanonicalDate);
    // Bound request concurrency and retain successfully saved rows if a later
    // write fails. Never reload unrelated collections after an import.
    for (let offset = 0; offset < canonicalRows.length; offset += 20) {
      const results = await Promise.allSettled(
        canonicalRows.slice(offset, offset + 20).map((values) =>
          repo.create(user.familyId, "transactions", {
          ...values,
          createdBy: values.createdBy ?? user.uid,
          createdByName:
            values.createdByName ?? user.displayName ?? user.email ?? "Unknown",
          createdAt: now(),
          updatedAt: now(),
          }),
        ),
      );
      const created = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value as unknown as Transaction] : [],
      );
      set((state) => ({
        transactions: [...created, ...state.transactions].sort((a, b) => b.date.localeCompare(a.date)),
      }));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
  },

  deleteTransaction: async (id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, "transactions", id);
    set((state) => ({ transactions: state.transactions.filter((t) => t.id !== id) }));
  },

  restoreTransaction: async (transaction) => {
    const user = get().user;
    if (!user) return;
    const { id, ...data } = transaction;
    await repo.set(user.familyId, "transactions", id, data);
    set((state) => ({
      transactions: [transaction, ...state.transactions.filter((t) => t.id !== id)].sort(
        byDateDesc,
      ),
    }));
  },

  saveBudget: async (values) => {
    const user = get().user;
    if (!user) return;
    const saved = await writeBudget(user.familyId, get().budgets, values);
    set((state) => ({ budgets: mergeBudgets(state.budgets, [saved]) }));
  },

  saveBudgets: async (list) => {
    const user = get().user;
    if (!user) return;
    const current = get().budgets;
    const results = await Promise.allSettled(
      list.map((values) => writeBudget(user.familyId, current, values)),
    );
    const saved = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    set((state) => ({ budgets: mergeBudgets(state.budgets, saved) }));
    const failure = results.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  },

  deleteBudget: async (id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, "budgets", id);
    set((state) => ({ budgets: state.budgets.filter((b) => b.id !== id) }));
  },

  saveRecurring: async (values, id) => {
    const user = get().user;
    if (!user) return;
    if (id) {
      const patch = { ...values, updatedAt: now() };
      await repo.update(user.familyId, "recurring", id, patch);
      set((state) => ({
        recurring: state.recurring.map((r) => (r.id === id ? { ...r, ...patch } : r)).sort(byRuleName),
      }));
    } else {
      const created = (await repo.create(user.familyId, "recurring", {
        skipped: [],
        active: true,
        endPeriod: null,
        ...values,
        createdAt: now(),
        updatedAt: now(),
      })) as unknown as RecurringRule;
      set((state) => ({ recurring: [...state.recurring, created].sort(byRuleName) }));
    }
  },

  deleteRecurring: async (id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, "recurring", id);
    set((state) => ({ recurring: state.recurring.filter((r) => r.id !== id) }));
  },

  postRecurring: async (occurrences) => {
    const user = get().user;
    if (!user) return 0;
    const by = { uid: user.uid, name: user.displayName ?? user.email ?? "Unknown" };
    let posted = 0;
    for (let offset = 0; offset < occurrences.length; offset += 20) {
      const batch = occurrences
        .slice(offset, offset + 20)
        .map((o) => occurrenceTransaction(o, by, now()));
      const results = await Promise.allSettled(
        batch.map(({ id, ...data }) => repo.set(user.familyId, "transactions", id, data)),
      );
      const saved = batch.filter((_, i) => results[i].status === "fulfilled");
      posted += saved.length;
      const ids = new Set(saved.map((t) => t.id));
      set((state) => ({
        transactions: [...saved, ...state.transactions.filter((t) => !ids.has(t.id))].sort(
          byDateDesc,
        ),
      }));
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    return posted;
  },

  skipRecurring: async (ruleId, period) => {
    const rule = get().recurring.find((r) => r.id === ruleId);
    if (!rule) return;
    const skipped = [...new Set([...(rule.skipped ?? []), period])].sort();
    await get().saveRecurring({ skipped }, ruleId);
  },

  saveLoan: async (values, id) => {
    const user = get().user;
    if (!user) return;
    if (id) {
      const patch = { ...values, updatedAt: now() };
      await repo.update(user.familyId, "loans", id, patch);
      set((state) => ({
        loans: state.loans.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      }));
    } else {
      const created = (await repo.create(user.familyId, "loans", {
        ...values,
        createdAt: now(),
        updatedAt: now(),
      })) as unknown as Loan;
      set((state) => ({ loans: [...state.loans, created] }));
    }
  },

  deleteLoan: async (id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, "loans", id);
    set((state) => ({ loans: state.loans.filter((l) => l.id !== id) }));
  },

  setMemberRole: async (uid, role) => {
    const user = get().user;
    if (!user) return;
    if (uid === user.uid) throw new Error("You cannot change your own role.");
    await repo.update(user.familyId, "members", uid, { role, updatedAt: now() });
    set((state) => ({
      members: state.members.map((m) => (m.id === uid ? { ...m, role } : m)),
    }));
  },
}));

/** Creates or updates the budget for (period, group) and returns the saved row. */
async function writeBudget(
  familyId: string,
  budgets: Budget[],
  { period, groupId, amount = 0, type = "expense", notes = null }: BudgetInput,
): Promise<Budget> {
  const existing = budgets.find((b) => b.period === period && b.groupId === groupId);
  const value = Number(amount) || 0;
  if (existing) {
    const patch = { amount: value, notes, updatedAt: now() };
    await repo.update(familyId, "budgets", existing.id, patch);
    return { ...existing, ...patch };
  }
  const created = await repo.create(familyId, "budgets", {
    period,
    groupId,
    type,
    amount: value,
    notes,
    createdAt: now(),
    updatedAt: now(),
  });
  return created as unknown as Budget;
}

function mergeBudgets(budgets: Budget[], saved: Budget[]) {
  const ids = new Set(saved.map((b) => b.id));
  return [...budgets.filter((b) => !ids.has(b.id)), ...saved].sort(byPeriodDesc);
}

function signInLocally(
  name: string,
  email: string,
  set: (partial: Partial<AppState>) => void,
): Promise<void> {
  const user: AppUser = {
    uid: "local-user",
    email,
    displayName: name,
    photoURL: null,
    familyId: "local-family",
    role: "admin",
  };
  window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  set({ user });
  return seedFamilyMasters(user.familyId).then(() => useApp.getState().refresh());
}