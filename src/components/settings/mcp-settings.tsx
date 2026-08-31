'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { httpsCallable } from 'firebase/functions';
import {
  Check,
  Clipboard,
  KeyRound,
  Loader2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserRound,
  Wrench,
} from 'lucide-react';

import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { cloudFunctions, ensureAppCheck } from '@/lib/firebase';
import { useSettingsStore } from '@/lib/settings-store';

const MCP_ENDPOINT_PATH = '/mcp';

const CAPABILITIES = [
  'Find and read your Threadmap items',
  'Review agendas, tags, relationships, and attachment metadata',
  'Inspect wishlist, study, flight, briefing, and settings data',
  'Search separately connected Gmail, Google Calendar, and Google Drive sources',
];

const CLIENTS = [
  { name: 'ChatGPT', step: 'In Settings -> Apps, add a custom MCP app and use the endpoint below.' },
  { name: 'Claude', step: 'In Settings -> Connectors, choose Add custom connector and use the endpoint below.' },
];

interface McpAuthorization {
  clientId: string;
  clientName: string;
  authorizedAt: number;
  lastAuthorizedAt: number;
  expiresAt?: number;
}

interface McpAuthorizationListResponse {
  authorizations: McpAuthorization[];
}

interface McpAuthorizationRevokeResponse {
  success: true;
  revoked: boolean;
}

function validTimestamp(value: number): boolean {
  return Number.isFinite(value) && value > 0 && !Number.isNaN(new Date(value).getTime());
}

