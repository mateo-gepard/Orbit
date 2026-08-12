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

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?.trim();
    if (appCheckSiteKey) {
      try {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (error) {
        // Hot reload may attempt a second initialization. Firebase continues to
        // use the first instance; other failures remain visible before launch.
        console.warn('[THREADMAP] Firebase App Check initialization failed:', error);
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error(
        '[THREADMAP] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is missing. Do not enable App Check enforcement until the production client is configured.',
      );
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
    cloudFunctions = getFunctions(app, 'us-central1');
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
}

export { app, appCheck, auth, db, cloudFunctions, googleProvider };
