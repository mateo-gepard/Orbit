'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Check, Loader2, LogIn, Plug, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { useSettingsStore } from '@/lib/settings-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MCP_CONSENT_PATH, storePendingConsentPath } from '@/lib/mcp-consent-return';

/**
 * MCP authorization consent screen.
 *
 * The Cloud Function's `/api/mcp/oauth/authorize` endpoint redirects here with an
 * opaque `?request=` token. This page shows the owner exactly which client is
 * asking and for what, then posts an approve or deny decision and follows the
 * callback URL the server returns. It never sees the authorization code: that is
 * minted server-side and delivered in the redirect.
 */

const CONSENT_ENDPOINT = '/api/mcp/oauth/consent';

interface ConsentView {
  clientId: string;
  clientName: string;
  platform: 'chatgpt' | 'claude' | 'configured' | 'loopback';
  scopes: string[];
  resource: string;
  createdAt: number;
  expiresAt: number;
}

const PLATFORM_LABELS: Record<ConsentView['platform'], string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  configured: 'a configured client',
  loopback: 'a local development client',
};

interface ScopeCopy {
  title: string;
  detail: string;
  tone: 'read' | 'write' | 'delete' | 'session';
}

function scopeCopy(scope: string, german: boolean): ScopeCopy {
  switch (scope) {
    case 'threadmap.read':
      return german
        ? { title: 'Deine Threadmap-Daten lesen', detail: 'Aufgaben, Projekte, Gewohnheiten, Ziele, Notizen, nicht mit Google verbundene Termine, Dateimetadaten wie Name/Typ/Größe, Wunschlisten und Vergleiche, Abiturprofil und Ergebnisse, Fokusprotokolle, Briefing-Verlauf, Tagespläne sowie Einstellungen wie Sprache, Wochenstart und Arbeitszeiten. Dateiinhalte und alle mit Google Kalender verbundenen oder daraus stammenden Termine bleiben ausgeschlossen.', tone: 'read' }
        : { title: 'Read your Threadmap data', detail: 'Tasks, projects, habits, goals, notes, non-Google-connected events, attachment metadata such as name/type/size, wishlist items and rankings, school-exam profile and results, focus logs, briefing history, dispatch plans, and settings such as language, week start, and working hours. File contents and every Google-connected or Google-derived event are excluded.', tone: 'read' };
    case 'threadmap.write':
      return german
        ? { title: 'Einträge erstellen und bearbeiten', detail: 'Neue Einträge anlegen, bestehende ändern, abschließen, archivieren und verknüpfen.', tone: 'write' }
        : { title: 'Create and change items', detail: 'Add new items, edit existing ones, complete, archive and link them.', tone: 'write' };
    case 'workspace.read':
      return german
        ? { title: 'Dein verbundenes Google Workspace lesen', detail: 'Erlaubt diesem Client, über Threadmap schreibgeschützt in Gmail, Google Kalender und Google Drive zu suchen. Google muss separat verbunden werden. Threadmap gibt niemals Google-Zugangsdaten weiter; E-Mails, Termine und Dateien werden nur bei einem passenden Tool-Aufruf abgerufen.', tone: 'read' }
        : { title: 'Read your connected Google Workspace', detail: 'Lets this client use Threadmap to search Gmail, Google Calendar, and Google Drive in read-only mode. Google must be connected separately. Threadmap never shares Google credentials; email, event, and file data is fetched only for a relevant tool call.', tone: 'read' };
    case 'threadmap.delete':
      return german
        ? { title: 'Einträge endgültig löschen', detail: 'Löschen ist unumkehrbar und erfordert eine zweistufige Bestätigung.', tone: 'delete' }
        : { title: 'Permanently delete items', detail: 'Deletion is irreversible and still requires a two-step confirmation.', tone: 'delete' };
    case 'offline_access':
      return german
        ? { title: 'Verbindung aktiv halten', detail: 'Erlaubt erneuten Zugriff, ohne dass du dich jedes Mal neu anmeldest.', tone: 'session' }
        : { title: 'Stay connected', detail: 'Lets the client reconnect without asking you to sign in every time.', tone: 'session' };
    default:
      return { title: scope, detail: german ? 'Unbekannte Berechtigung.' : 'Unrecognized permission.', tone: 'session' };
  }
}

