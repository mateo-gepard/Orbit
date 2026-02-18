'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, type User, type IdTokenResult } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { startGoogleCalendarSync, stopGoogleCalendarSync } from '@/lib/google-calendar-sync';
import { hasCalendarPermission } from '@/lib/google-calendar';
import { initAnalytics, stopAnalytics } from '@/lib/analytics';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (!auth) {
      // Firebase not available — auto-enter demo mode
      console.info('[ORBIT Auth] Firebase unavailable — using demo mode');
      setUser(createDemoUser());
      setIsDemo(true);
      setLoading(false);
      initAnalytics('demo-user');
      return;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (cancelled) return;
        setUser(firebaseUser);
        setLoading(false);
        
        // Start analytics tracking
        if (firebaseUser) {
          initAnalytics(firebaseUser.uid);
        }
        
        // Start Google Calendar sync if user has permission
        if (firebaseUser && hasCalendarPermission()) {
          startGoogleCalendarSync(firebaseUser.uid);
        }
      },
      (error) => {
        console.error('[ORBIT Auth] Auth state error:', error);
        if (cancelled) return;
        // Fall back to demo mode on auth errors
        setUser(createDemoUser());
        setIsDemo(true);
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
      setUser(createDemoUser());
      setIsDemo(true);
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: unknown) {
      // User closed popup or network error — fall back to demo
      const code = (error as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        console.info('[ORBIT Auth] Popup closed — offering demo mode');
      } else {
        console.error('[ORBIT Auth] Sign-in error:', error);
      }
      setUser(createDemoUser());
      setIsDemo(true);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!auth) {
      setUser(createDemoUser());
      setIsDemo(true);
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    if (!auth) {
      setUser(createDemoUser());
      setIsDemo(true);
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && cred.user) {
      await updateProfile(cred.user, { displayName });
    }
  }, []);

  const signOut = useCallback(async () => {
    stopAnalytics();
    if (isDemo) {
      setUser(null);
      setIsDemo(false);
      return;
    }
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('[ORBIT Auth] Sign-out error:', error);
      // Force clear anyway
      setUser(null);
    }
  }, [isDemo]);

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, isDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
