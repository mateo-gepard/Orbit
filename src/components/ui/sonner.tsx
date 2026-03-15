'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      toastOptions={{
        className: '!bg-card !text-foreground !border-border/60 !shadow-lg !rounded-xl !text-[13px] !font-medium',
        descriptionClassName: '!text-muted-foreground !text-[12px]',
      }}
      offset={80}
    />
  );
}
