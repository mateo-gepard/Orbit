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
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  sendPasswordResetEmail,
  type User,
  type IdTokenResult,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { clearGoogleAccessToken } from '@/lib/google-calendar';
import { deleteAccountData } from '@/lib/account-data';
import { unregisterFCMToken } from '@/lib/fcm';

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
  const emailLinkCheckedRef = useRef(false);

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

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (cancelled) return;
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
      unsubscribe();
      stopGoogleCalendarSync(); // Stop sync on unmount
    };
  }, [continueAsDemo]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    try {
      await unregisterCurrentDevice();
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in was cancelled.');
      }
      if (code === 'auth/popup-blocked') {
        throw new Error('Google sign-in popup was blocked. Enable popups or use local mode.');
      }
      if (error instanceof Error) {
        console.error('[THREADMAP Auth] Sign-in error:', error);
        throw error;
      } else {
        console.error('[THREADMAP Auth] Sign-in error:', error);
      }
      throw new Error('Google sign-in failed.');
    }
  }, [unregisterCurrentDevice]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    await unregisterCurrentDevice();
    await signInWithEmailAndPassword(auth, email, password);
  }, [unregisterCurrentDevice]);

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
      const message = error instanceof Error ? error.message : 'Email-link sign-in failed.';
      setEmailLinkError(message);
      setEmailLinkState('error');
      throw error;
    }
  }, [unregisterCurrentDevice]);

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
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
