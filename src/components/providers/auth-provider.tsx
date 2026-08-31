'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  isSignInWithEmailLink,
  signInWithEmailLink,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type User,
  type IdTokenResult,
  type MultiFactorResolver,
} from 'firebase/auth';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { auth, ensureAppCheck, googleProvider } from '@/lib/firebase';
import {
  clearGoogleCalendarOutboundJournal,
  stopGoogleCalendarSync,
} from '@/lib/google-calendar-sync';
import {
  clearGoogleAccessToken,
  hasCalendarPermission,
  revokeGoogleCalendarAccess,
  setGoogleCalendarOwner,
} from '@/lib/google-calendar';
import { revokeCalendarIntegrationForAccountDeletion } from '@/lib/account-integration-cleanup';
import { quiesceSettingsStore, useSettingsStore } from '@/lib/settings-store';
import { useAbiturStore } from '@/lib/abitur-store';
import { useToolboxStore } from '@/lib/toolbox-store';
import { useWishlistStore } from '@/lib/wishlist-store';
import { detachThreadmapSyncWithoutPersistence } from '@/lib/store';
import {
  deleteAccountData,
  forgetAccountDataOnDevice,
  type AccountDeletionResult,
} from '@/lib/account-data';
import { setFCMRegistrationOwner, unregisterFCMToken } from '@/lib/fcm';
import { setFlightStorageOwner } from '@/lib/flight';
import {
  closeOwnerDerivedNotifications,
  clearBriefingScheduleForSignOut,
  quiesceLocalNotificationOwner,
  stopHabitReminderScheduler,
} from '@/lib/briefing-notifications';
import { findTotpFactor, normalizeTotpCode, recoverMfaWithCode } from '@/lib/mfa';
import { sendThreadmapAuthEmail } from '@/lib/auth-email';
import {
  clearPendingEmailLinkAddress,
  readPendingEmailLinkAddress,
  storePendingEmailLinkAddress,
} from '@/lib/auth-email-link-storage';
import { clearPendingConsentPath } from '@/lib/mcp-consent-return';
import {
  ACCOUNT_DELETION_OUTCOME_KEY,
  ACCOUNT_SIGN_OUT_OUTCOME_KEY,
  clearAuthSessionHandoff,
  takeAuthSessionHandoff,
  writeAuthSessionHandoff,
} from '@/lib/auth-session-handoff';
import { isRecentLoginRequiredError } from '@/lib/auth-reauth';
import { isMobile, isStandalone } from '@/lib/mobile';
import { setFirestoreDataContext } from '@/lib/firestore';

const MfaChallengeDialog = dynamic(
  () => import('@/components/auth/mfa-challenge-dialog').then((module) => module.MfaChallengeDialog),
  { ssr: false },
);

/**
 * How long to wait for Firebase to report an auth state before falling back to
 * whatever local mode the browser already has. Long enough not to pre-empt a
 * slow but working connection; short enough that a broken one is not a blank
 * page.
 */
const AUTH_STATE_TIMEOUT_MS = 8_000;

const GOOGLE_REDIRECT_PENDING_KEY = 'threadmapGoogleRedirectPending';
const LOCAL_MODE_KEY = 'orbitLocalMode';
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Firebase is not configured. Local mode is available on this device.';

export type EmailLinkState = 'idle' | 'needs-email' | 'signing-in' | 'error';

export interface SignOutOptions {
  /** Used only when local mode intentionally transitions into cloud sign-in. */
  preserveLocalWorkspace?: boolean;
}

export interface SignOutResult {
  success: true;
  /** Account-scoped browser storage, handoffs, and Firestore persistence were removed. */
  localCleanupComplete: boolean;
  /** Browser push transport and the persisted briefing schedule were disabled. */
  notificationCleanupComplete: boolean;
  /** Firebase Auth confirmed that the device session was signed out. */
  authCleanupComplete: true;
  reloadScheduled: boolean;
}

export interface AccountDeletionOutcome extends AccountDeletionResult {
  notificationCleanupComplete: boolean;
  authCleanupComplete: boolean;
  /** Third-party Calendar consent was revoked or no integration was configured. */
  integrationCleanupComplete: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  emailLinkState: EmailLinkState;
  emailLinkError: string | null;
  completeEmailLink: (email: string) => Promise<void>;
  cancelEmailLink: () => void;
  continueAsDemo: () => Promise<void>;
  /** @deprecated Use continueAsDemo. */
  enterDemoMode: () => Promise<void>;
  deleteAccount: () => Promise<AccountDeletionOutcome>;
  signOut: (options?: SignOutOptions) => Promise<SignOutResult>;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  sendEmailLink: async () => {},
  emailLinkState: 'idle',
  emailLinkError: null,
  completeEmailLink: async () => {},
  cancelEmailLink: () => {},
  continueAsDemo: async () => {},
  enterDemoMode: async () => {},
  deleteAccount: async () => ({
    success: true,
    pending: false,
    status: 'completed',
    localCleanupComplete: true,
    notificationCleanupComplete: true,
    authCleanupComplete: true,
    integrationCleanupComplete: true,
  }),
  signOut: async () => ({
    success: true,
    localCleanupComplete: true,
    notificationCleanupComplete: true,
    authCleanupComplete: true,
    reloadScheduled: false,
  }),
  isDemo: false,
});

