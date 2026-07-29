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
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

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