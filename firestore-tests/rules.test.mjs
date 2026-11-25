// Security-rules tests for firestore.rules, run against the Firestore emulator:
//   cd firestore-tests && npm install && npm test
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const FAMILY = "our-family";
const ADMIN = { uid: "admin", email: "muralik0909@gmail.com" };
const PARTNER = { uid: "partner", email: "gatlarajeshwari09@gmail.com" };
const STRANGER = { uid: "stranger", email: "someone@example.com" };

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-spendwise",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const db = (who) => env.authenticatedContext(who.uid, { email: who.email }).firestore();
const path = (...p) => ["families", FAMILY, ...p];
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const setRole = (who, role) =>
  seed((d) => setDoc(doc(d, ...path("members", who.uid)), { email: who.email, role }));

const txn = {
  date: "2026-11-08",
  type: "expense",
  groupId: "food",
  subGroupId: null,
  paymentSourceId: "cash",
  amount: 250,
  remarks: "Lunch",
  createdBy: "admin",
};

describe("who can get in", () => {
  test("a stranger cannot read or write family data", async () => {
    await assertFails(getDoc(doc(db(STRANGER), ...path("transactions", "t"))));
    await assertFails(setDoc(doc(db(STRANGER), ...path("transactions", "t")), txn));
  });

  test("an allow-listed user can register and then read", async () => {
    await assertSucceeds(
      setDoc(doc(db(ADMIN), ...path("members", ADMIN.uid)), { email: ADMIN.email, role: "admin" }),
    );
    await assertSucceeds(getDoc(doc(db(ADMIN), ...path("transactions", "t"))));
  });

  test("nobody can register someone else", async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), ...path("members", PARTNER.uid)), { email: PARTNER.email, role: "admin" }),
    );
  });
});

describe("roles", () => {
  test("members created before roles existed are treated as admin", async () => {
    await seed((d) => setDoc(doc(d, ...path("members", ADMIN.uid)), { email: ADMIN.email }));
    await assertSucceeds(setDoc(doc(db(ADMIN), ...path("transactions", "t")), txn));
    await assertSucceeds(deleteDoc(doc(db(ADMIN), ...path("transactions", "t"))));
  });

  test("a member can add and edit entries but not delete", async () => {
    await setRole(PARTNER, "member");
    const ref = doc(db(PARTNER), ...path("transactions", "t"));
    await assertSucceeds(setDoc(ref, txn));
    await assertSucceeds(updateDoc(ref, { amount: 300 }));
    await assertFails(deleteDoc(ref));
  });

  test("a viewer can read but not write", async () => {
    await setRole(PARTNER, "viewer");
    await assertSucceeds(getDoc(doc(db(PARTNER), ...path("transactions", "t"))));
    await assertFails(setDoc(doc(db(PARTNER), ...path("transactions", "t")), txn));
    await assertFails(
      setDoc(doc(db(PARTNER), ...path("budgets", "b")), { period: "2026-11", groupId: "g", amount: 1 }),
    );
  });

  test("a signed-in user with no member record cannot write", async () => {
    await assertFails(setDoc(doc(db(PARTNER), ...path("transactions", "t")), txn));
  });

  test("nobody can change their own role", async () => {
    await setRole(PARTNER, "viewer");
    const ref = doc(db(PARTNER), ...path("members", PARTNER.uid));
    await assertFails(updateDoc(ref, { role: "admin" }));
    // Refreshing their own profile on sign-in is still fine.
    await assertSucceeds(setDoc(ref, { displayName: "Partner" }, { merge: true }));
  });

  test("an admin can change someone else's role; a member cannot", async () => {
    await setRole(ADMIN, "admin");
    await setRole(PARTNER, "member");
    await assertSucceeds(updateDoc(doc(db(ADMIN), ...path("members", PARTNER.uid)), { role: "viewer" }));
    await assertFails(updateDoc(doc(db(PARTNER), ...path("members", ADMIN.uid)), { role: "viewer" }));
    await assertFails(updateDoc(doc(db(ADMIN), ...path("members", PARTNER.uid)), { role: "owner" }));
  });
});

describe("shape checks", () => {
  beforeEach(() => setRole(ADMIN, "admin"));
  const put = (col, data) => setDoc(doc(db(ADMIN), ...path(col, "x")), data);

  test("transactions need a yyyy-MM-dd date, a known type and a positive amount", async () => {
    await assertSucceeds(put("transactions", txn));
    await assertFails(put("transactions", { ...txn, date: "08/11/2026" }));
    await assertFails(put("transactions", { ...txn, type: "gift" }));
    await assertFails(put("transactions", { ...txn, amount: 0 }));
    await assertFails(put("transactions", { ...txn, amount: "250" }));
    await assertFails(put("transactions", { ...txn, groupId: "" }));
    await assertFails(put("transactions", { ...txn, remarks: "x".repeat(501) }));
    await assertFails(put("transactions", { ...txn, necessity: "luxury" }));
  });

  test("budgets need a yyyy-MM period and a non-negative amount", async () => {
    const b = { period: "2026-11", type: "expense", groupId: "food", amount: 0 };
    await assertSucceeds(put("budgets", b));
    await assertFails(put("budgets", { ...b, period: "Nov 2026" }));
    await assertFails(put("budgets", { ...b, amount: -1 }));
  });

  test("recurring rules and loans are validated", async () => {
    const r = {
      name: "Rent", type: "expense", groupId: "home", subGroupId: null, paymentSourceId: "bank",
      amount: 18000, remarks: "", dayOfMonth: 5, startPeriod: "2026-11", endPeriod: null,
      skipped: [], active: true,
    };
    await assertSucceeds(put("recurring", r));
    await assertFails(put("recurring", { ...r, dayOfMonth: 32 }));
    await assertFails(put("recurring", { ...r, dayOfMonth: 5.5 }));
    const l = {
      name: "Home Loan", subGroupName: "Home Loan", principal: 2500000, annualRate: 0.085,
      startDate: "2026-11-01", method: "emi", note: "",
    };
    await assertSucceeds(put("loans", l));
    await assertFails(put("loans", { ...l, annualRate: 8.5 }));
    await assertFails(put("loans", { ...l, method: "weekly" }));
  });

  test("an edit that leaves a valid entry is allowed; one that breaks it is not", async () => {
    await assertSucceeds(put("transactions", txn));
    const ref = doc(db(ADMIN), ...path("transactions", "x"));
    await assertSucceeds(updateDoc(ref, { groupId: "travel" }));
    await assertFails(updateDoc(ref, { amount: -5 }));
  });

  test("masters need a name; members may add (sign-in seeding) but not delete", async () => {
    await setRole(PARTNER, "member");
    await assertSucceeds(put("expenseGroups", { name: "Food", parentId: null, active: true }));
    await assertFails(put("expenseGroups", { name: "" }));
    await assertSucceeds(
      setDoc(doc(db(PARTNER), ...path("expenseGroups", "y")), { name: "Travel", active: true }),
    );
    await assertFails(deleteDoc(doc(db(PARTNER), ...path("expenseGroups", "y"))));
  });

  test("seed and migration flags can be written by members, not viewers", async () => {
    await setRole(PARTNER, "viewer");
    await assertSucceeds(setDoc(doc(db(ADMIN), ...path("meta", "seed")), { version: 2 }));
    await assertFails(setDoc(doc(db(PARTNER), ...path("meta", "seed")), { version: 3 }));
  });
});
