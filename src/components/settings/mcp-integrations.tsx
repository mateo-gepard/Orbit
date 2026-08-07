'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  listThreadmapMcpClients,
  listThreadmapMcpTokenFamilies,
  revokeThreadmapMcpClient,
  revokeThreadmapMcpTokenFamily,
  type ThreadmapMcpClient,
  type ThreadmapMcpTokenFamily,
} from '@/lib/mcp';

/**
 * Connected MCP clients and their live sessions.
 *
 * Revocation is the point of this screen. A connected client holds a refresh
 * token that can mint access to the account indefinitely, so a user must be
 * able to see what is connected and cut it off without contacting anyone.
 * Revoking the client blocks future token exchange; revoking a session kills
 * one device's active grant.
 */

/** Endpoints a user pastes into a client. Paths are relative to this origin. */
const ENDPOINT_PATHS = [
  { path: '/mcp', label: 'settings.mcpEndpoint', description: 'settings.mcpEndpointDesc' },
  {
    path: '/.well-known/oauth-authorization-server',
    label: 'settings.mcpWellKnownAuthorizationServer',
    description: 'settings.mcpWellKnownAuthorizationServerDesc',
  },
  {
    path: '/.well-known/oauth-protected-resource',
    label: 'settings.mcpWellKnownProtectedResource',
    description: 'settings.mcpWellKnownProtectedResourceDesc',
  },
  {
    path: '/integrations/authorize',
    label: 'settings.mcpConsentUrl',
    description: 'settings.mcpConsentUrlDesc',
  },
] as const;

type PendingRevocation =
  | { kind: 'client'; id: string; label: string }
  | { kind: 'session'; id: string; label: string };

function formatTimestamp(value: number | undefined, lang: 'en' | 'de'): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  try {
    return new Date(value).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function McpIntegrations({ disabled }: { disabled: boolean }) {
  const { t, lang } = useTranslation();
  const [clients, setClients] = useState<ThreadmapMcpClient[]>([]);
  const [sessions, setSessions] = useState<ThreadmapMcpTokenFamily[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRevocation | null>(null);

  const refresh = useCallback(async () => {
    if (disabled) return;
    setLoading(true);
    setError(null);
    try {
      // Sessions are fetched unfiltered; pairing them to clients locally avoids
      // a request per client and the composite index a per-client query needs.
      const [nextClients, nextSessions] = await Promise.all([
        listThreadmapMcpClients(),
        listThreadmapMcpTokenFamilies(),
      ]);
      setClients(nextClients);
      setSessions(nextSessions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [disabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const performRevocation = useCallback(async () => {
    if (!pending) return;
    setRevoking(pending.id);
    setError(null);
    setNotice(null);
    try {
      if (pending.kind === 'client') {
        await revokeThreadmapMcpClient(pending.id);
        setNotice(t('settings.mcpClientRevoked'));
      } else {
        await revokeThreadmapMcpTokenFamily(pending.id);
        setNotice(t('settings.mcpSessionRevoked'));
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(
        pending.kind === 'client' ? 'settings.mcpRevokeClientFailed' : 'settings.mcpRevokeSessionFailed'
      ));
    } finally {
      setRevoking(null);
      setPending(null);
    }
  }, [pending, refresh, t]);

  const activeSessionsFor = (clientId: string) =>
    sessions.filter((session) => session.clientId === clientId && session.status === 'active');

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground/90">{t('settings.mcpClientsTitle')}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/50">
            {t('settings.mcpClientsHelp')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={disabled || loading}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/50 px-3 text-[12px] font-medium hover:bg-foreground/[0.04] disabled:opacity-50"
        >
          {loading
            ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            : <RotateCcw aria-hidden="true" className="h-3 w-3" />}
          {t('settings.mcpRefresh')}
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-500">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {disabled && (
          // Never claim "no clients" here — in local mode nothing was queried.
          <p className="rounded-xl border border-border/40 bg-card px-4 py-6 text-center text-[12px] text-muted-foreground/50">
            {t('settings.mcpDemoErrorTitle')}{' '}{t('settings.mcpDemoErrorDesc')}
          </p>
        )}
        {!disabled && !loading && clients.length === 0 && (
          <p className="rounded-xl border border-border/40 bg-card px-4 py-6 text-center text-[12px] text-muted-foreground/50">
            {t('settings.mcpNoClients')}
          </p>
        )}

        {clients.map((client) => {
          const clientSessions = activeSessionsFor(client.clientId);
          const isRevoked = client.status === 'revoked';
          return (
            <div key={client.clientId} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-foreground/90">
                      {client.clientName || client.clientId}
                    </p>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      isRevoked ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-500'
                    )}>
                      {t(isRevoked ? 'settings.mcpStatusRevoked' : 'settings.mcpStatusActive')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground/40">{client.clientId}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/50">
                    {t('settings.mcpCreatedAt')} {formatTimestamp(client.createdAt, lang)}
                    {' · '}
                    {t('settings.mcpSessionsCount', { count: clientSessions.length })}
                  </p>
                </div>
                {!isRevoked && (
                  <button
                    type="button"
                    onClick={() => setPending({
                      kind: 'client',
                      id: client.clientId,
                      label: client.clientName || client.clientId,
                    })}
                    disabled={revoking !== null}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-[12px] font-medium text-destructive/80 hover:bg-destructive/5 disabled:opacity-50"
                  >
                    {revoking === client.clientId
                      ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                      : <Trash2 aria-hidden="true" className="h-3 w-3" />}
                    {revoking === client.clientId ? t('settings.mcpRevoking') : t('settings.mcpRevokeClient')}
                  </button>
                )}
              </div>

              {clientSessions.length > 0 && (
                <div className="mt-3 border-t border-border/30 pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                    {t('settings.mcpSessionsTitle')}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {clientSessions.map((session) => (
                      <li key={session.tokenFamilyId} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-foreground/80">
                            {t('settings.mcpSession')} {session.tokenFamilyId.slice(0, 12)}…
                          </p>
                          <p className="text-[11px] text-muted-foreground/50">
                            {t('settings.mcpSequence')} {session.latestSequence}
                            {' · '}
                            {formatTimestamp(session.lastRotatedAt ?? session.createdAt, lang)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPending({
                            kind: 'session',
                            id: session.tokenFamilyId,
                            label: session.tokenFamilyId.slice(0, 12),
                          })}
                          disabled={revoking !== null}
                          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-destructive/80 hover:bg-destructive/5 disabled:opacity-50"
                        >
                          {t('settings.mcpRevokeSession')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 space-y-3">
        {ENDPOINT_PATHS.map((endpoint) => (
          <div key={endpoint.path} className="rounded-xl border border-border/30 bg-card/50 px-4 py-3">
            <p className="text-[12px] font-medium text-foreground/80">{t(endpoint.label)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/50">{t(endpoint.description)}</p>
            <code className="mt-1.5 block overflow-x-auto whitespace-nowrap text-[11px] text-muted-foreground/70">
              {typeof window === 'undefined' ? endpoint.path : `${window.location.origin}${endpoint.path}`}
            </code>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={t(pending?.kind === 'client' ? 'settings.mcpRevokeClient' : 'settings.mcpRevokeSession')}
        description={t(pending?.kind === 'client'
          ? 'settings.mcpRevokeClientConfirm'
          : 'settings.mcpRevokeSessionConfirm')}
        confirmLabel={t('common.delete')}
        onConfirm={performRevocation}
      />
    </div>
  );
}