const TONE_STYLES: Record<ScopeCopy['tone'], string> = {
  read: 'text-foreground/60 dark:text-foreground/60 bg-foreground/[0.055] border-foreground/10',
  write: 'text-foreground/60 dark:text-foreground/60 bg-foreground/[0.055] border-foreground/10',
  delete: 'text-red-700 dark:text-red-300 bg-red-500/[0.08] border-red-500/20',
  session: 'text-muted-foreground bg-foreground/[0.04] border-border/60',
};

/** What the URL and session tell us, before any request is made. */
type Gate = 'waiting-for-auth' | 'no-request' | 'needs-signin' | 'can-load';

/** What the consent request itself is doing. Only ever set after an await. */
type Fetching = 'loading' | 'ready' | 'submitting' | 'failed';

function AuthorizeConsent() {
  const searchParams = useSearchParams();
  const requestToken = searchParams.get('request');
  const { user, loading, isDemo } = useAuth();
  const german = useSettingsStore((state) => state.settings.language) === 'de';

  // Derived rather than stored: these are knowable synchronously from the URL and
  // auth state, so putting them in an effect would only add a render pass.
  const gate: Gate = loading
    ? 'waiting-for-auth'
    : !requestToken
      ? 'no-request'
      : (!user || isDemo)
        ? 'needs-signin'
        : 'can-load';

  const [fetching, setFetching] = useState<Fetching>('loading');
  const [view, setView] = useState<ConsentView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!user || isDemo) throw new Error('AUTH_REQUIRED');
    const token = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers, cache: 'no-store' });
  }, [isDemo, user]);

  // Keep the one-time request token across the sign-in hop so the client's flow
  // does not have to be restarted. Storage only — no state is set here.
  useEffect(() => {
    if (gate !== 'needs-signin' || !requestToken) return;
    storePendingConsentPath(`${MCP_CONSENT_PATH}?request=${encodeURIComponent(requestToken)}`);
  }, [gate, requestToken]);

  useEffect(() => {
    if (gate !== 'can-load' || !requestToken) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await authorizedFetch(
          `${CONSENT_ENDPOINT}?request=${encodeURIComponent(requestToken)}`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setFailure(response.status === 401
            ? (german ? 'Deine Sitzung ist abgelaufen. Lade die Seite neu.' : 'Your session expired. Reload the page.')
            : (german
              ? 'Diese Autorisierungsanfrage ist ungültig oder abgelaufen. Starte die Verbindung im Client neu.'
              : 'This authorization request is invalid or expired. Start the connection again from the client.'));
          setFetching('failed');
          return;
        }
        const body = await response.json() as ConsentView;
        if (cancelled) return;
        setView(body);
        setFetching('ready');
      } catch {
        if (cancelled) return;
        setFailure(german
          ? 'Die Autorisierungsanfrage konnte nicht geladen werden.'
          : 'The authorization request could not be loaded.');
        setFetching('failed');
      }
    })();

    return () => { cancelled = true; };
  }, [authorizedFetch, gate, german, requestToken]);

  const decide = useCallback(async (decision: 'approve' | 'deny') => {
    if (!requestToken) return;
    setFetching('submitting');
    setFailure(null);
    try {
      const response = await authorizedFetch(`${CONSENT_ENDPOINT}/${decision}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: requestToken }),
      });
      const body = response.ok ? await response.json() as { location?: string } : null;
      if (!body?.location) {
        setFailure(german
          ? 'Die Entscheidung konnte nicht gespeichert werden. Starte die Verbindung im Client neu.'
          : 'The decision could not be saved. Start the connection again from the client.');
        setFetching('failed');
        return;
      }
      // Hand control back to the client that started the flow.
      window.location.replace(body.location);
    } catch {
      setFailure(german
        ? 'Die Entscheidung konnte nicht gesendet werden.'
        : 'The decision could not be sent.');
      setFetching('failed');
    }
  }, [authorizedFetch, german, requestToken]);

  if (gate === 'waiting-for-auth' || (gate === 'can-load' && fetching === 'loading')) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {german ? 'Anfrage wird geprüft …' : 'Checking the request…'}
        </div>
      </Shell>
    );
  }

  if (gate === 'no-request') {
    return (
      <Problem
        title={german ? 'Verbindung nicht möglich' : 'Cannot connect'}
        detail={german
          ? 'Dieser Link enthält keine Autorisierungsanfrage.'
          : 'This link does not contain an authorization request.'}
      />
    );
  }

  if (gate === 'needs-signin') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.06]">
            <LogIn aria-hidden="true" className="h-5 w-5 text-foreground/70" />
          </span>
          <h1 className="text-[17px] font-semibold tracking-tight">
            {german ? 'Zuerst anmelden' : 'Sign in first'}
          </h1>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {german
              ? 'Melde dich mit deinem Threadmap-Konto an. Wir bringen dich danach zu dieser Anfrage zurück.'
              : 'Sign in with your Threadmap account. We will bring you back to this request afterwards.'}
          </p>
          <Button asChild className="mt-1 min-h-11 w-full">
            <Link href="/">{german ? 'Zur Anmeldung' : 'Go to sign in'}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  if (fetching === 'failed' || !view) {
    return (
      <Problem
        title={german ? 'Verbindung nicht möglich' : 'Cannot connect'}
        detail={failure ?? (german ? 'Unbekannter Fehler.' : 'Unknown error.')}
      />
    );
  }

  const busy = fetching === 'submitting';
  const platform = PLATFORM_LABELS[view.platform] ?? view.platform;

  return (
    <Shell>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.06]">
          <Plug aria-hidden="true" className="h-5 w-5 text-foreground/70" />
        </span>
        <h1 className="text-[17px] font-semibold tracking-tight">
          {german
            ? `${view.clientName} mit Threadmap verbinden?`
            : `Connect ${view.clientName} to Threadmap?`}
        </h1>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
          {german
            ? `${platform} bittet um Zugriff auf dein Threadmap-Konto. Du kannst die Verbindung jederzeit in den Einstellungen widerrufen.`
            : `${platform} is asking for access to your Threadmap account. You can revoke this at any time in Settings.`}
        </p>
        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          {german ? 'Du autorisierst als ' : 'You are authorizing as '}
          <strong className="font-medium text-foreground">
            {user?.email || user?.displayName || (german ? 'dieses Konto' : 'this account')}
          </strong>
          {german
            ? '. Wenn das nicht das beabsichtigte Konto ist, lehne die Anfrage ab und wechsle zuerst das Konto.'
            : '. If this is not the intended account, deny the request and switch accounts first.'}
        </p>
      </div>

      <ul className="flex w-full flex-col gap-2">
        {view.scopes.map((scope) => {
          const copy = scopeCopy(scope, german);
          return (
            <li
              key={scope}
              className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3', TONE_STYLES[copy.tone])}
            >
              <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{copy.title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed opacity-80">{copy.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="w-full rounded-xl border border-border/60 bg-foreground/[0.02] px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {german ? 'Verbindet mit ' : 'Connects to '}
        <span className="font-mono text-foreground/70">{view.resource}</span>
      </p>

      {failure && (
        <p role="alert" className="w-full text-[12px] leading-relaxed text-destructive">{failure}</p>
      )}

      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          disabled={busy}
          onClick={() => void decide('deny')}
        >
          <X aria-hidden="true" className="h-4 w-4" />
          {german ? 'Ablehnen' : 'Deny'}
        </Button>
        <Button
          type="button"
          className="min-h-11 flex-1"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void decide('approve')}
        >
          {busy
            ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            : <Check aria-hidden="true" className="h-4 w-4" />}
          {german ? 'Verbinden' : 'Connect'}
        </Button>
      </div>
    </Shell>
  );
}

function Problem({ title, detail }: { title: string; detail: string }) {
  return (
    <Shell>
      <div role="alert" className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle aria-hidden="true" className="h-5 w-5 text-destructive" />
        </span>
        <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </Shell>
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

export default function AuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeConsent />
    </Suspense>
  );
}
