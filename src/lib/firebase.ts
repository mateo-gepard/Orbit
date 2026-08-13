import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import {
  firebaseConfig,
  isFirebaseConfigured,
  isFirebaseStorageConfigured,
  missingFirebaseEnv,
} from './firebase-config';

export { isFirebaseConfigured, isFirebaseStorageConfigured, missingFirebaseEnv };

// Only initialize Firebase on the client side
let app: ReturnType<typeof initializeApp> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let cloudFunctions: ReturnType<typeof getFunctions> | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let appCheck: AppCheck | null = null;
let appCheckPromise: Promise<AppCheck | null> | null = null;

/**
 * Initialize App Check before any protected Firebase service is accessed.
 * Authentication enforcement applies before a user exists, so deferring this
 * until cloud data connects would make every sign-in method fail.
 */
export function ensureAppCheck(): Promise<AppCheck | null> {
  if (appCheck) return Promise.resolve(appCheck);
  if (appCheckPromise) return appCheckPromise;

  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  if (!app || !siteKey) return Promise.resolve(null);

  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckPromise = Promise.resolve(appCheck);
  } catch (error) {
    // Hot reload may attempt a second initialization. Firebase continues to
    // use the first instance; other failures remain visible before launch.
    console.warn('[THREADMAP] Firebase App Check initialization failed:', error);
    appCheckPromise = Promise.resolve(null);
  }

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
    } else if (appCheckSiteKey) {
      // App Check must be registered before Auth, Firestore, or Functions so
      // their first request can include a valid attestation token.
      void ensureAppCheck();
    }
    auth = getAuth(app);
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      // Firestore may already be initialized during hot reload. Reuse it.
      db = getFirestore(app);
    }
    cloudFunctions = getFunctions(app, 'europe-west1');
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
}

export { app, appCheck, auth, db, cloudFunctions, googleProvider };
