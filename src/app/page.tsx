'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  CalendarDays,
  FolderKanban,
  Repeat,
  Flame,
  Plus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import { useOrbitStore } from '@/lib/store';
import { useAuth } from '@/components/providers/auth-provider';
import { useSettingsStore } from '@/lib/settings-store';
import { ItemRow } from '@/components/items/item-row';
import { cn, getLocale, getWeekStartsOn } from '@/lib/utils';
import {
  format,
  isToday,
  startOfWeek,
  addDays,
  subDays,
  isSameDay,
} from 'date-fns';
import {
  calculateStreak,
  isHabitScheduledForDate,
  isHabitCompletedForDate,
} from '@/lib/habits';
import { updateItem } from '@/lib/firestore';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { getTaskBuckets } from '@/lib/task-buckets';
import { eventOccursOnDate, getProjectTaskProgress } from '@/lib/dashboard';
import { toast } from 'sonner';

/* ── Login ── */
function LoginScreen({
  onSignIn,
  onDemo,
  onEmailSignIn,
  onEmailSignUp,
  onSendEmailLink,
  onResetPassword,
  emailLinkState,
  emailLinkError,
  onCompleteEmailLink,
  onCancelEmailLink,
}: {
  onSignIn: () => Promise<void>;
  onDemo: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string, displayName?: string) => Promise<void>;
  onSendEmailLink: (email: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  emailLinkState: 'idle' | 'needs-email' | 'signing-in' | 'error';
  emailLinkError: string | null;
  onCompleteEmailLink: (email: string) => Promise<void>;
  onCancelEmailLink: () => void;
}) {
  const [mode, setMode] = useState<'choice' | 'login' | 'signup' | 'email-link' | 'email-link-sent' | 'reset-password' | 'reset-sent'>('choice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { t } = useTranslation();

  const firebaseErrorMessage = (code: string) => {
    const map: Record<string, string> = {
      'auth/user-not-found': t('error.userNotFound'),
      'auth/wrong-password': t('error.wrongPassword'),
      'auth/invalid-email': t('error.invalidEmail'),
      'auth/email-already-in-use': t('error.emailInUse'),
      'auth/weak-password': t('error.weakPassword'),
      'auth/invalid-credential': t('error.invalidCredential'),
      'auth/too-many-requests': t('error.tooManyRequests'),
    };
    return map[code] || t('error.generic');
  };

  const authErrorMessage = (err: unknown) => {
    const code = (err as { code?: string })?.code || '';
    if (code) return firebaseErrorMessage(code);
    return err instanceof Error ? err.message : t('error.generic');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await onEmailSignUp(email, password, name || undefined);
      } else {
        await onEmailSignIn(email, password);
      }
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSendEmailLink(email);
      setMode('email-link-sent');
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteEmailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onCompleteEmailLink(email);
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelEmailLink = () => {
    setEmail('');
    setError('');
    setSubmitting(false);
    onCancelEmailLink();
  };

  const isCompletingEmailLink = emailLinkState !== 'idle';
  const completingEmailLink = submitting || emailLinkState === 'signing-in';

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onSignIn();
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setError('');
    setSubmitting(true);
    try {
      await onDemo();
    } catch (err: unknown) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <nav
        aria-label="Legal and security"
        className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex justify-center gap-4 px-4 text-[11px] text-muted-foreground/60"
      >
        <Link className="transition-colors hover:text-foreground" href="/privacy">Privacy</Link>
        <Link className="transition-colors hover:text-foreground" href="/terms">Terms</Link>
        <Link className="transition-colors hover:text-foreground" href="/security">Security</Link>
      </nav>
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div
            aria-hidden="true"
            className="mx-auto h-14 w-14 rounded-2xl bg-cover bg-center shadow-[var(--shadow-soft)]"
            style={{ backgroundImage: "url('/favicon.svg')" }}
          />
          <h1 className="text-2xl font-bold tracking-tight mt-4">
            {isCompletingEmailLink ? t('login.confirmEmailLink')
              : mode === 'signup' ? t('login.createAccount')
              : mode === 'email-link' ? t('login.signInEmailLink')
              : mode === 'email-link-sent' ? t('login.checkInbox')
              : mode === 'reset-password' ? t('login.resetPassword')
              : mode === 'reset-sent' ? t('login.resetLinkSent')
              : t('login.welcome')}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isCompletingEmailLink
              ? t('login.confirmEmailLinkDesc')
              : mode === 'signup'
              ? t('login.createAccountDesc')
              : mode === 'email-link'
              ? t('login.emailLinkDesc')
              : mode === 'email-link-sent'
              ? t('login.checkInboxFor').replace('{email}', email)
              : mode === 'reset-password'
              ? t('login.resetPasswordDesc')
              : mode === 'reset-sent'
              ? t('login.resetLinkSentDesc')
              : t('login.tagline')}
          </p>
        </div>

        {isCompletingEmailLink ? (
          <form onSubmit={handleCompleteEmailLink} className="space-y-3">
            <label htmlFor="confirm-email-link-address" className="text-[12px] font-medium text-foreground/80">
              {t('login.emailUsedForLink')}
            </label>
            <input
              id="confirm-email-link-address"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              disabled={completingEmailLink}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40 disabled:cursor-wait disabled:opacity-60"
              autoComplete="email"
              autoFocus
            />

            {(error || emailLinkError) && (
              <p role="alert" className="px-1 text-[12px] font-medium text-destructive">
                {error || emailLinkError}
              </p>
            )}

            <button
              type="submit"
              disabled={completingEmailLink}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {completingEmailLink ? (
                <>
                  <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                  {t('login.completingSignIn')}
                </>
              ) : (
                t('login.completeSignIn')
              )}
            </button>
            <button
              type="button"
              onClick={handleCancelEmailLink}
              disabled={completingEmailLink}
              className="w-full py-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
            >
              {t('login.cancelEmailLink')}
            </button>
          </form>
        ) : mode === 'choice' ? (
          <div className="space-y-2.5">
            <button
              onClick={handleGoogleSignIn}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-foreground px-4 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 active:scale-[0.98] transition-transform"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('login.continueGoogle')}
            </button>
            {error && (
              <p role="alert" className="px-1 text-[12px] font-medium text-destructive">{error}</p>
            )}

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase">
                <span className="bg-background px-3 text-muted-foreground/50">{t('common.or')}</span>
              </div>
            </div>

            <button
              onClick={() => setMode('login')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-foreground/[0.03] active:scale-[0.98] transition-transform"
            >
              {t('login.signInEmail')}
            </button>
            <button
              onClick={() => setMode('email-link')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-foreground/[0.03] active:scale-[0.98] transition-transform"
            >
              {t('login.signInEmailLink')}
            </button>
            <button
              onClick={handleDemo}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/50 px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.03] active:scale-[0.98] transition-transform"
            >
              {t('login.tryWithout')}
            </button>
          </div>
        ) : mode === 'email-link-sent' ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.06]">
              <svg className="h-5 w-5 text-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {t('login.emailLinkSentDesc')}
            </p>
            <button
              onClick={() => { setMode('choice'); setEmail(''); setError(''); }}
              className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {t('login.backToLogin')}
            </button>
          </div>
        ) : mode === 'email-link' ? (
          <form onSubmit={handleSendLink} className="space-y-3">
            <label htmlFor="email-link-address" className="sr-only">{t('login.emailPlaceholder')}</label>
            <input
              id="email-link-address"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              autoComplete="email"
              autoFocus
            />

            {error && (
              <p role="alert" className="text-[12px] text-destructive font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {submitting ? (
                <>
                  <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                  <span>{t('login.sendSignInLink')}</span>
                </>
              ) : (
                t('login.sendSignInLink')
              )}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => { setMode('choice'); setError(''); }}
                className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                {t('login.back')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                {t('login.usePasswordInstead')}
              </button>
            </div>
          </form>
        ) : mode === 'reset-password' ? (
          <form onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setSubmitting(true);
            try {
              await onResetPassword(email);
              setMode('reset-sent');
            } catch (err: unknown) {
              setError(authErrorMessage(err));
            } finally {
              setSubmitting(false);
            }
          }} className="space-y-3">
            <label htmlFor="reset-email-address" className="sr-only">{t('login.emailPlaceholder')}</label>
            <input
              id="reset-email-address"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              autoComplete="email"
              autoFocus
            />
            {error && (
              <p role="alert" className="text-[12px] text-destructive font-medium px-1">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {submitting ? (
                <>
                  <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                  <span>{t('login.sendResetLink')}</span>
                </>
              ) : (
                t('login.sendResetLink')
              )}
            </button>
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                {t('login.back')}
              </button>
            </div>
          </form>
        ) : mode === 'reset-sent' ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.06]">
              <svg className="h-5 w-5 text-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {t('login.resetLinkSentDesc')}
            </p>
            <button
              onClick={() => { setMode('login'); setEmail(''); setError(''); }}
              className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {t('login.backToLogin')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <>
                <label htmlFor="account-name" className="sr-only">{t('login.namePlaceholder')}</label>
                <input
                  id="account-name"
                  type="text"
                  placeholder={t('login.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
                  autoComplete="name"
                />
              </>
            )}
            <label htmlFor="account-email" className="sr-only">{t('login.emailPlaceholder')}</label>
            <input
              id="account-email"
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              autoComplete="email"
              autoFocus
            />
            <label htmlFor="account-password" className="sr-only">{t('login.passwordPlaceholder')}</label>
            <input
              id="account-password"
              type="password"
              placeholder={t('login.passwordPlaceholder')}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />

            {error && (
              <p role="alert" className="text-[12px] text-destructive font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3.5 text-[15px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {submitting ? (
                <>
                  <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                  <span>{mode === 'signup' ? t('login.createAccount') : t('login.signIn')}</span>
                </>
              ) : mode === 'signup' ? (
                t('login.createAccount')
              ) : (
                t('login.signIn')
              )}
            </button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => { setMode('choice'); setError(''); }}
                className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                {t('login.back')}
              </button>
              <div className="flex items-center gap-3">
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('reset-password'); setError(''); }}
                    className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    {t('login.forgotPassword')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                  className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  {mode === 'login' ? t('login.dontHaveAccount') : t('login.alreadyHaveAccount')}
                </button>
              </div>
            </div>
          </form>
        )}

        <p className="text-center text-[11px] text-muted-foreground/60">
          {mode === 'choice'
            ? t('login.localModeNote')
            : mode === 'email-link-sent'
            ? t('login.emailLinkSentNote')
            : t('login.dataEncrypted')}
        </p>
      </div>
    </div>
  );
}

