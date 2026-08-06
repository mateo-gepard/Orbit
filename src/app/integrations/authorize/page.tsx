'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import {
  approveThreadmapMcpAuthorizationRequest,
  denyThreadmapMcpAuthorizationRequest,
  getThreadmapMcpAuthorizationRequest,
  type ThreadmapMcpAuthorizationRequest,
} from '@/lib/mcp';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

function PlatformBadge({ platform }: { platform: string }) {
  const label = platform === 'chatgpt'
    ? 'ChatGPT'
    : platform === 'claude'
      ? 'Claude'
      : platform === 'configured'
        ? 'Configured redirect'
        : platform;

  return (
    <span className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/[0.04] px-2 py-1 text-[11px] font-medium text-foreground/70">
      {label}
    </span>
  );
}

function formatDate(dateValue: number, lang: 'en' | 'de') {
  try {
    return new Date(dateValue).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(dateValue);
  }
}

export default function IntegrationsAuthorizePage() {
  const { t, lang } = useTranslation();
  const { user, loading: authLoading, signInWithGoogle, isDemo } = useAuth();
  const searchParams = useSearchParams();
  const requestToken = useMemo(() => searchParams.get('request')?.trim() || '', [searchParams]);

  const [authorizationRequest, setAuthorizationRequest] = useState<ThreadmapMcpAuthorizationRequest | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const requestReady = requestToken.length > 0 && !authLoading && Boolean(user) && !isDemo;

  useEffect(() => {
    let cancelled = false;
    if (!requestReady) return;
    if (!user) {
      setAuthorizationRequest(null);
      setSelectedScopes([]);
      setError(null);
      return;
    }
    setAuthorizationRequest(null);
    setSelectedScopes([]);
    setRequestLoading(true);
    setError(null);

    void (async () => {
      try {
        const loadedRequest = await getThreadmapMcpAuthorizationRequest(requestToken);
        if (cancelled) return;
        setAuthorizationRequest(loadedRequest);
        setSelectedScopes(loadedRequest.scopes);
      } catch (errorValue) {
        if (cancelled) return;
        setAuthorizationRequest(null);
        setError(errorValue instanceof Error
          ? errorValue.message
          : 'Could not load the authorization request.');
      } finally {
        if (!cancelled) {
          setRequestLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestReady, requestToken, user]);

  const selectedScopesLabel = useMemo(() => (
    selectedScopes.length === authorizationRequest?.scopes.length
      ? t('settings.mcpScopeAll')
      : `${selectedScopes.length} ${t('settings.mcpScopeSelected')}`
  ), [selectedScopes.length, authorizationRequest?.scopes.length, t]);

  const canApprove = selectedScopes.length > 0 && !requestLoading;

  const toggleScope = (scope: string, checked: boolean) => {
    setSelectedScopes((prev) => {
      if (checked) {
        return prev.includes(scope) ? prev : [...prev, scope];
      }
      return prev.filter((value) => value !== scope);
    });
  };

  const approve = async () => {
    if (!requestToken || !canApprove || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await approveThreadmapMcpAuthorizationRequest(requestToken, selectedScopes);
      window.location.href = result.location;
    } catch (approvalError) {
      setError(approvalError instanceof Error
        ? approvalError.message
        : 'The authorization could not be approved.');
      setIsProcessing(false);
    }
  };

  const deny = async () => {
    if (!requestToken || isProcessing) return;
    setIsProcessing(true);
    setError(null);
    try {
      const result = await denyThreadmapMcpAuthorizationRequest(requestToken);
      window.location.href = result.location;
    } catch (denyError) {
      setError(denyError instanceof Error
        ? denyError.message
        : 'The authorization could not be denied.');
      setIsProcessing(false);
    }
  };

  const authPrompt = !requestToken ? (
    <p className="text-sm text-destructive">{t('settings.mcpRequestMissing')}</p>
  ) : isDemo ? (
    <div className="space-y-4">
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <p className="font-medium">{t('settings.mcpDemoErrorTitle')}</p>
        <p className="mt-1">{t('settings.mcpDemoErrorDesc')}</p>
      </div>
      <div className="flex justify-center">
        <Link href="/" className="text-xs text-muted-foreground underline">
          {t('settings.returnDashboard')}
        </Link>
      </div>
    </div>
  ) : requestLoading || authLoading ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      {t('common.loading')}
    </div>
  ) : !user ? (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('settings.mcpSignInRequired')}</p>
      <Button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="w-full sm:w-auto"
      >
        {t('settings.mcpSignIn')}
      </Button>
    </div>
  ) : requestReady && authorizationRequest === null ? (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600">
      <p>{error || t('settings.mcpRequestMissing')}</p>
    </div>
  ) : null;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border border-border/30 bg-card px-4 py-5 sm:px-5 sm:py-6">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground/70">{t('settings.integrations')}</p>
            <h1 className="text-xl font-semibold">{t('settings.mcpAuthorizeTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.mcpAuthorizeDesc')}</p>
          </div>
        </div>

        {requestLoading && !authorizationRequest && (
          <div className="rounded-xl border border-border/30 bg-card px-4 py-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t('settings.mcpLoadingRequest')}
            </div>
          </div>
        )}

        {error && !isProcessing && !requestLoading && authorizationRequest && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              {t('settings.mcpErrorTitle')}
            </div>
            <p>{error}</p>
          </div>
        )}

        {!authorizationRequest ? (
          <div className="rounded-xl border border-border/30 bg-card px-4 py-4">{authPrompt}</div>
        ) : (
          <div className="rounded-xl border border-border/30 bg-card p-4 sm:p-5 space-y-4">
            <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{authorizationRequest.clientName}</p>
                <PlatformBadge platform={authorizationRequest.platform} />
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">{t('settings.mcpClientId')}</span> {authorizationRequest.clientId}
                </p>
                <p>
                  <span className="font-medium">{t('settings.mcpResource')}</span> {authorizationRequest.resource}
                </p>
                <p>
                  <span className="font-medium">{t('settings.mcpExpiresAt')}</span> {formatDate(authorizationRequest.expiresAt, lang)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('settings.mcpScopeTitle')} ({selectedScopesLabel})</p>
              <div className="space-y-2">
                {authorizationRequest.scopes.map((scope) => {
                  const id = `scope-${scope}`;
                  const isChecked = selectedScopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      htmlFor={id}
                      className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2.5 cursor-pointer"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => toggleScope(scope, event.currentTarget.checked)}
                      />
                      <code className="text-xs">{scope}</code>
                    </label>
                  );
                })}
              </div>
              {selectedScopes.length < 1 && (
                <p className="text-xs text-destructive">{t('settings.mcpScopeRequired')}</p>
              )}
            </div>

            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground/80">{t('settings.mcpConsentHelp')}</p>
              <p className="mt-1 text-muted-foreground">{t('settings.mcpConsentDescription')}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="order-2 sm:order-1"
                onClick={() => void deny()}
                disabled={isProcessing || requestLoading}
              >
                {isProcessing ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <ShieldX aria-hidden="true" className="h-3.5 w-3.5" />}
                {t('settings.mcpDeny')}
              </Button>
              <Button
                type="button"
                className="order-1 sm:order-2"
                onClick={() => void approve()}
                disabled={!canApprove || isProcessing || requestLoading}
              >
                {isProcessing ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />}
                {t('settings.mcpApprove')}
              </Button>
            </div>

            {isProcessing && (
              <p className="text-xs text-muted-foreground">{t('settings.mcpSubmitting')}</p>
            )}

            {error && isProcessing === false && (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
