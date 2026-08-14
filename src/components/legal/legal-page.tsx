import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function LegalPage({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--muted)),transparent_34rem)] px-5 py-8 text-foreground sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Threadmap
          </Link>
          <Image src="/favicon.svg" alt="Threadmap" width={34} height={34} priority />
        </header>

        <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          <div className="border-b border-border/60 px-6 py-8 sm:px-10 sm:py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{title}</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated 12 August 2026</p>
          </div>
          <article className="legal-copy space-y-8 px-6 py-8 text-sm leading-7 text-muted-foreground sm:px-10 sm:py-10 [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2">
            {children}
          </article>
        </div>

        <nav aria-label="Legal pages" className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/security" className="hover:text-foreground">Security</Link>
        </nav>
      </div>
    </main>
  );
}
