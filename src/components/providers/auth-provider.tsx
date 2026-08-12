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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type User,
  type IdTokenResult,
  type MultiFactorResolver,
} from 'firebase/auth';
import { MfaChallengeDialog } from '@/components/auth/mfa-challenge-dialog';
import { auth, googleProvider } from '@/lib/firebase';
import { stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { clearGoogleAccessToken } from '@/lib/google-calendar';
import { deleteAccountData } from '@/lib/account-data';
import { unregisterFCMToken } from '@/lib/fcm';
import { findTotpFactor, normalizeTotpCode, recoverMfaWithCode } from '@/lib/mfa';

/**
 * How long to wait for Firebase to report an auth state before falling back to
 * whatever local mode the browser already has. Long enough not to pre-empt a
 * slow but working connection; short enough that a broken one is not a blank
 * page.
 */
const AUTH_STATE_TIMEOUT_MS = 8_000;

const EMAIL_LINK_KEY = 'orbitEmailForSignIn';
const LOCAL_MODE_KEY = 'orbitLocalMode';
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Firebase is not configured. Local mode is available on this device.';

export type EmailLinkState = 'idle' | 'needs-email' | 'signing-in' | 'error';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  emailLinkState: EmailLinkState;
  emailLinkError: string | null;
  completeEmailLink: (email: string) => Promise<void>;
  cancelEmailLink: () => void;
  resetPassword: (email: string) => Promise<void>;
  continueAsDemo: () => Promise<void>;
  /** @deprecated Use continueAsDemo. */
  enterDemoMode: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  sendEmailLink: async () => {},
  emailLinkState: 'idle',
  emailLinkError: null,
  completeEmailLink: async () => {},
  cancelEmailLink: () => {},
  resetPassword: async () => {},
  continueAsDemo: async () => {},
  enterDemoMode: async () => {},
  deleteAccount: async () => {},
  signOut: async () => {},
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
  return window.localStorage.getItem(LOCAL_MODE_KEY) === '1';
}

function setLocalModeEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  if (enabled) {
    window.localStorage.setItem(LOCAL_MODE_KEY, '1');
  } else {
    window.localStorage.removeItem(LOCAL_MODE_KEY);
  }
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

  const unregisterCurrentDevice = useCallback(async () => {
    const currentUser = auth?.currentUser;
    if (!currentUser) return;
    try {
      await unregisterFCMToken(currentUser.uid);
    } catch (error) {
      // Local push state is cleared even if the remote token could not be
      // removed. Account deletion also removes any orphaned remote token.
      console.warn('[THREADMAP Auth] Push registration cleanup was incomplete:', error);
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

    let cancelled = false;
    let settled = false;

    // Complete a redirect started because the popup was blocked.
    void getRedirectResult(auth).catch((error) => {
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
      auth,
      (firebaseUser) => {
        if (cancelled) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
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
  }, [beginMfaChallenge, continueAsDemo]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    try {
      await unregisterCurrentDevice();
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
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError) {
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

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    await unregisterCurrentDevice();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (beginMfaChallenge(error)) return;
      throw error;
    }
  }, [beginMfaChallenge, unregisterCurrentDevice]);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!auth) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    await unregisterCurrentDevice();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
  }, [unregisterCurrentDevice]);

  const sendEmailLinkFn = useCallback(async (email: string) => {
    if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    const actionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem(EMAIL_LINK_KEY, email);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    await sendPasswordResetEmail(auth, email);
  }, []);

  const finishEmailLinkSignIn = useCallback(async (email: string, href: string) => {
    if (!auth || !isSignInWithEmailLink(auth, href)) {
      throw new Error('This email sign-in link is invalid or has expired.');
    }
    setEmailLinkState('signing-in');
    setEmailLinkError(null);
    try {
      await unregisterCurrentDevice();
      await signInWithEmailLink(auth, email.trim(), href);
      window.localStorage.removeItem(EMAIL_LINK_KEY);
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
    window.localStorage.removeItem(EMAIL_LINK_KEY);
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
      const email = window.localStorage.getItem(EMAIL_LINK_KEY);
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
    window.localStorage.removeItem(EMAIL_LINK_KEY);
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

  const deleteAccount = useCallback(async () => {
    if (isDemo) {
      await deleteAccountData('demo-user', true);
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
      setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return;
    }
    if (!auth || !auth.currentUser) throw new Error('No signed-in account to delete.');
    const uid = auth.currentUser.uid;
    try {
      await deleteAccountData(uid, false);
    } catch (error) {
      console.error('[THREADMAP Auth] Account deletion error:', error);
      throw error;
    }

    // The server has accepted deletion. From this point local teardown must
    // finish even if push cleanup or sign-out sees the now-deleted identity.
    stopGoogleCalendarSync();
    clearGoogleAccessToken();
    setLocalModeEnabled(false);
    setUser(null);
    setIsDemo(false);
    const cleanupResults = await Promise.allSettled([
      unregisterCurrentDevice(),
      firebaseSignOut(auth),
    ]);
    const cleanupFailures = cleanupResults.filter((result) => result.status === 'rejected');
    if (cleanupFailures.length > 0) {
      console.warn('[THREADMAP Auth] Account deletion completed with local cleanup warnings:', cleanupFailures);
    }
    console.info('[THREADMAP Auth] Account deleted');
  }, [isDemo, unregisterCurrentDevice]);

  const signOut = useCallback(async () => {
    if (isDemo) {
      setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return;
    }
    if (!auth) return;
    let signOutError: unknown;
    try {
      await unregisterCurrentDevice();
      await firebaseSignOut(auth);
    } catch (error) {
      signOutError = error;
      console.error('[THREADMAP Auth] Sign-out error:', error);
    } finally {
      setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      stopGoogleCalendarSync();
      clearGoogleAccessToken();
    }
    if (signOutError) throw signOutError;
  }, [isDemo, unregisterCurrentDevice]);

  const contextValue = useMemo<AuthContextType>(() => ({
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendEmailLink: sendEmailLinkFn,
    emailLinkState,
    emailLinkError,
    completeEmailLink,
    cancelEmailLink,
    resetPassword,
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
    resetPassword,
    sendEmailLinkFn,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    signUpWithEmail,
    user,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <MfaChallengeDialog
        resolver={mfaResolver}
        onCancel={cancelMfaChallenge}
        onRecover={recoverMfaChallenge}
        onResolve={resolveMfaChallenge}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
