import { initializeApp, getApps } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import {
  firebaseConfig,
  isFirebaseConfigured,
  isFirebaseStorageConfigured,
  missingFirebaseEnv,
} from './firebase-config';
import { FIREBASE_FUNCTIONS_REGION } from './deployment-config';

export { isFirebaseConfigured, isFirebaseStorageConfigured, missingFirebaseEnv };

// Only initialize Firebase on the client side
let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let cloudFunctions: ReturnType<typeof getFunctions> | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let appCheck: AppCheck | null = null;
let appCheckPromise: Promise<AppCheck | null> | null = null;
let firestoreTerminationPromise: Promise<void> | null = null;

const FIRESTORE_CLEAR_REQUEST_KEY = 'threadmapFirestoreClearRequest';
const FIRESTORE_PERSISTENCE_BLOCKED_KEY = 'threadmapFirestorePersistenceBlocked';
const FIRESTORE_PERSISTENCE_CLEARED_KEY = 'threadmapFirestorePersistenceCleared';

function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function firestorePersistenceShouldBeBlocked(
  storage: Pick<Storage, 'getItem'> | null,
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(FIRESTORE_PERSISTENCE_BLOCKED_KEY) === '1';
  } catch {
    return true;
  }
}

export function writeFirestoreClearCoordinationMarkers(
  storage: Pick<Storage, 'setItem'> | null,
  requestId: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FIRESTORE_PERSISTENCE_BLOCKED_KEY, '1');
    storage.setItem(FIRESTORE_CLEAR_REQUEST_KEY, requestId);
    return true;
  } catch {
    return false;
  }
}

export function recordFirestorePersistenceCleared(
  storage: Pick<Storage, 'setItem'> | null,
  clearedAt: number,
): boolean {
  if (!storage) return false;
  try {
    // This is diagnostic state only. It must never remove or override the
    // durable block written before secure sign-out/deletion.
    storage.setItem(FIRESTORE_PERSISTENCE_CLEARED_KEY, String(clearedAt));
    return true;
  } catch {
    return false;
  }
}

function persistentFirestoreIsBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return firestorePersistenceShouldBeBlocked(browserLocalStorage());
}

async function terminateCurrentFirestore(): Promise<void> {
  if (firestoreTerminationPromise) return firestoreTerminationPromise;
  const current = db;
  if (!current) return;
  // Clear the exported live binding before awaiting so no new operation can
  // enter the instance while it is being terminated.
  db = null;
  firestoreTerminationPromise = terminate(current).finally(() => {
    firestoreTerminationPromise = null;
  });
  return firestoreTerminationPromise;
}

/**
 * Forget Firestore's cross-session IndexedDB cache after account deletion.
 *
 * A storage event asks sibling tabs to terminate their Firestore clients first.
 * If another context still holds the database, the durable block flag makes all
 * subsequent page loads use memory-only caching instead of reopening private
 * data. A successful clear records diagnostic state, but the durable block is
 * intentionally monotonic until a future explicit trusted-device action opts
 * back into offline persistence after fresh authentication.
 */
export async function clearFirestorePersistence(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  const localStorage = browserLocalStorage();
  const requestId = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  let coordinationComplete = writeFirestoreClearCoordinationMarkers(localStorage, requestId);

  const current = db;
  const persistenceTarget = current ?? (app ? getFirestore(app) : null);
  try {
    await terminateCurrentFirestore();
    // Give sibling tabs one event-loop turn to observe the storage event and
    // terminate their own instances before the shared IndexedDB clear begins.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    if (!persistenceTarget) return false;
    await clearIndexedDbPersistence(persistenceTarget);
    coordinationComplete = recordFirestorePersistenceCleared(localStorage, Date.now())
      && coordinationComplete;
    return coordinationComplete;
  } catch (error) {
    // Keep the persistence block in place. This is safer than silently
    // reopening a cache that another tab or browser policy prevented clearing.
    console.warn('[THREADMAP] Firestore device cache could not be cleared; persistent caching remains disabled:', error);
    return false;
  }
}

/**
 * Initialize App Check only when cloud authentication or data is about to be
 * used. Keeping the implementation behind a dynamic import prevents local-only
 * sessions from downloading the App Check SDK and reCAPTCHA runtime.
 */
export function ensureAppCheck(): Promise<AppCheck | null> {
  if (appCheck) return Promise.resolve(appCheck);
  if (appCheckPromise) return appCheckPromise;

  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  if (!app || !siteKey) return Promise.resolve(null);
  const firebaseApp = app;

  appCheckPromise = (async () => {
    try {
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
      appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      return appCheck;
    } catch (error) {
      // Hot reload may attempt a second initialization. Firebase continues to
      // use the first instance; other failures remain visible before launch.
      console.warn('[THREADMAP] Firebase App Check initialization failed:', error);
      return null;
    }
  })();

  return appCheckPromise;
}

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim();
    if (!appCheckSiteKey && process.env.NODE_ENV === 'production') {
      console.error(
        '[THREADMAP] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is missing. Do not enable App Check enforcement until the production client is configured.',
      );
    }
    auth = getAuth(app);
    const persistenceWasBlocked = persistentFirestoreIsBlocked();
    try {
      db = initializeFirestore(app, {
        localCache: persistenceWasBlocked
          ? memoryLocalCache()
          : persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
      });
    } catch {
      // Firestore may already be initialized during hot reload. Reuse it.
      db = getFirestore(app);
    }
    cloudFunctions = getFunctions(app, FIREBASE_FUNCTIONS_REGION);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== FIRESTORE_CLEAR_REQUEST_KEY || !event.newValue) return;
    try {
      browserLocalStorage()?.setItem(FIRESTORE_PERSISTENCE_BLOCKED_KEY, '1');
    } catch {
      // This tab still terminates immediately below. A blocked marker means its
      // next initialization will choose memory-only via the guarded read.
    }
    // Clearing the exported binding immediately prevents new reads. Reload
    // after termination so this tab receives a fresh memory-only Firestore
    // instance instead of remaining permanently unusable.
    void terminateCurrentFirestore().finally(() => window.location.reload());
  });
}

export { app, appCheck, auth, db, cloudFunctions, googleProvider };
