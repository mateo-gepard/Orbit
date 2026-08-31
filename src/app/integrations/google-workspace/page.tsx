'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileText,
  Loader2,
  LogIn,
  Mail,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/lib/settings-store';

const GOOGLE_ENDPOINT = '/api/mcp/oauth/google';

interface WorkspaceStatus {
  configured: boolean;
  connected: boolean;
  connectionUrl: string;
  email?: string;
  scopes?: string[];
  connectedAt?: number;
  updatedAt?: number;
  needsReauthorization?: boolean;
  reason?: string;
}

type PageState = 'loading' | 'ready' | 'connecting' | 'disconnecting' | 'failed';

function GoogleWorkspaceConnection() {
  const searchParams = useSearchParams();
  const { user, loading, isDemo } = useAuth();
  const german = useSettingsStore((state) => state.settings.language) === 'de';
  const [pageState, setPageState] = useState<PageState>('loading');
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user || isDemo) throw new Error('AUTH_REQUIRED');
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers, cache: 'no-store' });
  }, [isDemo, user]);

  const loadStatus = useCallback(async () => {
    if (!user || isDemo) return;
    setFailure(null);
    try {
      const response = await authorizedFetch(`${GOOGLE_ENDPOINT}/status`);
      const body = await response.json().catch(() => null) as WorkspaceStatus | null;
      if (!response.ok || !body) throw new Error('STATUS_FAILED');
      setStatus(body);
      setPageState('ready');
    } catch {
      setFailure(german
        ? 'Die Google-Workspace-Verbindung konnte nicht geladen werden.'
        : 'The Google Workspace connection could not be loaded.');
      setPageState('failed');
    }
  }, [authorizedFetch, german, isDemo, user]);

  useEffect(() => {
    if (loading) return;
    if (!user || isDemo) {
      setPageState('ready');
      return;
    }
    void loadStatus();
  }, [isDemo, loadStatus, loading, user]);

  const connect = useCallback(async () => {
    setPageState('connecting');
    setFailure(null);
    try {
      const response = await authorizedFetch(`${GOOGLE_ENDPOINT}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await response.json().catch(() => null) as { location?: string } | null;
      if (!response.ok || !body?.location) throw new Error('AUTHORIZE_FAILED');
      window.location.assign(body.location);
    } catch {
      setFailure(german
        ? 'Die Google-Autorisierung konnte nicht gestartet werden.'
        : 'Google authorization could not be started.');
      setPageState('failed');
    }
  }, [authorizedFetch, german]);

  const disconnect = useCallback(async () => {
    setPageState('disconnecting');
    setFailure(null);
    try {
      const response = await authorizedFetch(`${GOOGLE_ENDPOINT}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('DISCONNECT_FAILED');
      await loadStatus();
    } catch {
      setFailure(german
        ? 'Die Verbindung konnte nicht vollständig getrennt werden.'
        : 'The connection could not be fully disconnected.');
      setPageState('failed');
    }
  }, [authorizedFetch, german, loadStatus]);

  if (loading || pageState === 'loading') {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-[17px] font-semibold tracking-tight">Google Workspace</h1>
          <div className="mt-3 flex items-center justify-center gap-3 text-[13px] text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {german ? 'Verbindung wird geprüft …' : 'Checking the connection…'}
          </div>
        </div>
      </Shell>
    );
  }

  if (!user || isDemo) {
    return (
      <Shell>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.06]">
          <LogIn aria-hidden="true" className="h-5 w-5 text-foreground/70" />
        </span>
        <div className="text-center">
          <h1 className="text-[17px] font-semibold tracking-tight">
            {german ? 'Zuerst bei Threadmap anmelden' : 'Sign in to Threadmap first'}
          </h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {german
              ? 'Google Workspace wird mit deinem Threadmap-Konto verknüpft, nicht mit diesem Gerät.'
              : 'Google Workspace is linked to your Threadmap account, not to this device.'}
          </p>
        </div>
        <Button asChild className="min-h-11 w-full">
          <Link href="/">{german ? 'Zur Anmeldung' : 'Go to sign in'}</Link>
        </Button>
      </Shell>
    );
  }

  const busy = pageState === 'connecting' || pageState === 'disconnecting';
  const callbackStatus = searchParams.get('status');
  const callbackFailed = callbackStatus === 'error';
  const configured = status?.configured !== false;

  return (
    <Shell>
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.06]">
        <ShieldCheck aria-hidden="true" className="h-5 w-5 text-foreground/70" />
      </span>

      <div className="text-center">
        <h1 className="text-[17px] font-semibold tracking-tight">Google Workspace</h1>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {german
            ? 'Gibt deinem Threadmap Secretary schreibgeschützten Zugriff auf die Quellen, die er prüfen soll.'
            : 'Gives your Threadmap Secretary read-only access to the sources it should verify.'}
        </p>
      </div>

      {callbackStatus === 'connected' && status?.connected && (
        <Notice tone="success">
          {german ? 'Google Workspace ist verbunden.' : 'Google Workspace is connected.'}
        </Notice>
      )}
      {callbackFailed && (
        <Notice tone="error">
          {german
            ? 'Google konnte nicht verbunden werden. Bitte versuche es erneut.'
            : 'Google could not be connected. Please try again.'}
        </Notice>
      )}
      {failure && <Notice tone="error">{failure}</Notice>}

      <div className="grid w-full grid-cols-3 gap-2">
        <Capability icon={Mail} label="Gmail" />
        <Capability icon={CalendarDays} label={german ? 'Kalender' : 'Calendar'} />
        <Capability icon={FileText} label="Drive" />
      </div>

      <div className="w-full rounded-xl border border-border/60 bg-foreground/[0.02] px-3.5 py-3">
        <div className="flex items-center gap-2">
          {status?.connected
            ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            : <Unplug aria-hidden="true" className="h-4 w-4 text-muted-foreground" />}
          <p className="text-[13px] font-medium">
            {status?.connected
              ? (german ? 'Verbunden' : 'Connected')
              : (german ? 'Nicht verbunden' : 'Not connected')}
          </p>
        </div>
        {status?.email && (
          <p className="mt-1.5 truncate text-[12px] text-muted-foreground">{status.email}</p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {german
            ? 'Nur Lesen. Der Secretary kann keine E-Mail senden, keinen Termin ändern und keine Datei teilen oder löschen.'
            : 'Read only. The Secretary cannot send email, change a meeting, or share or delete a file.'}
        </p>
      </div>

      {!configured && (
        <Notice tone="error">
          {german
            ? 'Der Server braucht noch die Google-OAuth-Konfiguration. Folge der Installationsanleitung.'
            : 'The server still needs its Google OAuth configuration. Follow the installation guide.'}
        </Notice>
      )}

      {status?.connected ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={busy}
          aria-busy={pageState === 'disconnecting'}
          onClick={() => void disconnect()}
        >
          {pageState === 'disconnecting'
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <Unplug aria-hidden="true" className="h-4 w-4" />}
          {german ? 'Google Workspace trennen' : 'Disconnect Google Workspace'}
        </Button>
      ) : (
        <Button
          type="button"
          className="min-h-11 w-full"
          disabled={busy || !configured}
          aria-busy={pageState === 'connecting'}
          onClick={() => void connect()}
        >
          {pageState === 'connecting'
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          {german ? 'Google Workspace verbinden' : 'Connect Google Workspace'}
        </Button>
      )}

      <p className="max-w-sm text-center text-[11px] leading-relaxed text-muted-foreground">
        {german
          ? 'Google-Zugangsdaten bleiben verschlüsselt auf dem Threadmap-Server. Inhalte werden nur abgerufen, wenn du den Secretary nach einer passenden E-Mail, einem Termin oder einer Datei fragst.'
          : 'Google credentials remain encrypted on the Threadmap server. Content is fetched only when you ask the Secretary about a relevant email, event, or file.'}
      </p>
    </Shell>
  );
}

function Capability({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-foreground/[0.02] px-2 py-3">
      <Icon aria-hidden={true} className="h-4 w-4 text-foreground/60" />
      <span className="text-[11px] font-medium text-foreground/70">{label}</span>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: 'success' | 'error' }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={tone === 'success'
        ? 'flex w-full items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3.5 py-3 text-emerald-800 dark:text-emerald-300'
        : 'flex w-full items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.07] px-3.5 py-3 text-destructive'}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-[12px] leading-relaxed">{children}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-[100dvh] overflow-y-auto bg-background px-4 py-10">
      <div className="surface-card mx-auto my-auto flex w-full max-w-md flex-col items-center gap-5 rounded-2xl p-6">
        {children}
      </div>
    </main>
  );
}

export default function GoogleWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <GoogleWorkspaceConnection />
    </Suspense>
  );
}
