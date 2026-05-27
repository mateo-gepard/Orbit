'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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
  deleteUser as firebaseDeleteUser,
  type User,
  type IdTokenResult,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { startGoogleCalendarSync, stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { hasCalendarPermission } from '@/lib/google-calendar';
import { initAnalytics, stopAnalytics } from '@/lib/analytics';
import { deleteAllUserData } from '@/lib/firestore';
import { useSettingsStore } from '@/lib/settings-store';

const EMAIL_LINK_KEY = 'orbitEmailForSignIn';
const LOCAL_MODE_KEY = 'orbitLocalMode';
const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Firebase is not configured. Use local mode or add Firebase environment variables.';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enterDemoMode: () => void;
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
  resetPassword: async () => {},
  enterDemoMode: () => {},
  deleteAccount: async () => {},
  signOut: async () => {},
  isDemo: false,
});

function createDemoUser(): User {
  return {
    uid: 'demo-user',
    displayName: 'Demo User',
    email: 'demo@orbit.local',
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

  useEffect(() => {
    if (!auth) {
      console.info('[ORBIT Auth] Firebase unavailable; cloud sign-in is disabled.');
      if (isLocalModeEnabled()) {
        setUser(createDemoUser());
        setIsDemo(true);
        initAnalytics('demo-user');
      } else {
        setUser(null);
        setIsDemo(false);
      }
      setLoading(false);
      return;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (cancelled) return;
        if (!firebaseUser && isLocalModeEnabled()) {
          setUser(createDemoUser());
          setIsDemo(true);
          initAnalytics('demo-user');
        } else {
          if (firebaseUser) setLocalModeEnabled(false);
          setUser(firebaseUser);
          setIsDemo(false);
        }
        setLoading(false);
        
        // Start analytics tracking
        if (firebaseUser) {
          initAnalytics(firebaseUser.uid);
        }
        
        // Start Google Calendar sync if user has permission AND setting is enabled
        const calSyncEnabled = useSettingsStore.getState().settings.calendar.googleCalendarSync;
        if (firebaseUser && calSyncEnabled && hasCalendarPermission()) {
          startGoogleCalendarSync(firebaseUser.uid);
        }
      },
      (error) => {
        console.error('[ORBIT Auth] Auth state error:', error);
        if (cancelled) return;
        setUser(null);
        setIsDemo(false);
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
      stopAnalytics();          // Flush pending events
      stopGoogleCalendarSync(); // Stop sync on unmount
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    try {
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
        console.error('[ORBIT Auth] Sign-in error:', error);
        throw error;
      } else {
        console.error('[ORBIT Auth] Sign-in error:', error);
      }
      throw new Error('Google sign-in failed.');
    }
  }, []);

  const enterDemoMode = useCallback(() => {
    setLocalModeEnabled(true);
    setUser(createDemoUser());
    setIsDemo(true);
    setLoading(false);
    initAnalytics('demo-user');
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!auth) {
      throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
  }, []);

  const sendEmailLinkFn = useCallback(async (email: string) => {
    if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    const actionCodeSettings = {
      url: window.location.origin,
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem(EMAIL_LINK_KEY, email);
    console.info('[ORBIT Auth] Email link sent to', email);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error(FIREBASE_NOT_CONFIGURED_MESSAGE);
    await sendPasswordResetEmail(auth, email);
    console.info('[ORBIT Auth] Password reset email sent to', email);
  }, []);

  // Handle email link completion when user returns to the app
  useEffect(() => {
    if (!auth) return;
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) return;

    const savedEmail = window.localStorage.getItem(EMAIL_LINK_KEY);
    const email = savedEmail || window.prompt('Please enter your email to confirm sign-in:');
    if (!email) return;

    signInWithEmailLink(auth, email, href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_LINK_KEY);
        // Clean the URL by replacing history without the sign-in params
        window.history.replaceState(null, '', window.location.origin);
        console.info('[ORBIT Auth] Email link sign-in completed');
      })
      .catch((error) => {
        console.error('[ORBIT Auth] Email link sign-in error:', error);
      });
  }, []);

  const deleteAccount = useCallback(async () => {
    if (isDemo || !auth || !auth.currentUser) {
      setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return;
    }
    const uid = auth.currentUser.uid;
    try {
      // Delete all Firestore data for this user
      await deleteAllUserData(uid);
      // Delete the Firebase Auth user
      await firebaseDeleteUser(auth.currentUser);
      console.info('[ORBIT Auth] Account deleted');
    } catch (error) {
      console.error('[ORBIT Auth] Account deletion error:', error);
      throw error;
    } finally {
      setUser(null);
    }
  }, [isDemo]);

  const signOut = useCallback(async () => {
    stopAnalytics();
    if (isDemo) {
      setLocalModeEnabled(false);
      setUser(null);
      setIsDemo(false);
      return;
    }
    if (!auth) return;
    try {
      setLocalModeEnabled(false);
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('[ORBIT Auth] Sign-out error:', error);
      // Force clear anyway
      setUser(null);
    }
  }, [isDemo]);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, sendEmailLink: sendEmailLinkFn, resetPassword, enterDemoMode, deleteAccount, signOut, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