function formatAuthorizationDate(value: number, language: string): string {
  if (!validTimestamp(value)) return language === 'de' ? 'Unbekannt' : 'Unknown';
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function InfoCard({ children, icon: Icon, title }: { children: ReactNode; icon: typeof PlugZap; title: string }) {
  return (
    <section className="rounded-[22px] border border-border/70 bg-card p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)] sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function McpSettings() {
  const { user } = useAuth();
  const userId = user?.uid;
  const language = useSettingsStore((state) => state.settings.language);
  const german = language === 'de';
  const [copied, setCopied] = useState<string | null>(null);
  const [mcpEndpoint, setMcpEndpoint] = useState<string | null>(null);
  const [authorizations, setAuthorizations] = useState<McpAuthorization[]>([]);
  const [authorizationsLoading, setAuthorizationsLoading] = useState(true);
  const [authorizationsError, setAuthorizationsError] = useState<string | null>(null);
  const [authorizationStatus, setAuthorizationStatus] = useState<string | null>(null);
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const copyResetTimerRef = useRef<number | null>(null);

  const loadAuthorizations = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setAuthorizationStatus(null);
    setAuthorizationsError(null);
    setRevokingClientId(null);
    // Never render one account's client names while a new account scope is
    // being resolved. A retry repopulates the list from the server.
    setAuthorizations([]);

    if (!userId || userId === 'demo-user') {
      setAuthorizationsLoading(false);
      return;
    }

    setAuthorizationsLoading(true);
    try {
      await ensureAppCheck();
      if (!cloudFunctions) throw new Error('MCP authorization management is unavailable.');
      const callable = httpsCallable<Record<string, never>, McpAuthorizationListResponse>(
        cloudFunctions,
        'listMcpAuthorizations',
      );
      const result = await callable({});
      if (generation !== requestGenerationRef.current) return;
      if (!Array.isArray(result.data.authorizations)) {
        throw new Error('Invalid MCP authorization response.');
      }
      const safeAuthorizations = result.data.authorizations.map((authorization) => {
        if (!authorization || typeof authorization.clientId !== 'string' || !authorization.clientId.trim()) {
          // A grant without an identifier cannot be revoked safely. Surface a
          // load error instead of presenting a misleading, incomplete list.
          throw new Error('Invalid MCP authorization identifier.');
        }
        return {
          clientId: authorization.clientId.trim(),
          clientName: typeof authorization.clientName === 'string' && authorization.clientName.trim()
            ? authorization.clientName.trim()
            : (german ? 'Unbekannter Client' : 'Unknown client'),
          authorizedAt: authorization.authorizedAt,
          lastAuthorizedAt: authorization.lastAuthorizedAt,
          ...(validTimestamp(authorization.expiresAt ?? Number.NaN)
            ? { expiresAt: authorization.expiresAt }
            : {}),
        } satisfies McpAuthorization;
      }).sort((left, right) => {
        const leftDate = validTimestamp(left.lastAuthorizedAt) ? left.lastAuthorizedAt : 0;
        const rightDate = validTimestamp(right.lastAuthorizedAt) ? right.lastAuthorizedAt : 0;
        return rightDate - leftDate;
      });
      setAuthorizations(safeAuthorizations);
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setAuthorizationsError(german
        ? 'Autorisierte Clients konnten nicht geladen werden.'
        : 'Authorized clients could not be loaded.');
    } finally {
      if (generation === requestGenerationRef.current) setAuthorizationsLoading(false);
    }
  }, [german, userId]);

  useEffect(() => {
    void loadAuthorizations();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadAuthorizations]);

  useEffect(() => {
    // Keep staging/preview clients on their same-origin MCP rewrite. A
    // hard-coded production endpoint would cross the deployment trust plane.
    setMcpEndpoint(new URL(MCP_ENDPOINT_PATH, window.location.origin).href);
  }, []);

  useEffect(() => () => {
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    if (copyResetTimerRef.current) window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopied(null);
      copyResetTimerRef.current = null;
    }, 1800);
  }

  async function revokeAuthorization(authorization: McpAuthorization) {
    if (!userId || userId === 'demo-user' || revokingClientId) return;
    const generation = requestGenerationRef.current;
    setRevokingClientId(authorization.clientId);
    setAuthorizationsError(null);
    setAuthorizationStatus(null);
    try {
      await ensureAppCheck();
      if (!cloudFunctions) throw new Error('MCP authorization management is unavailable.');
      const callable = httpsCallable<{ clientId: string }, McpAuthorizationRevokeResponse>(
        cloudFunctions,
        'revokeMcpAuthorization',
      );
      const result = await callable({ clientId: authorization.clientId });
      if (generation !== requestGenerationRef.current) return;
      if (!result.data.success) throw new Error('MCP authorization revocation was not accepted.');

      // Both `revoked` outcomes are successful and safe to replay. A false
      // value means another tab/request already removed the same grant.
      setAuthorizations((current) => current.filter((entry) => entry.clientId !== authorization.clientId));
      setAuthorizationStatus(german
        ? result.data.revoked
          ? `Zugriff für ${authorization.clientName} wurde widerrufen.`
          : `Der Zugriff für ${authorization.clientName} war bereits widerrufen.`
        : result.data.revoked
          ? `Access revoked for ${authorization.clientName}.`
          : `Access for ${authorization.clientName} was already revoked.`);
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setAuthorizationsError(german
        ? `Der Zugriff für ${authorization.clientName} konnte nicht widerrufen werden.`
        : `Access for ${authorization.clientName} could not be revoked.`);
    } finally {
      if (generation === requestGenerationRef.current) setRevokingClientId(null);
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <InfoCard icon={PlugZap} title="Connection endpoint">
        <p className="mb-3 text-sm leading-6 text-muted-foreground">Use this same URL in every supported client. Do not add a user ID, API key, or query parameter.</p>
        <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border/70 bg-muted/35 p-2 pl-4">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-sm">
            {mcpEndpoint || MCP_ENDPOINT_PATH}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (mcpEndpoint) void copy(mcpEndpoint, 'endpoint');
            }}
            disabled={!mcpEndpoint}
            aria-label={copied === 'endpoint' ? 'MCP endpoint copied' : 'Copy MCP endpoint'}
            className="h-11 w-11 px-0 lg:h-8 lg:w-auto lg:px-3"
          >
            {copied === 'endpoint' ? <Check className="size-4" /> : <Clipboard className="size-4" />}
            <span className="ml-2 hidden lg:inline">{copied === 'endpoint' ? 'Copied' : 'Copy'}</span>
          </Button>
        </div>
      </InfoCard>

      <InfoCard icon={ShieldOff} title={german ? 'Autorisierte Clients' : 'Authorized clients'}>
        <p className="text-sm leading-6 text-muted-foreground">
          {german
            ? 'Hier siehst du die Clients mit serverseitigem Zugriff auf dein Threadmap-Konto. Ein Widerruf sperrt den Client und seine abgeleiteten Tokens sofort.'
            : 'These clients have server-side access to your Threadmap account. Revoking one immediately blocks that client and its derivative tokens.'}
        </p>

        <div className="mt-4" aria-busy={authorizationsLoading}>
          {authorizationStatus && (
            <p role="status" aria-live="polite" className="mb-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-foreground">
              {authorizationStatus}
            </p>
          )}

          {authorizationsError && (
            <div role="alert" className="mb-3 flex flex-col gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
              <span>{authorizationsError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadAuthorizations()}
                disabled={authorizationsLoading || Boolean(revokingClientId)}
                className="min-h-11 shrink-0 lg:min-h-8"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                {german ? 'Erneut versuchen' : 'Retry'}
              </Button>
            </div>
          )}

          {!userId || userId === 'demo-user' ? (
            <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-5 text-sm leading-6 text-muted-foreground">
              {german
                ? 'Melde dich mit einem Cloud-Konto an, um autorisierte MCP-Clients zu verwalten.'
                : 'Sign in with a cloud account to manage authorized MCP clients.'}
            </div>
          ) : authorizationsLoading ? (
            <div role="status" aria-live="polite" className="flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/20 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              {german ? 'Autorisierte Clients werden geladen…' : 'Loading authorized clients…'}
            </div>
          ) : authorizationsError && authorizations.length === 0 ? null : authorizations.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-5">
              <p className="text-sm font-medium">{german ? 'Keine autorisierten Clients' : 'No authorized clients'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {german
                  ? 'Neue Clients erscheinen hier, nachdem du den Zugriff im Autorisierungsfenster genehmigt hast.'
                  : 'New clients appear here after you approve access in the authorization screen.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
              {authorizations.map((authorization) => {
                const revoking = revokingClientId === authorization.clientId;
                const expires = authorization.expiresAt && validTimestamp(authorization.expiresAt)
                  ? formatAuthorizationDate(authorization.expiresAt, language)
                  : null;
                return (
                  <li key={authorization.clientId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{authorization.clientName}</p>
                      <dl className="mt-1 space-y-0.5 text-xs leading-5 text-muted-foreground">
                        <div>
                          <dt className="inline font-medium text-foreground/80">{german ? 'Zuletzt autorisiert:' : 'Last authorized:'}</dt>{' '}
                          <dd className="inline">{formatAuthorizationDate(authorization.lastAuthorizedAt, language)}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-foreground/80">{german ? 'Erstmals autorisiert:' : 'First authorized:'}</dt>{' '}
                          <dd className="inline">{formatAuthorizationDate(authorization.authorizedAt, language)}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-foreground/80">{german ? 'Client-ID:' : 'Client ID:'}</dt>{' '}
                          <dd className="break-all font-mono">{authorization.clientId}</dd>
                        </div>
                        {expires && (
                          <div>
                            <dt className="inline font-medium text-foreground/80">{german ? 'Läuft ab:' : 'Expires:'}</dt>{' '}
                            <dd className="inline">{expires}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void revokeAuthorization(authorization)}
                      disabled={Boolean(revokingClientId)}
                      aria-label={german
                        ? `Zugriff für ${authorization.clientName} widerrufen`
                        : `Revoke access for ${authorization.clientName}`}
                      className="min-h-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive lg:min-h-8"
                    >
                      {revoking ? (
                        <Loader2 aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
                      ) : (
                        <ShieldOff aria-hidden="true" className="size-3.5" />
                      )}
                      {revoking
                        ? (german ? 'Wird widerrufen…' : 'Revoking…')
                        : (german ? 'Zugriff widerrufen' : 'Revoke access')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </InfoCard>

      <InfoCard icon={Wrench} title="Set up a client">
        <ol className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Add endpoint', 'Create a custom MCP connection in your AI client.'],
            ['2', 'Authorize', 'A Threadmap page opens. Sign in as the intended user and approve access.'],
            ['3', 'Confirm account', 'Return to the client and ask it to list a few Threadmap items.'],
          ].map(([number, title, description]) => (
            <li key={number} className="rounded-2xl border border-border/60 bg-muted/25 p-4">
              <span className="mb-4 flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">{number}</span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>

        <div className="divide-y divide-border/60 rounded-2xl border border-border/60">
          {CLIENTS.map((client) => (
            <div key={client.name} className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><PlugZap className="size-3.5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{client.name}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{client.step}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Claude Code is not enabled for the production launch. Its local OAuth callback requires a
          separate security and compatibility review before Threadmap can accept it.
        </p>
      </InfoCard>

      <InfoCard icon={ShieldCheck} title="Google Workspace source">
        <p className="text-sm leading-6 text-muted-foreground">
          {german
            ? 'Verbinde Google separat, damit derselbe Threadmap Secretary E-Mails, Termine und Drive-Dateien als Quellen prüfen kann. Der Zugriff ist schreibgeschützt und die Google-Zugangsdaten werden nie an den MCP-Client weitergegeben.'
            : 'Connect Google separately so the same Threadmap Secretary can verify email, events, and Drive files as sources. Access is read-only, and Google credentials are never shared with the MCP client.'}
        </p>
        <Button asChild variant="outline" className="mt-4 min-h-11">
          <Link href="/integrations/google-workspace">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {german ? 'Google Workspace verwalten' : 'Manage Google Workspace'}
          </Link>
        </Button>
      </InfoCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoCard icon={KeyRound} title="What the connection can do">
          <ul className="space-y-3">
            {CAPABILITIES.map((capability) => (
              <li key={capability} className="flex gap-3 text-sm leading-5"><Check className="mt-0.5 size-4 shrink-0 text-foreground/55" aria-hidden="true" /><span>{capability}</span></li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
            Production connections are read-only at launch. They cannot create, update, complete,
            archive, link, or delete items. Any future write access will require a new scope policy,
            consent, and release review. Google-connected or Google-derived copies inside Threadmap
            remain excluded from Threadmap item tools; after separate Google authorization, the
            Secretary can read the provider source directly through the workspace.read scope.
          </p>
        </InfoCard>

        <InfoCard icon={ShieldCheck} title="Account and privacy">
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p className="flex gap-3"><UserRound className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />Authorization binds the client to the Threadmap user signed in on that browser, not to the person who configured the server.</p>
            <p className="flex gap-3"><LockKeyhole className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />The client never receives your password. It receives a scoped token and cannot cross into another tenant.</p>
            <p className="flex gap-3"><ShieldCheck className="mt-1 size-4 shrink-0 text-foreground/55" aria-hidden="true" />Removing a connection in the AI client does not revoke its server-side grant. Use Authorized clients above to revoke access, then reconnect while signed into the intended account if needed.</p>
          </div>
        </InfoCard>
      </div>

      <div className="rounded-2xl border border-border/60 bg-muted/25 p-5">
        <p className="text-sm font-semibold">Troubleshooting an invalid or expired request</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Return to the AI client and start the connection again. Authorization links are single-use and expire; reopening an old browser tab will not work.</p>
      </div>
    </div>
  );
}
