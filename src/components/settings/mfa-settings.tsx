'use client';

import { useEffect, useState } from 'react';
import {
  multiFactor,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type MultiFactorInfo,
  type TotpSecret,
} from 'firebase/auth';
import { Check, Copy, Download, KeyRound, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

import { useAuth } from '@/components/providers/auth-provider';
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
import {
  generateMfaRecoveryCodes,
  getMfaRecoveryCodeStatus,
  mfaErrorMessage,
  mfaRecoveryErrorMessage,
  normalizeTotpCode,
  TOTP_CODE_LENGTH,
  type GeneratedMfaRecoveryCodes,
  type MfaRecoveryCodeStatus,
} from '@/lib/mfa';
import { useSettingsStore } from '@/lib/settings-store';

export function MfaSettings() {
  const { user, isDemo, signOut } = useAuth();
  const language = useSettingsStore((state) => state.settings.language);
  const de = language === 'de';
  const [factors, setFactors] = useState<MultiFactorInfo[]>(
    () => user && !isDemo ? [...multiFactor(user).enrolledFactors] : [],
  );
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('Authenticator');
  const [busy, setBusy] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorToRemove, setFactorToRemove] = useState<MultiFactorInfo | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<MfaRecoveryCodeStatus | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [replaceRecoveryCodes, setReplaceRecoveryCodes] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user || isDemo || factors.length === 0) {
      setRecoveryStatus(null);
      return () => { active = false; };
    }
    void getMfaRecoveryCodeStatus().then((status) => {
      if (active) setRecoveryStatus(status);
    }).catch(() => {
      if (active) setRecoveryStatus(null);
    });
    return () => { active = false; };
  }, [factors.length, isDemo, user]);

  if (!user || isDemo) {
    return (
      <div className="mb-4 rounded-2xl border border-border/50 bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">{de ? 'Zwei-Faktor-Authentifizierung' : 'Two-factor authentication'}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60">
              {de ? 'Melde dich mit einem Cloud-Konto an, um einen Authenticator einzurichten.' : 'Sign in with a cloud account to set up an authenticator.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const refreshFactors = () => setFactors([...multiFactor(user).enrolledFactors]);

  const showGeneratedCodes = (generated: GeneratedMfaRecoveryCodes) => {
    setRecoveryCodes(generated.codes);
    setRecoveryStatus({
      generatedAt: generated.generatedAt,
      expiresAt: generated.expiresAt,
      remaining: generated.codes.length,
    });
  };

  const createRecoveryCodes = async () => {
    setRecoveryBusy(true);
    setError(null);
    try {
      showGeneratedCodes(await generateMfaRecoveryCodes());
      setReplaceRecoveryCodes(false);
    } catch (recoveryError) {
      setError(mfaRecoveryErrorMessage(recoveryError, language));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(de ? 'Bestatige zuerst deine E-Mail-Adresse.' : 'Verify your email address before adding a second factor.');
        return;
      }
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
      setCode('');
    } catch (enrollmentError) {
      setError(mfaErrorMessage(enrollmentError, language));
    } finally {
      setBusy(false);
    }
  };

  const finishEnrollment = async () => {
    if (!secret || code.length !== TOTP_CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
      await multiFactor(user).enroll(assertion, label.trim() || 'Authenticator');
      refreshFactors();
      setSecret(null);
      setCode('');
      toast.success(de ? 'Authenticator hinzugefugt.' : 'Authenticator added.');
      try {
        showGeneratedCodes(await generateMfaRecoveryCodes());
      } catch (recoveryError) {
        setError(mfaRecoveryErrorMessage(recoveryError, language));
      }
    } catch (enrollmentError) {
      setError(mfaErrorMessage(enrollmentError, language));
    } finally {
      setBusy(false);
    }
  };

  const sendVerification = async () => {
    setSendingVerification(true);
    setError(null);
    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/settings?section=data`,
      });
      toast.success(de ? 'Bestatigungs-E-Mail gesendet.' : 'Verification email sent.');
    } catch (verificationError) {
      setError(mfaErrorMessage(verificationError, language));
    } finally {
      setSendingVerification(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.secretKey);
      toast.success(de ? 'Schlussel kopiert.' : 'Setup key copied.');
    } catch {
      setError(de ? 'Der Schlussel konnte nicht kopiert werden.' : 'The setup key could not be copied.');
    }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success(de ? 'Wiederherstellungscodes kopiert.' : 'Recovery codes copied.');
    } catch {
      setError(de ? 'Die Codes konnten nicht kopiert werden.' : 'The codes could not be copied.');
    }
  };

  const downloadRecoveryCodes = () => {
    const body = [
      'Threadmap MFA recovery codes',
      'Each code works once. Store these somewhere private.',
      '',
      ...recoveryCodes,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'threadmap-recovery-codes.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const removeFactor = async () => {
    if (!factorToRemove) return;
    const factor = factorToRemove;
    setBusy(true);
    setError(null);
    try {
      await multiFactor(user).unenroll(factor.uid);
      refreshFactors();
      setFactorToRemove(null);
      toast.success(de ? 'Authenticator entfernt.' : 'Authenticator removed.');
    } catch (removeError) {
      const codeValue = (removeError as { code?: string })?.code;
      if (codeValue === 'auth/user-token-expired') {
        setFactors((current) => current.filter((entry) => entry.uid !== factor.uid));
        setFactorToRemove(null);
        toast.success(de ? 'Authenticator entfernt. Melde dich erneut an.' : 'Authenticator removed. Sign in again.');
        await signOut().catch(() => undefined);
      } else {
        setError(mfaErrorMessage(removeError, language));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="mb-4 overflow-hidden rounded-2xl border border-border/50 bg-card">
        <div className="flex items-start justify-between gap-4 border-b border-border/30 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05]">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[13px] font-semibold">{de ? 'Zwei-Faktor-Authentifizierung' : 'Two-factor authentication'}</p>
              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted-foreground/60">
                {de
                  ? 'Schutze dein Konto mit einem zeitbasierten Code aus deiner Authenticator-App.'
                  : 'Protect your account with a time-based code from your authenticator app.'}
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/50 px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {factors.length > 0 && <Check aria-hidden="true" className="h-3 w-3" />}
            {factors.length > 0 ? (de ? 'Aktiv' : 'Active') : (de ? 'Optional' : 'Optional')}
          </span>
        </div>

        <div className="space-y-4 p-4">
          {!user.emailVerified && (
            <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {de ? 'Bestatige deine E-Mail-Adresse, bevor du einen zweiten Faktor hinzufugst.' : 'Verify your email address before adding a second factor.'}
              </p>
              <Button type="button" size="sm" variant="outline" disabled={sendingVerification} onClick={() => void sendVerification()}>
                {sendingVerification && <Loader2 aria-hidden="true" className="animate-spin" />}
                {de ? 'E-Mail senden' : 'Send email'}
              </Button>
            </div>
          )}

          {factors.map((factor) => (
            <div key={factor.uid} className="flex items-center justify-between gap-3 rounded-xl border border-border/40 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium">{factor.displayName || 'Authenticator'}</p>
                  <p className="text-[10px] text-muted-foreground/55">{de ? 'Zeitbasierter Einmalcode' : 'Time-based one-time code'}</p>
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setFactorToRemove(factor)}>
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                {de ? 'Entfernen' : 'Remove'}
              </Button>
            </div>
          ))}

          {factors.length > 0 && (
            <div className="rounded-xl border border-border/40 bg-muted/15 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <KeyRound aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[12px] font-medium">{de ? 'Wiederherstellungscodes' : 'Recovery codes'}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/60">
                      {recoveryStatus?.remaining
                        ? (de ? `${recoveryStatus.remaining} Einmalcodes sind aktiv.` : `${recoveryStatus.remaining} one-time codes are active.`)
                        : (de ? 'Erstelle Codes, bevor du den Zugriff auf deinen Authenticator verlierst.' : 'Create codes before you lose access to your authenticator.')}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={recoveryBusy}
                  onClick={() => recoveryStatus?.remaining ? setReplaceRecoveryCodes(true) : void createRecoveryCodes()}
                >
                  {recoveryBusy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />}
                  {recoveryStatus?.remaining ? (de ? 'Codes ersetzen' : 'Replace codes') : (de ? 'Codes erstellen' : 'Create codes')}
                </Button>
              </div>
            </div>
          )}

          {secret ? (
            <div className="grid gap-5 rounded-xl border border-border/50 bg-background p-4 md:grid-cols-[auto_1fr]">
              <div className="w-fit rounded-xl border border-border/50 bg-white p-3">
                <QRCodeSVG
                  value={secret.generateQrCodeUrl(user.email || user.uid, 'Threadmap')}
                  size={168}
                  level="M"
                  title={de ? 'Threadmap Authenticator QR-Code' : 'Threadmap authenticator QR code'}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[12px] font-semibold">{de ? '1. QR-Code scannen' : '1. Scan the QR code'}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/60">
                    {de ? 'Nutze eine Authenticator-App. Alternativ kannst du den Schlussel manuell eingeben.' : 'Use any authenticator app, or enter the setup key manually.'}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all text-[10px]">{secret.secretKey}</code>
                  <Button type="button" size="icon" variant="ghost" aria-label={de ? 'Schlussel kopieren' : 'Copy setup key'} onClick={() => void copySecret()}>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <label className="grid gap-1.5 text-[11px] font-medium" htmlFor="mfa-device-label">
                  {de ? 'Name dieses Authenticators' : 'Name this authenticator'}
                  <Input id="mfa-device-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={50} disabled={busy} />
                </label>
                <label className="grid gap-1.5 text-[11px] font-medium" htmlFor="mfa-enrollment-code">
                  {de ? '2. Aktuellen Code eingeben' : '2. Enter the current code'}
                  <Input
                    id="mfa-enrollment-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="000000"
                    value={code}
                    onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
                    disabled={busy}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy || code.length !== TOTP_CODE_LENGTH} onClick={() => void finishEnrollment()}>
                    {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
                    {de ? 'Aktivieren' : 'Activate'}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => { setSecret(null); setCode(''); setError(null); }}>
                    {de ? 'Abbrechen' : 'Cancel'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" disabled={busy || !user.emailVerified} onClick={() => void startEnrollment()}>
              {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              {de ? 'Authenticator hinzufugen' : 'Add authenticator'}
            </Button>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground/50">
            {de
              ? 'Bewahre Authenticator und Wiederherstellungscodes getrennt und sicher auf.'
              : 'Keep your authenticator and recovery codes stored separately and securely.'}
          </p>
          {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
        </div>
      </section>

      <Dialog open={Boolean(factorToRemove)} onOpenChange={(open) => { if (!open && !busy) setFactorToRemove(null); }}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{de ? 'Authenticator entfernen?' : 'Remove authenticator?'}</DialogTitle>
            <DialogDescription>
              {de
                ? 'Dieses Konto verliert den Schutz dieses zweiten Faktors. Moglicherweise musst du dich erneut anmelden.'
                : 'This account will lose the protection of this second factor. You may need to sign in again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setFactorToRemove(null)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void removeFactor()}>
              {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
              {de ? 'Entfernen' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recoveryCodes.length > 0} onOpenChange={(open) => { if (!open) setRecoveryCodes([]); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{de ? 'Wiederherstellungscodes speichern' : 'Save your recovery codes'}</DialogTitle>
            <DialogDescription>
              {de
                ? 'Diese Codes werden nur einmal angezeigt. Jeder Code kann genau einmal verwendet werden und ersetzt im Notfall deinen zweiten Faktor.'
                : 'These codes are shown only once. Each code works exactly once and can replace your second factor in an emergency.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/50 bg-muted/20 p-3 sm:grid-cols-2">
            {recoveryCodes.map((recoveryCode) => (
              <code key={recoveryCode} className="rounded-lg bg-background px-3 py-2 text-center text-xs font-semibold tracking-wider">
                {recoveryCode}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyRecoveryCodes()}>
              <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              {de ? 'Alle kopieren' : 'Copy all'}
            </Button>
            <Button type="button" variant="outline" onClick={downloadRecoveryCodes}>
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              {de ? 'Herunterladen' : 'Download'}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setRecoveryCodes([])}>
              {de ? 'Ich habe sie gespeichert' : 'I saved them'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replaceRecoveryCodes} onOpenChange={(open) => { if (!recoveryBusy) setReplaceRecoveryCodes(open); }}>
        <DialogContent className="sm:max-w-md" showCloseButton={!recoveryBusy}>
          <DialogHeader>
            <DialogTitle>{de ? 'Codes ersetzen?' : 'Replace recovery codes?'}</DialogTitle>
            <DialogDescription>
              {de
                ? 'Alle bisherigen Codes werden sofort ungultig. Speichere die neuen Codes, bevor du dieses Fenster schliesst.'
                : 'Every previous code will stop working immediately. Save the new codes before closing their window.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={recoveryBusy} onClick={() => setReplaceRecoveryCodes(false)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="button" disabled={recoveryBusy} onClick={() => void createRecoveryCodes()}>
              {recoveryBusy && <Loader2 aria-hidden="true" className="animate-spin" />}
              {de ? 'Neue Codes erstellen' : 'Create new codes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