function createDemoUser(): User {
  return {
    uid: 'demo-user',
    displayName: 'Demo User',
    email: 'demo@threadmap.local',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerId: 'demo',
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => '',
    getIdTokenResult: async () => ({} as IdTokenResult),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
}

function isLocalModeEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LOCAL_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function setLocalModeEnabled(enabled: boolean): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (enabled) {
      window.localStorage.setItem(LOCAL_MODE_KEY, '1');
    } else {
      window.localStorage.removeItem(LOCAL_MODE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

function clearTransientAuthHandoffs(): boolean {
  const emailCleared = clearPendingEmailLinkAddress();
  const consentCleared = clearPendingConsentPath();
  const redirectCleared = clearAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY);
  return emailCleared && consentCleared && redirectCleared;
}

function cleanupSettledSuccessfully(result: PromiseSettledResult<unknown>): boolean {
  return result.status === 'fulfilled' && result.value !== false;
}

function quiesceAccountActivity(userId: string | null): boolean {
  // Invalidate every post-await Firestore/Calendar generation before removing
  // its durable browser keys. This ordering prevents in-flight work from
  // recreating account-scoped data after secure forget.
  // Cancel every store's queued cloud generation synchronously. React effect
  // cleanup happens later and is not a safe barrier: a catch/finally handler
  // could otherwise persist into the just-cleared UID key in the same turn.
  detachThreadmapSyncWithoutPersistence();
  useAbiturStore.getState()._setSyncUserId(null);
  useToolboxStore.getState()._setSyncUserId(null);
  useWishlistStore.getState()._setSyncUserId(null);
  quiesceSettingsStore();
  setFirestoreDataContext(null, 'signed-out');
  setFlightStorageOwner(null);
  setFCMRegistrationOwner(null);
  stopHabitReminderScheduler();
  void quiesceLocalNotificationOwner(userId);
  stopGoogleCalendarSync();
  setGoogleCalendarOwner(null);
  return clearGoogleCalendarOutboundJournal(userId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [emailLinkState, setEmailLinkState] = useState<EmailLinkState>('idle');
  const [emailLinkError, setEmailLinkError] = useState<string | null>(null);
  const [pendingEmailLinkUrl, setPendingEmailLinkUrl] = useState<string | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const emailLinkCheckedRef = useRef(false);
  const observedFirebaseUidRef = useRef<string | null>(auth?.currentUser?.uid || null);

  useEffect(() => {
    // Purge or migrate abandoned raw email-link state even when this page is
    // not itself an email-link callback.
    readPendingEmailLinkAddress();
    const raw = takeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY);
    if (!raw) return;
    // One-shot by design: a reload or navigation must not repeatedly announce
    // an old destructive action.
    try {
      const outcome = JSON.parse(raw) as {
        status?: unknown;
        localCleanupComplete?: unknown;
        notificationCleanupComplete?: unknown;
        authCleanupComplete?: unknown;
        integrationCleanupComplete?: unknown;
        recordedAt?: unknown;
      };
      const recordedAt = Number(outcome.recordedAt || 0);
      if (!Number.isFinite(recordedAt) || Date.now() - recordedAt > 10 * 60_000) return;
      const german = navigator.language.toLowerCase().startsWith('de');
      const localCleanupComplete = outcome.localCleanupComplete !== false;
      const notificationCleanupComplete = outcome.notificationCleanupComplete !== false;
      const authCleanupComplete = outcome.authCleanupComplete !== false;
      const integrationCleanupComplete = outcome.integrationCleanupComplete !== false;
      const teardownComplete = localCleanupComplete
        && notificationCleanupComplete
        && authCleanupComplete
        && integrationCleanupComplete;
      if (!teardownComplete) {
        const status = german
          ? outcome.status === 'unknown'
            ? 'Der Löschstatus konnte nicht bestätigt werden.'
            : outcome.status === 'pending'
              ? 'Die Kontolöschung wurde angenommen und wird im Hintergrund abgeschlossen.'
              : 'Dein Konto wurde gelöscht.'
          : outcome.status === 'unknown'
            ? 'Deletion status could not be confirmed.'
            : outcome.status === 'pending'
              ? 'Account deletion was accepted and is finishing in the background.'
              : 'Your account was deleted.';
        const warnings = german ? [
          ...(authCleanupComplete ? ['Du wurdest abgemeldet.'] : ['Die lokale Abmeldung konnte nicht bestätigt werden.']),
          ...(localCleanupComplete ? [] : ['Ein Teil der Browserdaten konnte nicht entfernt werden; dauerhaftes Caching bleibt deaktiviert. Schließe alle Threadmap-Tabs.']),
          ...(notificationCleanupComplete ? [] : ['Die Benachrichtigungsregistrierung konnte nicht vollständig deaktiviert werden. Deaktiviere Threadmap-Benachrichtigungen in den Browser-Einstellungen.']),
          ...(integrationCleanupComplete ? [] : ['Die Google-Kalenderfreigabe konnte nicht bestätigt werden. Entferne Threadmap gegebenenfalls in den Sicherheitseinstellungen deines Google-Kontos.']),
          ...(outcome.status === 'unknown' ? ['Melde dich später erneut an oder kontaktiere den Support, um den Status zu prüfen.'] : []),
        ] : [
          ...(authCleanupComplete ? ['You were signed out.'] : ['Local sign-out could not be confirmed.']),
          ...(localCleanupComplete ? [] : ['Some browser data could not be removed; persistent caching remains disabled. Close every Threadmap tab.']),
          ...(notificationCleanupComplete ? [] : ['The notification registration could not be fully disabled. Turn off Threadmap notifications in your browser settings.']),
          ...(integrationCleanupComplete ? [] : ['Google Calendar consent could not be confirmed revoked. Remove Threadmap in your Google Account security settings if it is still listed.']),
          ...(outcome.status === 'unknown' ? ['Sign in later or contact support to recheck the status.'] : []),
        ];
        toast.warning(`${status} ${warnings.join(' ')}`);
      } else if (outcome.status === 'unknown') {
        toast.warning(german
          ? 'Der Löschstatus konnte nicht bestätigt werden. Du wurdest sicher abgemeldet und die Kontodaten dieses Geräts wurden entfernt. Melde dich später erneut an oder kontaktiere den Support, um den Status zu prüfen.'
          : 'Deletion status could not be confirmed. You were securely signed out and this device’s account data was removed. Sign in later or contact support to recheck the status.');
      } else if (outcome.status === 'pending') {
        toast.info(german
          ? 'Die Kontolöschung wurde angenommen und wird im Hintergrund abgeschlossen. Du bist abgemeldet und die Kontodaten auf diesem Gerät wurden entfernt.'
          : 'Account deletion was accepted and is finishing in the background. You are signed out and this device’s account data was removed.');
      } else if (outcome.status === 'completed') {
        toast.success(german
          ? 'Dein Konto wurde gelöscht und du wurdest abgemeldet.'
          : 'Your account was deleted and you were signed out.');
      }
    } catch {
      // Malformed session state is discarded above and never reaches the UI.
    }
  }, []);

  useEffect(() => {
    const raw = takeAuthSessionHandoff(ACCOUNT_SIGN_OUT_OUTCOME_KEY);
    if (!raw) return;
    try {
      const outcome = JSON.parse(raw) as {
        localCleanupComplete?: unknown;
        notificationCleanupComplete?: unknown;
        authCleanupComplete?: unknown;
        recordedAt?: unknown;
      };
      const recordedAt = Number(outcome.recordedAt || 0);
      if (!Number.isFinite(recordedAt) || Date.now() - recordedAt > 10 * 60_000) return;
      const german = navigator.language.toLowerCase().startsWith('de');
      const localCleanupComplete = outcome.localCleanupComplete !== false;
      const notificationCleanupComplete = outcome.notificationCleanupComplete !== false;
      const authCleanupComplete = outcome.authCleanupComplete !== false;
      if (!localCleanupComplete || !notificationCleanupComplete || !authCleanupComplete) {
        const warnings = german ? [
          ...(authCleanupComplete ? ['Du wurdest abgemeldet.'] : ['Die lokale Abmeldung konnte nicht bestätigt werden.']),
          ...(localCleanupComplete ? [] : ['Ein Teil der Browserdaten konnte nicht entfernt werden; dauerhaftes Caching bleibt deaktiviert. Schließe alle Threadmap-Tabs.']),
          ...(notificationCleanupComplete ? [] : ['Die Benachrichtigungsregistrierung konnte nicht vollständig deaktiviert werden. Deaktiviere Threadmap-Benachrichtigungen in den Browser-Einstellungen.']),
        ] : [
          ...(authCleanupComplete ? ['You were signed out.'] : ['Local sign-out could not be confirmed.']),
          ...(localCleanupComplete ? [] : ['Some browser data could not be removed; persistent caching remains disabled. Close every Threadmap tab.']),
          ...(notificationCleanupComplete ? [] : ['The notification registration could not be fully disabled. Turn off Threadmap notifications in your browser settings.']),
        ];
        toast.warning(warnings.join(' '));
      } else {
        toast.success(german
          ? 'Du wurdest abgemeldet. Die Kontodaten dieses Geräts wurden entfernt.'
          : 'You were signed out. This device’s account data was removed.');
      }
    } catch {
      // Malformed session state is discarded above and never reaches the UI.
    }
  }, []);

  const beginMfaChallenge = useCallback((error: unknown): boolean => {
    if (!auth || (error as { code?: string })?.code !== 'auth/multi-factor-auth-required') {
      return false;
    }
    try {
      const resolver = getMultiFactorResolver(
        auth,
        error as Parameters<typeof getMultiFactorResolver>[1],
      );
      setMfaResolver(resolver);
      return true;
    } catch (resolverError) {
      console.error('[THREADMAP Auth] Could not start the MFA challenge:', resolverError);
      return false;
    }
  }, []);

  const unregisterCurrentDevice = useCallback(async (capturedUserId?: string): Promise<boolean> => {
    const userId = capturedUserId || auth?.currentUser?.uid;
    if (!userId) return true;
    try {
      // The captured UID matters when React still knows the account but
      // Firebase Auth has already transitioned to null. unregisterFCMToken
      // continues through every local transport cleanup even if its remote
      // callable can no longer authenticate.
      await unregisterFCMToken(userId);
      return true;
    } catch (error) {
      // Local push state is cleared even if the remote token could not be
      // removed. Account deletion also removes any orphaned remote token.
      console.warn('[THREADMAP Auth] Push registration cleanup was incomplete:', error);
      return false;
    }
  }, []);

  const continueAsDemo = useCallback(async () => {
    if (auth?.currentUser) {
      await unregisterCurrentDevice();
      setLocalModeEnabled(true);
      try {
        await firebaseSignOut(auth);
      } catch (error) {
        setLocalModeEnabled(false);
        throw error;
      }
    } else {
      setLocalModeEnabled(true);
    }
    clearTransientAuthHandoffs();
    setUser(createDemoUser());
    setIsDemo(true);
    setLoading(false);
  }, [unregisterCurrentDevice]);

  const enterDemoMode = continueAsDemo;

  useEffect(() => {
    if (!auth) {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[THREADMAP Auth] Firebase unavailable; using local mode.');
      }
      const timer = window.setTimeout(() => void continueAsDemo(), 0);
      return () => window.clearTimeout(timer);
    }
    const firebaseAuth = auth;

    // Local-only sessions never need the App Check or reCAPTCHA runtimes.
    // Cloud sessions warm them in parallel so the first deliberate auth or
    // data request is attested without blocking the initial interface.
    if (!isLocalModeEnabled() && auth.currentUser) void ensureAppCheck();

    let cancelled = false;
    let settled = false;

    // Complete OAuth before warming unrelated cloud services. Waiting for App
    // Check here could strand Safari/PWA redirects behind a blocked reCAPTCHA
    // request even though Firebase Auth itself had already returned correctly.
    void getRedirectResult(firebaseAuth)
      .then(() => {
        clearAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY);
      })
      .catch((error) => {
        clearAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY);
        if (!beginMfaChallenge(error)) {
          console.error('[THREADMAP Auth] Redirect sign-in result failed:', error);
        }
      });

    /**
     * `onAuthStateChanged` has an error callback but no timeout. If it never
     * fires at all — an unreachable Firebase, a blocked request — `loading`
     * stayed true forever and the shell rendered an empty <main>: no spinner,
     * no message, no escape hatch. A local-first app must never be locked out
     * of local data by a network it does not need.
     */
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      console.warn('[THREADMAP Auth] No auth state after '
        + `${AUTH_STATE_TIMEOUT_MS}ms; falling through to stored local mode.`);
      if (isLocalModeEnabled()) {
        setUser(createDemoUser());
        setIsDemo(true);
      } else {
        setUser(null);
        setIsDemo(false);
      }
      setLoading(false);
    }, AUTH_STATE_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (firebaseUser) => {
        if (cancelled) return;
        const previousUid = observedFirebaseUidRef.current;
        const nextUid = firebaseUser?.uid || null;
        observedFirebaseUidRef.current = nextUid;
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (previousUid && previousUid !== nextUid) {
          // This includes sign-out/account replacement initiated in another
          // tab. Invalidate every old-account generation synchronously, then
          // remove its browser-global push transport before account B can bind
          // services. Otherwise account A's late token could keep delivering
          // notifications inside account B's browser session.
          quiesceAccountActivity(previousUid);
          setLoading(true);
          const [, notificationsClosed] = await Promise.all([
            unregisterCurrentDevice(previousUid),
            closeOwnerDerivedNotifications(previousUid),
          ]);
          if (!notificationsClosed) {
            console.warn('[THREADMAP Auth] Old-account displayed notifications could not be fully closed.');
          }
          if (cancelled || observedFirebaseUidRef.current !== nextUid) return;
        }
        if (firebaseUser) {
          setLocalModeEnabled(false);
          setUser(firebaseUser);
          setIsDemo(false);
        } else if (isLocalModeEnabled()) {
          setUser(createDemoUser());
          setIsDemo(true);
        } else {
          setUser(null);
          setIsDemo(false);
        }
        setLoading(false);
      },
      (error) => {
        console.error('[THREADMAP Auth] Auth state error:', error);
        if (cancelled) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
        if (isLocalModeEnabled()) {
          setUser(createDemoUser());
          setIsDemo(true);
        } else {
          setUser(null);
          setIsDemo(false);
        }
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
      stopGoogleCalendarSync(); // Stop sync on unmount
    };
  }, [beginMfaChallenge, continueAsDemo, unregisterCurrentDevice]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    try {
      // Mobile browsers and installed PWAs are much more reliable with a
      // first-party redirect. Desktop keeps the faster popup flow. Threadmap's
      // /__/auth reverse proxy keeps both sides on threadmap.app, avoiding the
      // third-party storage boundary that Safari and modern Chrome block.
      if (isMobile() || isStandalone()) {
        if (auth.currentUser) await unregisterCurrentDevice();
        writeAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY, { pending: true });
        await signInWithRedirect(auth, googleProvider);
        return;
      }

      // Do not await here: the popup must open within the original pointer
      // gesture on Safari and installed PWAs. Google account selection gives
      // App Check time to finish before Firebase exchanges the credential.
      void ensureAppCheck();
      // Opening a popup must remain in the original tap task. Even awaiting a
      // resolved cleanup promise first can make Safari and installed PWAs treat
      // the popup as unsolicited and block it.
      if (auth.currentUser) await unregisterCurrentDevice();
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      if (beginMfaChallenge(error)) return;
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in was cancelled.');
      }
      // A blocked or unsupported popup used to be a dead end. Browsers that
      // enforce COOP strictly, and popup blockers generally, both land here;
      // redirect completes the same flow without one.
      if (code === 'auth/popup-blocked'
          || code === 'auth/operation-not-supported-in-this-environment'
          || code === 'auth/web-storage-unsupported') {
        try {
          writeAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY, { pending: true });
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
          clearAuthSessionHandoff(GOOGLE_REDIRECT_PENDING_KEY);
          console.error('[THREADMAP Auth] Redirect sign-in failed:', redirectError);
          throw new Error('Google sign-in popup was blocked and the redirect fallback failed. Enable popups or use local mode.');
        }
      }
      if (error instanceof Error) {
        console.error('[THREADMAP Auth] Sign-in error:', error);
        throw error;
      } else {
        console.error('[THREADMAP Auth] Sign-in error:', error);
      }
      throw new Error('Google sign-in failed.');
    }
  }, [beginMfaChallenge, unregisterCurrentDevice]);

  const sendEmailLinkFn = useCallback(async (email: string) => {
    if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    await ensureAppCheck();
    await sendThreadmapAuthEmail('email-sign-in', email, window.location.origin);
    storePendingEmailLinkAddress(email);
  }, []);

  const finishEmailLinkSignIn = useCallback(async (email: string, href: string) => {
    if (!auth || !isSignInWithEmailLink(auth, href)) {
      throw new Error('This email sign-in link is invalid or has expired.');
    }
    setEmailLinkState('signing-in');
    setEmailLinkError(null);
    try {
      await ensureAppCheck();
      await unregisterCurrentDevice();
      await signInWithEmailLink(auth, email.trim(), href);
      clearPendingEmailLinkAddress();
      window.history.replaceState(null, '', window.location.pathname || '/');
      setPendingEmailLinkUrl(null);
      setEmailLinkState('idle');
    } catch (error) {
      if (beginMfaChallenge(error)) {
        setEmailLinkState('idle');
        setEmailLinkError(null);
        return;
      }
      const message = error instanceof Error ? error.message : 'Email-link sign-in failed.';
      setEmailLinkError(message);
      setEmailLinkState('error');
      throw error;
    }
  }, [beginMfaChallenge, unregisterCurrentDevice]);

  const completeEmailLink = useCallback(async (email: string) => {
    const href = pendingEmailLinkUrl || (typeof window !== 'undefined' ? window.location.href : '');
    if (!email.trim()) {
      const error = new Error('Enter the email address that received this sign-in link.');
      setEmailLinkError(error.message);
      setEmailLinkState('needs-email');
      throw error;
    }
    await finishEmailLinkSignIn(email, href);
  }, [finishEmailLinkSignIn, pendingEmailLinkUrl]);

  const cancelEmailLink = useCallback(() => {
    clearPendingEmailLinkAddress();
    window.history.replaceState(null, '', window.location.pathname || '/');
    setPendingEmailLinkUrl(null);
    setEmailLinkError(null);
    setEmailLinkState('idle');
  }, []);

  // Handle email link completion when the user returns to the app. A link may
  // be opened on a different device, so missing local storage becomes an
  // explicit email-confirmation state instead of a silent dead end.
  useEffect(() => {
    if (!auth) return;
    const currentAuth = auth;
    const timer = window.setTimeout(() => {
      if (emailLinkCheckedRef.current) return;
      emailLinkCheckedRef.current = true;
      const href = window.location.href;
      if (!isSignInWithEmailLink(currentAuth, href)) return;

      setPendingEmailLinkUrl(href);
      const email = readPendingEmailLinkAddress();
      if (!email) {
        setEmailLinkState('needs-email');
        return;
      }
      void finishEmailLinkSignIn(email, href).catch((error) => {
        console.error('[THREADMAP Auth] Email link sign-in error:', error);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [finishEmailLinkSignIn]);

  const resolveMfaChallenge = useCallback(async (code: string) => {
    const resolver = mfaResolver;
    if (!resolver) throw new Error('No multi-factor sign-in is pending.');
    const factor = findTotpFactor(resolver.hints);
    if (!factor) throw new Error('No supported authenticator factor is available.');

    const assertion = TotpMultiFactorGenerator.assertionForSignIn(
      factor.uid,
      normalizeTotpCode(code),
    );
    await resolver.resolveSignIn(assertion);
    setMfaResolver(null);
    setLocalModeEnabled(false);
    clearPendingEmailLinkAddress();
    if (auth && isSignInWithEmailLink(auth, window.location.href)) {
      window.history.replaceState(null, '', window.location.pathname || '/');
    }
    setPendingEmailLinkUrl(null);
    setEmailLinkError(null);
    setEmailLinkState('idle');
  }, [mfaResolver]);

  const cancelMfaChallenge = useCallback(() => {
    setMfaResolver(null);
  }, []);

  const recoverMfaChallenge = useCallback(async (code: string) => {
    await recoverMfaWithCode(code);
    setMfaResolver(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<AccountDeletionOutcome> => {
    if (isDemo) {
      const activityCleanupComplete = quiesceAccountActivity('demo-user');
      const [result, briefingCleanupComplete, deviceCleanupComplete] = await Promise.all([
        deleteAccountData('demo-user', true, { deferLocalCleanup: true }),
        clearBriefingScheduleForSignOut('demo-user'),
        forgetAccountDataOnDevice('demo-user'),
      ]);
      clearGoogleAccessToken();
      const handoffCleanupComplete = clearTransientAuthHandoffs();
      const localModeCleanupComplete = setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return {
        ...result,
        localCleanupComplete: result.localCleanupComplete
          && deviceCleanupComplete
          && activityCleanupComplete
          && handoffCleanupComplete
          && localModeCleanupComplete,
        notificationCleanupComplete: briefingCleanupComplete,
        authCleanupComplete: true,
        integrationCleanupComplete: true,
      };
    }
    if (!auth || !auth.currentUser) throw new Error('No signed-in account to delete.');
    const uid = auth.currentUser.uid;
    let deletionResult: AccountDeletionResult;
    try {
      deletionResult = await deleteAccountData(uid, false, { deferLocalCleanup: true });
    } catch (error) {
      if (isRecentLoginRequiredError(error)) throw error;
      console.error('[THREADMAP Auth] Account deletion error:', error);

      // A callable can lose its response after the server accepted the
      // irreversible request. Treat every non-reauth error as an unknown
      // outcome: never claim failure, and never leave the possibly-deleted
      // account's IndexedDB, handoffs, Auth session, or briefing state behind.
      const integrationCleanupPromise = revokeCalendarIntegrationForAccountDeletion({
        configured: useSettingsStore.getState().settings.calendar.googleCalendarSync,
        hasLiveToken: hasCalendarPermission(),
        revoke: revokeGoogleCalendarAccess,
      });
      const activityCleanupComplete = quiesceAccountActivity(uid);
      const handoffCleanupComplete = clearTransientAuthHandoffs();
      const localModeCleanupComplete = setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      const [pushCleanup, authCleanup, briefingCleanup, deviceCleanup, integrationCleanup] = await Promise.allSettled([
        unregisterCurrentDevice(uid),
        firebaseSignOut(auth),
        clearBriefingScheduleForSignOut(uid),
        forgetAccountDataOnDevice(uid),
        integrationCleanupPromise,
      ]);
      if (!cleanupSettledSuccessfully(pushCleanup)) {
        // Remote token removal is owned by the durable account deletion
        // inventory if the server accepted the request. It is not a claim
        // about browser-disk cleanup.
        console.warn('[THREADMAP Auth] Unknown deletion outcome with remote push cleanup warning.');
      }
      const unknownResult: AccountDeletionOutcome = {
        success: false,
        pending: false,
        status: 'unknown',
        localCleanupComplete: cleanupSettledSuccessfully(deviceCleanup)
          && activityCleanupComplete
          && handoffCleanupComplete
          && localModeCleanupComplete,
        notificationCleanupComplete: cleanupSettledSuccessfully(pushCleanup)
          && cleanupSettledSuccessfully(briefingCleanup),
        authCleanupComplete: cleanupSettledSuccessfully(authCleanup),
        integrationCleanupComplete: cleanupSettledSuccessfully(integrationCleanup),
      };
      if (typeof window !== 'undefined') {
        writeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, {
          status: unknownResult.status,
          localCleanupComplete: unknownResult.localCleanupComplete,
          notificationCleanupComplete: unknownResult.notificationCleanupComplete,
          authCleanupComplete: unknownResult.authCleanupComplete,
          integrationCleanupComplete: unknownResult.integrationCleanupComplete,
          recordedAt: Date.now(),
        });
        if (process.env.NODE_ENV !== 'test') {
          window.setTimeout(() => window.location.replace('/'), 750);
        }
      }
      return unknownResult;
    }

    // The server has accepted deletion (possibly for durable retry). From this
    // point local teardown must finish even if push cleanup or sign-out sees the
    // now-deleted identity.
    const integrationCleanupPromise = revokeCalendarIntegrationForAccountDeletion({
      configured: useSettingsStore.getState().settings.calendar.googleCalendarSync,
      hasLiveToken: hasCalendarPermission(),
      revoke: revokeGoogleCalendarAccess,
    });
    const activityCleanupComplete = quiesceAccountActivity(uid);
    const handoffCleanupComplete = clearTransientAuthHandoffs();
    const localModeCleanupComplete = setLocalModeEnabled(false);
    setUser(null);
    setIsDemo(false);
    const [pushCleanup, authCleanup, briefingCleanup, deviceCleanup, integrationCleanup] = await Promise.allSettled([
      unregisterCurrentDevice(uid),
      firebaseSignOut(auth),
      clearBriefingScheduleForSignOut(uid),
      forgetAccountDataOnDevice(uid),
      integrationCleanupPromise,
    ]);
    if (!cleanupSettledSuccessfully(pushCleanup)) {
      console.warn('[THREADMAP Auth] Account deletion was accepted with a remote push cleanup warning.');
    }
    const authCleanupComplete = cleanupSettledSuccessfully(authCleanup);
    const notificationCleanupComplete = cleanupSettledSuccessfully(pushCleanup)
      && cleanupSettledSuccessfully(briefingCleanup);
    const integrationCleanupComplete = cleanupSettledSuccessfully(integrationCleanup);
    if (!authCleanupComplete || !notificationCleanupComplete || !integrationCleanupComplete) {
      console.warn('[THREADMAP Auth] Account deletion was accepted with auth/notification/integration cleanup warnings.');
    }
    const deletionOutcome: AccountDeletionOutcome = {
      ...deletionResult,
      localCleanupComplete: deletionResult.localCleanupComplete
        && cleanupSettledSuccessfully(deviceCleanup)
        && activityCleanupComplete
        && handoffCleanupComplete
        && localModeCleanupComplete,
      notificationCleanupComplete,
      authCleanupComplete,
      integrationCleanupComplete,
    };
    if (typeof window !== 'undefined') {
      // The accepted server deletion and safety reload must not be turned into
      // a false failure because an optional one-shot toast was blocked.
      writeAuthSessionHandoff(ACCOUNT_DELETION_OUTCOME_KEY, {
        status: deletionOutcome.status,
        localCleanupComplete: deletionOutcome.localCleanupComplete,
        notificationCleanupComplete: deletionOutcome.notificationCleanupComplete,
        authCleanupComplete: deletionOutcome.authCleanupComplete,
        integrationCleanupComplete: deletionOutcome.integrationCleanupComplete,
        recordedAt: Date.now(),
      });
      // clearFirestorePersistence intentionally terminates this tab's Firestore
      // instance. Reload onto a signed-out shell before any later cloud sign-in
      // can try to reuse that terminated instance. The short delay lets the
      // caller surface the explicit pending/completed outcome first.
      if (process.env.NODE_ENV !== 'test') {
        window.setTimeout(() => window.location.replace('/'), 750);
      }
    }
    console.info(deletionOutcome.status === 'pending'
      ? '[THREADMAP Auth] Account deletion queued'
      : '[THREADMAP Auth] Account deleted');
    return deletionOutcome;
  }, [isDemo, unregisterCurrentDevice]);

  const signOut = useCallback(async (options?: SignOutOptions): Promise<SignOutResult> => {
    const uid = isDemo ? 'demo-user' : (auth?.currentUser?.uid || user?.uid || null);
    const preserveLocalWorkspace = isDemo && options?.preserveLocalWorkspace === true;

    if (preserveLocalWorkspace) {
      const briefingCleanupComplete = await clearBriefingScheduleForSignOut(uid);
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
      const handoffCleanupComplete = clearTransientAuthHandoffs();
      const localModeCleanupComplete = setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return {
        success: true,
        localCleanupComplete: handoffCleanupComplete
          && localModeCleanupComplete,
        notificationCleanupComplete: briefingCleanupComplete,
        authCleanupComplete: true,
        reloadScheduled: false,
      };
    }

    const activityCleanupComplete = quiesceAccountActivity(uid);
    const [pushCleanupComplete, briefingCleanupComplete] = await Promise.all([
      isDemo ? Promise.resolve(true) : unregisterCurrentDevice(uid || undefined),
      clearBriefingScheduleForSignOut(uid),
    ]);
    let signOutError: unknown;
    let handoffCleanupComplete = true;
    let localModeCleanupComplete = true;
    try {
      if (!isDemo && auth) await firebaseSignOut(auth);
    } catch (error) {
      signOutError = error;
      console.error('[THREADMAP Auth] Sign-out error:', error);
    } finally {
      localModeCleanupComplete = setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
      handoffCleanupComplete = clearTransientAuthHandoffs();
    }
    const deviceCleanupComplete = await forgetAccountDataOnDevice(uid);
    if (!pushCleanupComplete) {
      console.warn('[THREADMAP Auth] Sign-out completed with a remote push cleanup warning.');
    }
    const localCleanupComplete = deviceCleanupComplete
      && activityCleanupComplete
      && handoffCleanupComplete
      && localModeCleanupComplete;
    const notificationCleanupComplete = pushCleanupComplete && briefingCleanupComplete;
    const reloadScheduled = typeof window !== 'undefined' && process.env.NODE_ENV !== 'test';

    if (signOutError) {
      // Firestore was terminated even though Firebase Auth could not confirm
      // sign-out. Reload to a safe memory-only instance; Auth may restore the
      // session, so never record or announce a successful sign-out.
      if (reloadScheduled) window.setTimeout(() => window.location.reload(), 750);
      throw signOutError;
    }

    if (typeof window !== 'undefined') {
      // Sign-out and device cleanup succeeded; a blocked one-shot toast must
      // not make the action look unsuccessful.
      writeAuthSessionHandoff(ACCOUNT_SIGN_OUT_OUTCOME_KEY, {
        localCleanupComplete,
        notificationCleanupComplete,
        authCleanupComplete: true,
        recordedAt: Date.now(),
      });
      if (reloadScheduled) window.setTimeout(() => window.location.replace('/'), 750);
    }
    return {
      success: true,
      localCleanupComplete,
      notificationCleanupComplete,
      authCleanupComplete: true,
      reloadScheduled,
    };
  }, [isDemo, unregisterCurrentDevice, user]);

  const contextValue = useMemo<AuthContextType>(() => ({
    user,
    loading,
    signInWithGoogle,
    sendEmailLink: sendEmailLinkFn,
    emailLinkState,
    emailLinkError,
    completeEmailLink,
    cancelEmailLink,
    continueAsDemo,
    enterDemoMode,
    deleteAccount,
    signOut,
    isDemo,
  }), [
    cancelEmailLink,
    completeEmailLink,
    continueAsDemo,
    deleteAccount,
    emailLinkError,
    emailLinkState,
    enterDemoMode,
    isDemo,
    loading,
    sendEmailLinkFn,
    signInWithGoogle,
    signOut,
    user,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {mfaResolver && (
        <MfaChallengeDialog
          resolver={mfaResolver}
          onCancel={cancelMfaChallenge}
          onRecover={recoverMfaChallenge}
          onResolve={resolveMfaChallenge}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
