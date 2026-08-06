export default function Loading() {
  return (
    <div className="mobile-page-gutter mx-auto max-w-4xl py-6" role="status" aria-live="polite">
      <span className="sr-only">Loading view</span>
      <div className="space-y-4 animate-pulse" aria-hidden="true">
        <div className="h-7 w-40 rounded-lg bg-foreground/[0.08]" />
        <div className="h-28 rounded-2xl bg-foreground/[0.04]" />
        <div className="h-44 rounded-2xl bg-foreground/[0.04]" />
      </div>
    </div>
  );
}
