/**
 * Firebase bootstrap.
 *
 * Configuration comes from Vite env vars so the app can be pointed at any
 * Firebase project without code changes. Copy `.env.example` to `.env` and
 * fill in the values from Firebase Console > Project settings > Your apps.
 *
 * When the config is absent the app falls back to a local (browser-storage)
 * data layer so the UI is fully usable before Firebase is connected.
 */
/**
 * Defaults for the connected Firebase project (spendwise-1d96c). These are
 * publishable web-app identifiers — Firebase security is enforced by Auth +
 * Firestore rules, not by hiding this config. Env vars still win if set.
 */
const defaults = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "spendwise-1d96c.firebaseapp.com",
  projectId: "spendwise-1d96c",
  storageBucket: "spendwise-1d96c.firebasestorage.app",
  messagingSenderId: "341730373725",
  appId: "1:341730373725:web:a63adbe2949ac361fb9db4",
};

const env = import.meta.env as Record<string, string | undefined>;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || defaults.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || defaults.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || defaults.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || defaults.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaults.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || defaults.appId,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

/**
 * Shared workspace: both partners sign in with their own account but read/write
 * the same family data when VITE_FAMILY_ID is set to the same value.
 */
export const sharedFamilyId = env.VITE_FAMILY_ID?.trim() || "our-family";

/** Optional allow-list — only these email addresses may use the app. */
export const allowedEmails = (env.VITE_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const isEmailAllowed = (email: string | null | undefined) =>
  allowedEmails.length === 0 || (!!email && allowedEmails.includes(email.toLowerCase()));

let appPromise: Promise<unknown> | null = null;

async function getApp() {
  if (!isFirebaseConfigured) throw new Error("Firebase is not configured");
  if (!appPromise) {
    appPromise = (async () => {
      const { initializeApp, getApps, getApp: get } = await import("firebase/app");
      return getApps().length ? get() : initializeApp(config as Record<string, string>);
    })();
  }
  return appPromise;
}

export async function getFirebaseAuth() {
  const [app, mod] = await Promise.all([getApp(), import("firebase/auth")]);
  return { auth: mod.getAuth(app as never), mod };
}

export async function getFirestoreDb() {
  const [app, mod] = await Promise.all([getApp(), import("firebase/firestore")]);
  return { db: mod.getFirestore(app as never), mod };
}