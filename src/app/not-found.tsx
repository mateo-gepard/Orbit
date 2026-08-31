'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="not-found-heading"
      className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
    >
      <div className="surface-card w-full max-w-sm rounded-2xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">404</p>
        <h1 id="not-found-heading" className="mt-2 text-lg font-semibold">{t('error.notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('error.notFoundDescription')}</p>
        <Link href="/" className="mt-5 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background">
          {t('error.goDashboard')}
        </Link>
      </div>
    </section>
  );
}
