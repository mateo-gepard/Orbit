'use client';

import { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { reportError } from '@/lib/report-error';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { source: 'route-error', digest: error.digest });
  }, [error]);

  return (
    <div className="mobile-page-gutter mx-auto flex min-h-[60vh] max-w-xl items-center justify-center py-12">
      <div className="surface-card w-full rounded-2xl p-6 text-center">
        <h1 className="text-lg font-semibold">{t('error.viewTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('error.viewDescription')}</p>
        <button type="button" onClick={reset} className="mt-5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          {t('error.tryAgain')}
        </button>
      </div>
    </div>
  );
}
