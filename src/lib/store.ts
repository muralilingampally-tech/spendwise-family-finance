import { create } from "zustand";
import { getFirebaseAuth, isEmailAllowed, isFirebaseConfigured, sharedFamilyId } from "./firebase";
import { ensureMembership, loadMasters, loadMembers, loadTransactions, repo, seedFamilyMasters } from "./repo";
import type { AppUser, MasterCollection, MasterItem, Member, Transaction } from "./types";

const emptyMasters = {
  expenseGroups: [],
  expenseSubGroups: [],
  incomeGroups: [],
  incomeSubGroups: [],
  paymentSources: [],
} as Record<MasterCollection, MasterItem[]>;

const LOCAL_USER_KEY = "spendwise:local-user";
const now = () => new Date().toISOString();

interface AppState {
  ready: boolean;
  authError: string | null;
  loading: boolean;
  user: AppUser | null;
  masters: Record<MasterCollection, MasterItem[]>;
  transactions: Transaction[];
  members: Member[];
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
  deleteTransaction: (id: string) => Promise<void>;
}

let initialised = false;

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  authError: null,
  loading: false,
  user: null,
  masters: emptyMasters,
  transactions: [],
  members: [],

  init: () => {
    if (initialised || typeof window === "undefined") return;
    initialised = true;

    const boot = async (user: AppUser | null) => {
      set({ user });
      if (user) {
        try {
          await seedFamilyMasters(user.familyId);
        } catch (error) {
          console.error("Seeding master data failed", error);
        }
        try {
          await get().refresh();
        } catch (error) {
          console.error("Loading family data failed", error);
        }
      } else {
        set({ masters: emptyMasters, transactions: [], members: [] });
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
          try {
            await ensureMembership(fbUser.uid, familyId, {
              email: fbUser.email,
              displayName: fbUser.displayName ?? fbUser.email,
              role: "admin",
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
            role: "admin",
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
      set({ user: null, masters: emptyMasters, transactions: [], members: [] });
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
      const [masters, transactions, members] = await Promise.all([
        loadMasters(user.familyId),
        loadTransactions(user.familyId),
        loadMembers(user.familyId).catch(() => [] as Member[]),
      ]);
      set({ masters, transactions, members });
    } finally {
      set({ loading: false });
    }
  },

  saveMaster: async (collection, values, id) => {
    const user = get().user;
    if (!user) return;
    if (id) {
      await repo.update(user.familyId, collection, id, { ...values, updatedAt: now() });
    } else {
      await repo.create(user.familyId, collection, {
        name: "",
        parentId: null,
        kind: null,
        active: true,
        ...values,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    await get().refresh();
  },

  deleteMaster: async (collection, id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, collection, id);
    await get().refresh();
  },

  saveTransaction: async (values, id) => {
    const user = get().user;
    if (!user) return;
    if (id) {
      await repo.update(user.familyId, "transactions", id, { ...values, updatedAt: now() });
    } else {
      await repo.create(user.familyId, "transactions", {
        ...values,
        createdBy: values.createdBy ?? user.uid,
        createdByName:
          values.createdByName ?? user.displayName ?? user.email ?? "Unknown",
        createdAt: now(),
        updatedAt: now(),
      });
    }
    await get().refresh();
  },

  deleteTransaction: async (id) => {
    const user = get().user;
    if (!user) return;
    await repo.remove(user.familyId, "transactions", id);
    await get().refresh();
  },
}));

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