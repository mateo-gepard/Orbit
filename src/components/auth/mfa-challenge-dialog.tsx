'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import type { MultiFactorResolver } from 'firebase/auth';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/lib/settings-store';
import {
  findTotpFactor,
  mfaErrorMessage,
  mfaRecoveryErrorMessage,
  normalizeMfaRecoveryCode,
  normalizeTotpCode,
  MFA_RECOVERY_CODE_LENGTH,
  TOTP_CODE_LENGTH,
} from '@/lib/mfa';

interface MfaChallengeDialogProps {
  resolver: MultiFactorResolver | null;
  onCancel: () => void;
  onResolve: (code: string) => Promise<void>;
  onRecover: (code: string) => Promise<void>;
}

export function MfaChallengeDialog({
  resolver,
  onCancel,
  onResolve,
  onRecover,
}: MfaChallengeDialogProps) {
  const language = useSettingsStore((state) => state.settings.language);
  const de = language === 'de';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const factor = resolver ? findTotpFactor(resolver.hints) : undefined;

  const cancel = () => {
    if (submitting) return;
    setCode('');
    setError(null);
    setRecoveryMode(false);
    setRecoveryCode('');
    onCancel();
  };

  const submitRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeMfaRecoveryCode(recoveryCode);
    if (normalized.replace(/-/g, '').length !== MFA_RECOVERY_CODE_LENGTH) {
      setError(de ? 'Gib einen vollstandigen Wiederherstellungscode ein.' : 'Enter a complete recovery code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onRecover(normalized);
      setRecoveryCode('');
      setRecoveryMode(false);
      toast.success(de ? 'Zwei-Faktor-Schutz entfernt. Melde dich erneut an.' : 'Two-factor protection removed. Sign in again.');
    } catch (recoveryError) {
      setError(mfaRecoveryErrorMessage(recoveryError, language));
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeTotpCode(code);
    if (normalized.length !== TOTP_CODE_LENGTH) {
      setError(de ? 'Gib den sechsstelligen Code ein.' : 'Enter the six-digit code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onResolve(normalized);
      setCode('');
    } catch (resolveError) {
      setError(mfaErrorMessage(resolveError, language));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(resolver)}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!submitting}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-foreground/[0.04]">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <DialogTitle>{recoveryMode ? (de ? 'Konto wiederherstellen' : 'Recover your account') : (de ? 'Zwei-Faktor-Code' : 'Two-factor code')}</DialogTitle>
          <DialogDescription>
            {recoveryMode
              ? (de
                ? 'Ein Einmalcode entfernt deine registrierten Authenticators. Danach musst du dich mit deinem primaren Anmeldeverfahren erneut anmelden.'
                : 'A one-time code removes your enrolled authenticators. You must then sign in again with your primary sign-in method.')
              : de
              ? `Offne ${factor?.displayName || 'deine Authenticator-App'} und gib den aktuellen Code ein.`
              : `Open ${factor?.displayName || 'your authenticator app'} and enter the current code.`}
          </DialogDescription>
        </DialogHeader>

        {factor && !recoveryMode ? (
          <form id="mfa-challenge-form" className="space-y-3" onSubmit={submit}>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="mfa-challenge-code">
              {de ? 'Authentifizierungscode' : 'Authentication code'}
              <Input
                id="mfa-challenge-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
                placeholder="000000"
                disabled={submitting}
                autoFocus
                required
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              disabled={submitting}
              onClick={() => { setRecoveryMode(true); setError(null); }}
            >
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              {de ? 'Wiederherstellungscode verwenden' : 'Use a recovery code'}
            </button>
          </form>
        ) : recoveryMode ? (
          <form id="mfa-recovery-form" className="space-y-3" onSubmit={submitRecovery}>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="mfa-recovery-code">
              {de ? 'Wiederherstellungscode' : 'Recovery code'}
              <Input
                id="mfa-recovery-code"
                autoComplete="off"
                spellCheck={false}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(normalizeMfaRecoveryCode(event.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                disabled={submitting}
                autoFocus
                required
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </form>
        ) : (
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {de
              ? 'Dieser zweite Faktor wird von dieser Threadmap-Version nicht unterstutzt.'
              : 'This second-factor type is not supported by this version of Threadmap.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => {
            if (recoveryMode) {
              setRecoveryMode(false);
              setRecoveryCode('');
              setError(null);
            } else {
              cancel();
            }
          }}>
            {recoveryMode ? (de ? 'Zuruck' : 'Back') : (de ? 'Abbrechen' : 'Cancel')}
          </Button>
          {recoveryMode ? (
            <Button
              type="submit"
              form="mfa-recovery-form"
              disabled={submitting || recoveryCode.replace(/-/g, '').length !== MFA_RECOVERY_CODE_LENGTH}
            >
              {submitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {de ? 'Konto wiederherstellen' : 'Recover account'}
            </Button>
          ) : (
            <Button
              type="submit"
              form="mfa-challenge-form"
              disabled={submitting || !factor || code.length !== TOTP_CODE_LENGTH}
            >
              {submitting && <Loader2 aria-hidden="true" className="animate-spin" />}
              {de ? 'Bestatigen' : 'Verify'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