/* ── Onboarding (empty dashboard) ── */
function OnboardingState({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.05]">
        <Sparkles className="h-6 w-6 text-foreground/40" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{t('onboarding.title')}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
        {t('onboarding.description')}
      </p>
      <button
        onClick={onOpen}
        className="mt-5 flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('onboarding.cta')}
      </button>
    </div>
  );
}

/* ── Section wrapper ── */
function Section({
  title,
  icon: Icon,
  count,
  href,
  children,
  action,
}: {
  title: string;
  icon: typeof CheckSquare;
  count?: number;
  href?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section data-slot="section" className="group/section">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.04] text-muted-foreground transition-colors group-hover/section:bg-foreground/[0.07] group-hover/section:text-foreground">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
          </span>
          <span className="truncate text-[13px] font-semibold">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {href && (
            <Link
              href={href}
              className="mobile-touch-target rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              {t('common.viewAll')}
            </Link>
          )}
          {action}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm shadow-black/[0.02] backdrop-blur-sm transition-colors group-hover/section:border-border lg:rounded-2xl">
        {children}
      </div>
    </section>
  );
}

function OverviewTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof CheckSquare;
  tone: 'slate' | 'amber' | 'emerald' | 'sky';
}) {
  const toneClasses = {
    slate: 'border-border/60 bg-card/80 text-foreground',
    amber: 'border-amber-500/20 bg-amber-500/[0.05] text-amber-700 dark:text-amber-300',
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300',
    sky: 'border-sky-500/20 bg-sky-500/[0.05] text-sky-700 dark:text-sky-300',
  };

  return (
    <div className={cn('rounded-2xl border p-3.5 shadow-sm shadow-black/[0.02]', toneClasses[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none tracking-normal tabular-nums text-foreground">
            {value}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/70 text-current">
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>
    </div>
  );
}

/* ── Hockey / Medical Quotes ── */
const HOCKEY_QUOTES = [
  { text: 'Hockey ist nicht nur ein Sport — es ist eine Lebenseinstellung.', emoji: '🏒' },
  { text: 'Wer am härtesten trainiert, feiert am lautesten.', emoji: '🏑' },
  { text: 'Jeder Treffer beginnt mit dem ersten Schritt aufs Feld.', emoji: '🥅' },
  { text: 'Im Hockey wie im Leben: Wer stehen bleibt, verliert den Ball.', emoji: '🏒' },
  { text: 'Ein Team ist stärker als die Summe seiner Spieler.', emoji: '🤝' },
  { text: 'Die beste Verteidigung ist ein guter Angriff.', emoji: '🛡️' },
  { text: 'Nicht der Größte gewinnt, sondern der Entschlossenste.', emoji: '💪' },
  { text: 'Jede Niederlage ist ein Trainingsplan in Verkleidung.', emoji: '📋' },
  { text: 'Disziplin auf dem Feld, Disziplin im Leben.', emoji: '🏟️' },
  { text: 'Ein guter Arzt heilt, ein großartiger Arzt verhindert.', emoji: '🩺' },
  { text: 'Manchmal ist die beste Medizin ein Hockeyschläger und frische Luft.', emoji: '🌿' },
  { text: 'Diagnose: Zu viel Talent für nur ein Spielfeld.', emoji: '⚕️' },
  { text: 'Die Short Corner ist die Ecke, an der sich Spiele entscheiden.', emoji: '🏒' },
  { text: 'Spielintelligenz schlägt Schnelligkeit — meistens.', emoji: '🧠' },
  { text: 'Jeder Sprint zum Tor ist ein Sprint zum Erfolg.', emoji: '🏃' },
  { text: 'Ärzte und Hockeyspieler haben eins gemeinsam: Unter Druck glänzen sie.', emoji: '💎' },
  { text: 'Die Strafecke gehört den Mutigen.', emoji: '🎯' },
  { text: 'Nach dem Spiel ist vor dem Spiel.', emoji: '🔄' },
  { text: 'Kein Patient, kein Gegner — kein Problem ist unlösbar.', emoji: '🩻' },
  { text: 'Im dritten Drittel zeigt sich der wahre Charakter.', emoji: '⏱️' },
];

function stableIndex(seed: string, length: number) {
  if (length === 0) return -1;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

function HockeyQuote() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIdx(Math.floor(Math.random() * HOCKEY_QUOTES.length));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const quote = HOCKEY_QUOTES[idx];

  return (
    <button
      type="button"
      className="group relative w-full overflow-hidden rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/[0.03] to-emerald-500/[0.03] px-4 py-3 text-left transition-all hover:border-cyan-500/30"
      onClick={() => setIdx((idx + 1) % HOCKEY_QUOTES.length)}
      title="Klick für neues Zitat"
    >
      {/* subtle field-line decoration */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500" />
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-cyan-500" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-cyan-500" />
      </div>
      <div className="flex items-start gap-3 relative z-10">
        <span className="text-lg mt-0.5 transition-transform group-hover:scale-125 group-hover:rotate-12">
          {quote.emoji}
        </span>
        <p className="text-[13px] italic text-foreground/70 leading-relaxed">
          &ldquo;{quote.text}&rdquo;
        </p>
      </div>
      <p className="text-[9px] text-muted-foreground/40 mt-1.5 text-right tracking-wider uppercase">
        Tipp: Klicken für mehr
      </p>
    </button>
  );
}

/* ── Dashboard ── */
export default function DashboardPage() {
  const {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendEmailLink,
    resetPassword,
    continueAsDemo,
    emailLinkState,
    emailLinkError,
    completeEmailLink,
    cancelEmailLink,
  } = useAuth();
  const { items, setSelectedItemId, setCommandBarOpen } = useOrbitStore();
  const defaultView = useSettingsStore((s) => s.settings.defaultView);
  const { weekStart: weekStartSetting, language } = useSettingsStore((s) => s.settings);
  const hockeyMode = useSettingsStore((s) => s.settings.hockeyMode && s.settings.language === 'de');
  const locale = getLocale(language);
  const weekStartsOn = getWeekStartsOn(weekStartSetting);
  const router = useRouter();
  const { t } = useTranslation();

  // Hydration-safe: avoid rendering date-dependent text during SSR
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const currentDayRef = useRef(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep an open dashboard correct across midnight without pulling a chosen
  // historical date back to today.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = new Date();
      const nextDay = format(next, 'yyyy-MM-dd');
      const previousDay = currentDayRef.current;
      if (nextDay !== previousDay) {
        setSelectedDate((selected) => (
          format(selected, 'yyyy-MM-dd') === previousDay ? next : selected
        ));
        currentDayRef.current = nextDay;
      }
      setCurrentTime(next);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Redirect to the configured start page if not dashboard
  useEffect(() => {
    if (!mounted || loading || !user) return;
    const viewRoutes: Record<string, string> = {
      tasks: '/tasks',
    };
    const route = viewRoutes[defaultView];
    const startViewKey = `threadmap-start-view-applied:${user.uid}`;
    const alreadyApplied = window.sessionStorage.getItem(startViewKey);
    if (!alreadyApplied) {
      window.sessionStorage.setItem(startViewKey, 'true');
      if (route) router.replace(route);
    }
  }, [mounted, loading, user, defaultView, router]);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const todayStr = format(currentTime, 'yyyy-MM-dd');
  const isViewingToday = selectedDateStr === todayStr;
  const isViewingPast = selectedDateStr < todayStr;
  const isViewingFuture = selectedDateStr > todayStr;

  const {
    todayTasks,
    myDayTasks,
    notDoneFromBefore,
    overdueItems,
    todayEvents,
    habits,
    activeProjects,
    principles,
    totalActive,
  } = useMemo(() => {
    const { todayTasks, myDayTasks, notDoneFromBefore, overdueItems } = getTaskBuckets({
      items,
      selectedDateStr,
      todayStr,
      isViewingPast,
      isViewingToday,
    });

    const todayEvents = items.filter((item) => eventOccursOnDate(item, selectedDateStr));

    const habits = items.filter((i) => i.type === 'habit' && i.status === 'active');
    const activeProjects = items.filter((i) => i.type === 'project' && i.status === 'active');
    const principles = items.filter(
      (i) => i.type === 'note' && (i.noteSubtype === 'principle' || i.tags?.includes('principle')) && i.status !== 'archived'
    );
    const totalActive = items.filter((i) => i.status !== 'archived').length;
    return { todayTasks, myDayTasks, notDoneFromBefore, overdueItems, todayEvents, habits, activeProjects, principles, totalActive };
  }, [items, selectedDateStr, isViewingPast, isViewingToday, todayStr]);

  if (loading || !mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onSignIn={signInWithGoogle}
        onDemo={continueAsDemo}
        onEmailSignIn={signInWithEmail}
        onEmailSignUp={signUpWithEmail}
        onSendEmailLink={sendEmailLink}
        onResetPassword={resetPassword}
        emailLinkState={emailLinkState}
        emailLinkError={emailLinkError}
        onCompleteEmailLink={completeEmailLink}
        onCancelEmailLink={cancelEmailLink}
      />
    );
  }

  // Show onboarding if empty
  if (totalActive === 0) {
    return (
        <div className="mobile-page-gutter mx-auto max-w-3xl py-4 lg:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {format(selectedDate, 'EEEE, d MMMM', { locale })}
          </h1>
        </div>
        <OnboardingState onOpen={() => setCommandBarOpen(true)} />
      </div>
    );
  }

  const getProjectProgress = (projectId: string) => {
    return getProjectTaskProgress(items, projectId);
  };

  const todayHabits = habits.filter((h) => isHabitScheduledForDate(h, selectedDate));
  const completedHabitsToday = todayHabits.filter((h) => isHabitCompletedForDate(h, selectedDate)).length;
  const principleIndex = stableIndex(selectedDateStr, principles.length);
  const principle = principleIndex >= 0 ? principles[principleIndex] : undefined;

  const toggleHabit = async (habit: typeof items[0]) => {
    const completions = { ...(habit.completions || {}) };
    completions[selectedDateStr] = !completions[selectedDateStr];
    try {
      await updateItem(habit.id, { completions });
    } catch {
      toast.error(language === 'de' ? 'Gewohnheit konnte nicht aktualisiert werden' : 'Could not update this habit');
    }
  };

  const weekStartDate = startOfWeek(selectedDate, { weekStartsOn });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  // Everything actually waiting today, carried-over work included. Excluding
  // it made the headline tile read 0 while fifteen tasks sat listed
  // underneath — the first number a user reads was the one under-reporting
  // the day. The second tile breaks out how many of these are carried over.
  const focusTaskCount = overdueItems.length + todayTasks.length + myDayTasks.length + notDoneFromBefore.length;
  const habitProgressLabel = todayHabits.length > 0 ? `${completedHabitsToday}/${todayHabits.length}` : '0';
  const selectedDayStart = new Date(selectedDate);
  selectedDayStart.setHours(0, 0, 0, 0);
  const selectedDayEnd = addDays(selectedDayStart, 1);
  const completedTasksOnSelectedDate = items.filter((candidate) =>
    candidate.type === 'task'
    && candidate.status === 'done'
    && typeof candidate.completedAt === 'number'
    && candidate.completedAt >= selectedDayStart.getTime()
    && candidate.completedAt < selectedDayEnd.getTime()
  ).length;
  const hockeyPeriodLabel = isViewingToday
    ? currentTime.getHours() < 12
      ? '1. Drittel'
      : currentTime.getHours() < 17
        ? '2. Drittel'
        : '3. Drittel'
    : format(selectedDate, 'd. MMM', { locale });
  const renderDateBar = (className: string) => (
    <div className={cn('items-center gap-1 overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-1 shadow-sm shadow-black/[0.02]', className)}>
      {weekDays.map((day) => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayItems = items.filter(
          (i) =>
            i.status !== 'archived' &&
            ((i.type === 'task' && i.dueDate === dayStr) ||
             (i.type === 'event' && eventOccursOnDate(i, dayStr)))
        );
        const isCurrentDay = isSameDay(day, selectedDate);
        const isDayToday = isToday(day);
        return (
          <button
            type="button"
            key={dayStr}
            onClick={() => setSelectedDate(day)}
            aria-label={format(day, 'EEEE, d MMMM yyyy', { locale })}
            className={cn(
              'mobile-touch-target flex min-w-0 flex-1 flex-col items-center rounded-xl py-2.5 transition-colors active:scale-95 lg:py-2',
              isCurrentDay
                ? 'bg-foreground text-background'
                : isDayToday
                ? 'bg-foreground/[0.08] hover:bg-foreground/[0.12]'
                : 'hover:bg-foreground/[0.03]'
            )}
          >
            <span className={cn(
              'text-[10px] font-medium uppercase',
              !isCurrentDay && !isDayToday && 'text-muted-foreground/50',
              isDayToday && !isCurrentDay && 'text-foreground/70'
            )}>
              {format(day, 'EEE', { locale })}
            </span>
            <span className={cn(
              'mt-0.5 text-sm font-semibold tabular-nums',
              !isCurrentDay && 'text-foreground'
            )}>
              {format(day, 'd')}
            </span>
            {dayItems.length > 0 && (
              <div className="mt-1 flex gap-0.5">
                {dayItems.slice(0, 3).map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'h-1 w-1 rounded-full',
                      isCurrentDay ? 'bg-background/50' : 'bg-foreground/20'
                    )}
                  />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="mobile-page-gutter mx-auto max-w-6xl space-y-5 py-4 lg:space-y-8 lg:p-8" data-slot="page-content">
      {/* ── Header with Date Navigation ── */}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 lg:flex-row lg:items-center lg:justify-between lg:pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">
            {format(selectedDate, 'EEEE, d MMMM yyyy', { locale })}
            {!isViewingToday && (
              <span className="ml-2 text-[11px] text-muted-foreground/60">
                ({isViewingPast ? t('date.past') : t('date.future')})
              </span>
            )}
          </p>
          <h1 className="text-xl font-semibold tracking-tight mt-0.5">
            {isViewingToday ? (
              <>
                {currentTime.getHours() < 12
                  ? t('greeting.morning')
                  : currentTime.getHours() < 18
                  ? t('greeting.afternoon')
                  : t('greeting.evening')}
                {user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
              </>
            ) : (
              format(selectedDate, 'MMMM d, yyyy', { locale })
            )}
          </h1>
        </div>

        {/* Date Navigation Controls */}
        <div className="hidden w-full items-center justify-between rounded-2xl border border-border/60 bg-background/70 p-1 lg:flex lg:w-auto">
          <button
            type="button"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-foreground/[0.05] active:scale-95"
            title={t('date.previousDay')}
            aria-label={t('date.previousDay')}
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          
          {!isViewingToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(currentTime)}
              className="rounded-xl bg-foreground/[0.08] px-3 py-2 text-[11px] font-medium transition-all hover:bg-foreground/[0.12] active:scale-95"
            >
              {t('date.today')}
            </button>
          )}
          
          <button
            type="button"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:bg-foreground/[0.05] active:scale-95"
            title={t('date.nextDay')}
            aria-label={t('date.nextDay')}
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            aria-label={t('date.previousDay')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-muted-foreground active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(currentTime)}
            aria-current={isViewingToday ? 'date' : undefined}
            className="min-h-11 flex-1 rounded-xl border border-border/60 bg-background/70 px-3 text-[12px] font-medium active:scale-[0.98]"
          >
            {isViewingToday ? t('date.today') : `${t('date.today')} · ${format(currentTime, 'd MMM', { locale })}`}
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            aria-label={t('date.nextDay')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-muted-foreground active:scale-95"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {renderDateBar('flex lg:hidden')}
      </div>

      {/* ── Principles / Hockey Quotes ── */}
      {hockeyMode ? (
        <HockeyQuote />
      ) : principle ? (
        <div className="rounded-xl bg-foreground/[0.02] border border-border/40 px-4 py-3">
          <p className="text-[13px] italic text-foreground/70 leading-relaxed">
            &ldquo;{principle.title}&rdquo;
          </p>
        </div>
      ) : null}

      {/* ── Stats strip / Hockey Scoreboard ── */}
      {hockeyMode ? (
        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/[0.04] to-emerald-500/[0.04] p-3">
          <div className="flex items-center justify-between">
            {/* Left team: completed */}
            <div className="flex items-center gap-2">
              <span className="text-lg">🏒</span>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Erledigt</p>
                <p className="text-2xl font-black tabular-nums text-foreground leading-none mt-0.5">
                  {completedTasksOnSelectedDate}
                </p>
              </div>
            </div>
            
            {/* Center: VS divider + period */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-black text-muted-foreground/30">:</span>
              <span className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
                {hockeyPeriodLabel}
              </span>
            </div>
            
            {/* Right team: remaining */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Offen</p>
                <p className="text-2xl font-black tabular-nums text-foreground/50 leading-none mt-0.5">
                  {focusTaskCount}
                </p>
              </div>
              <span className="text-lg">🩺</span>
            </div>
          </div>
          
          {/* Bottom: habits as period stats */}
          {todayHabits.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-cyan-500/10">
              <span className="text-[10px] text-muted-foreground/50">Training</span>
              <div className="flex gap-0.5">
                {todayHabits.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      'h-2 w-2 rounded-full transition-colors',
                      isHabitCompletedForDate(h, selectedDate) ? 'bg-cyan-500' : 'bg-foreground/10'
                    )}
                    title={h.title}
                  />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground/40 tabular-nums">{completedHabitsToday}/{todayHabits.length}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OverviewTile label={t('dashboard.tasks')} value={focusTaskCount} icon={CheckSquare} tone="slate" />
          <OverviewTile label={t('today.notDoneFromBefore')} value={notDoneFromBefore.length} icon={Clock3} tone="amber" />
          <OverviewTile label={t('nav.habits')} value={habitProgressLabel} icon={Repeat} tone="emerald" />
          <OverviewTile label={t('nav.projects')} value={activeProjects.length} icon={FolderKanban} tone="sky" />
        </div>
      )}

      {/* ── Week strip — larger touch targets on mobile ── */}
      {renderDateBar('hidden lg:flex')}

      {/* ── Content — masonry-style two column on desktop ── */}
      <div className="lg:hidden flex flex-col gap-4">
        {/* Mobile: single column, natural order */}
        {/* Tasks */}
        <Section
          title={isViewingToday ? t('nav.today') : format(selectedDate, 'MMM d', { locale })}
          icon={CheckSquare}
          count={focusTaskCount}
          href="/tasks"
        >
          <div className="py-1">
            {overdueItems.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
            {todayTasks.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
            {myDayTasks.map((item) => (
              <ItemRow key={item.id} item={item} showProject compact />
            ))}
            {overdueItems.length === 0 && todayTasks.length === 0 && myDayTasks.length === 0 && (
              <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/50">
                {isViewingPast 
                  ? t('dashboard.noTasksPast')
                  : t('dashboard.nothingScheduled')
                }
              </p>
            )}
          </div>
        </Section>

        {/* Habits */}
        <Section title={t('nav.habits')} icon={Repeat} count={todayHabits.length} href="/habits">
          <div className="py-2 px-3 space-y-1">
            {todayHabits.map((habit) => {
              const completed = isHabitCompletedForDate(habit, selectedDate);
              const streak = calculateStreak(habit);
              return (
                <div key={habit.id} className="flex items-center gap-2.5 py-1">
                  <button
                    type="button"
                    onClick={() => toggleHabit(habit)}
                    disabled={isViewingFuture}
                    aria-label={`${completed ? 'Mark incomplete' : 'Mark complete'}: ${habit.title}`}
                    aria-pressed={completed}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg border transition-all shrink-0 lg:h-5 lg:w-5 lg:rounded-md',
                      completed
                        ? 'border-foreground/20 bg-foreground/10'
                        : 'border-foreground/15 hover:border-foreground/30',
                      isViewingFuture && 'cursor-not-allowed opacity-30'
                    )}
                  >
                    {completed && <CheckSquare className="h-3 w-3 text-foreground/50" />}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex-1 text-left text-[13px] cursor-pointer transition-colors hover:text-foreground',
                      completed ? 'line-through text-muted-foreground/50' : 'text-foreground'
                    )}
                    onClick={() => setSelectedItemId(habit.id)}
                  >
                    {habit.title}
                  </button>
                  {streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums">
                      {hockeyMode ? (
                        <span className="text-xs">🏒</span>
                      ) : (
                        <Flame className="h-3 w-3" />
                      )}
                      {streak}
                    </span>
                  )}
                </div>
              );
            })}
            {todayHabits.length === 0 && (
              <p className="py-4 text-center text-[12px] text-muted-foreground/50">{t('dashboard.noHabitsScheduled')}</p>
            )}
          </div>
        </Section>

        {/* Not Done from Before */}
        {isViewingToday && (
          <Section title={t('today.notDoneFromBefore')} icon={Clock3} count={notDoneFromBefore.length}>
            <div className="py-1">
              {notDoneFromBefore.map((item) => (
                <ItemRow key={item.id} item={item} showProject compact />
              ))}
              {notDoneFromBefore.length === 0 && (
                <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/50">
                  {t('dashboard.allCaughtUp')}
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Events */}
        {todayEvents.length > 0 && (
          <Section title={t('dashboard.events')} icon={CalendarDays} count={todayEvents.length} href="/calendar">
            <div className="py-1">
              {todayEvents.map((item) => (
                <ItemRow key={item.id} item={item} compact />
              ))}
            </div>
          </Section>
        )}

        {/* Projects */}
        {activeProjects.length > 0 && (
          <Section
            title={t('nav.projects')}
            icon={FolderKanban}
            count={activeProjects.length}
            href="/projects"
          >
            <div className="p-3 space-y-2.5">
              {activeProjects.slice(0, 4).map((project) => {
                const progress = getProjectProgress(project.id);
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedItemId(project.id)}
                    className="flex w-full items-center gap-3 text-left group transition-colors"
                  >
                    <span className="text-sm">{project.emoji || '📁'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium truncate block group-hover:text-foreground transition-colors">
                        {project.title}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground/20 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums">{progress}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      {/* Desktop: two independent columns so cards stack tightly (masonry) */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        {/* ── Left column: Tasks ── */}
        <div className="flex flex-col gap-6">
          <Section
            title={isViewingToday ? t('nav.today') : format(selectedDate, 'MMM d', { locale })}
            icon={CheckSquare}
            count={focusTaskCount}
            href="/tasks"
          >
            <div className="py-1">
              {overdueItems.map((item) => (
                <ItemRow key={item.id} item={item} showProject compact />
              ))}
              {todayTasks.map((item) => (
                <ItemRow key={item.id} item={item} showProject compact />
              ))}
              {myDayTasks.map((item) => (
                <ItemRow key={item.id} item={item} showProject compact />
              ))}
              {overdueItems.length === 0 && todayTasks.length === 0 && myDayTasks.length === 0 && (
                <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/50">
                  {isViewingPast 
                    ? t('dashboard.noTasksPast')
                    : t('dashboard.nothingScheduled')
                  }
                </p>
              )}
            </div>
          </Section>

          {/* Events below tasks on left */}
          {todayEvents.length > 0 && (
            <Section title={t('dashboard.events')} icon={CalendarDays} count={todayEvents.length} href="/calendar">
              <div className="py-1">
                {todayEvents.map((item) => (
                  <ItemRow key={item.id} item={item} compact />
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* ── Right column: Habits, Not Done from Before, Projects ── */}
        <div className="flex flex-col gap-6">
          <Section title={t('nav.habits')} icon={Repeat} count={todayHabits.length} href="/habits">
            <div className="py-2 px-3 space-y-1">
              {todayHabits.map((habit) => {
                const completed = isHabitCompletedForDate(habit, selectedDate);
                const streak = calculateStreak(habit);
                return (
                  <div key={habit.id} className="flex items-center gap-2.5 py-1">
                    <button
                      type="button"
                      onClick={() => toggleHabit(habit)}
                      disabled={isViewingFuture}
                      aria-label={`${completed ? 'Mark incomplete' : 'Mark complete'}: ${habit.title}`}
                      aria-pressed={completed}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg border transition-all shrink-0 lg:h-5 lg:w-5 lg:rounded-md',
                        completed
                          ? 'border-foreground/20 bg-foreground/10'
                          : 'border-foreground/15 hover:border-foreground/30',
                        isViewingFuture && 'cursor-not-allowed opacity-30'
                      )}
                    >
                      {completed && <CheckSquare className="h-3 w-3 text-foreground/50" />}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'flex-1 text-left text-[13px] cursor-pointer transition-colors hover:text-foreground',
                        completed ? 'line-through text-muted-foreground/50' : 'text-foreground'
                      )}
                      onClick={() => setSelectedItemId(habit.id)}
                    >
                      {habit.title}
                    </button>
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/50 tabular-nums">
                        {hockeyMode ? (
                          <span className="text-xs">🏒</span>
                        ) : (
                          <Flame className="h-3 w-3" />
                        )}
                        {streak}
                      </span>
                    )}
                  </div>
                );
              })}
              {todayHabits.length === 0 && (
                <p className="py-4 text-center text-[12px] text-muted-foreground/50">{t('dashboard.noHabitsScheduled')}</p>
              )}
            </div>
          </Section>

          {/* Not Done from Before */}
          {isViewingToday && (
            <Section title={t('today.notDoneFromBefore')} icon={Clock3} count={notDoneFromBefore.length}>
              <div className="py-1">
                {notDoneFromBefore.map((item) => (
                  <ItemRow key={item.id} item={item} showProject compact />
                ))}
                {notDoneFromBefore.length === 0 && (
                  <p className="px-4 py-5 text-center text-[12px] text-muted-foreground/50">
                    {t('dashboard.allCaughtUp')}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* Projects */}
          {activeProjects.length > 0 && (
            <Section
              title={t('nav.projects')}
              icon={FolderKanban}
              count={activeProjects.length}
              href="/projects"
            >
              <div className="p-3 space-y-2.5">
                {activeProjects.slice(0, 4).map((project) => {
                  const progress = getProjectProgress(project.id);
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedItemId(project.id)}
                      className="flex w-full items-center gap-3 text-left group transition-colors"
                    >
                      <span className="text-sm">{project.emoji || '📁'}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[13px] font-medium truncate block group-hover:text-foreground transition-colors">
                          {project.title}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-foreground/20 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{progress}%</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
