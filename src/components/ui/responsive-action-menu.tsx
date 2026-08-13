'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { SlidersHorizontal, X } from 'lucide-react';

import { cn } from '@/lib/utils';

const MOBILE_QUERY = '(max-width: 1023px)';

const ResponsiveMenuContext = React.createContext(false);

function subscribeToMobileQuery(callback: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root>;

function Popover({ children, ...props }: PopoverProps) {
  const isMobile = React.useSyncExternalStore(
    subscribeToMobileQuery,
    getMobileSnapshot,
    getServerSnapshot,
  );

  return (
    <ResponsiveMenuContext.Provider value={isMobile}>
      {isMobile ? (
        <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>
      ) : (
        <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>
      )}
    </ResponsiveMenuContext.Provider>
  );
}

type PopoverTriggerProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>;

function PopoverTrigger(props: PopoverTriggerProps) {
  const isMobile = React.useContext(ResponsiveMenuContext);

  if (isMobile) {
    return (
      <DialogPrimitive.Trigger
        {...(props as React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>)}
      />
    );
  }

  return <PopoverPrimitive.Trigger {...props} />;
}

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  menuTitle?: string;
  menuDescription?: string;
};

function MenuHeader({
  description,
  mobile,
  title,
}: {
  description: string;
  mobile: boolean;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-5 pb-4 pt-5">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
        <SlidersHorizontal className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        {mobile ? (
          <DialogPrimitive.Title className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </DialogPrimitive.Title>
        ) : (
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">{title}</p>
        )}
        {mobile ? (
          <DialogPrimitive.Description className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        ) : (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

function PopoverContent({
  align = 'end',
  children,
  className,
  menuDescription = 'Organize, connect, and manage this item.',
  menuTitle = 'Item options',
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  const isMobile = React.useContext(ResponsiveMenuContext);

  if (isMobile) {
    const { onEscapeKeyDown, onPointerDownOutside } = props;

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-slot="responsive-menu-overlay" className="fixed inset-0 z-[159] bg-black/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-slot="responsive-menu-content"
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          className={cn(
            'fixed inset-x-0 z-[160] max-h-[min(84dvh,46rem)] overflow-hidden rounded-t-[28px] border border-b-0 border-border/70 bg-popover text-popover-foreground shadow-[0_-24px_70px_rgba(0,0,0,0.18)] outline-none bottom-[calc(var(--keyboard-inset,0px)+env(safe-area-inset-bottom,0px)-var(--safe-area-max-bottom,36px))] pb-[var(--safe-area-max-bottom,36px)]',
            'data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
        >
          <div className="flex h-6 items-center justify-center" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-foreground/15" />
          </div>
          <MenuHeader mobile title={menuTitle} description={menuDescription} />
          <div
            className={cn(
              'max-h-[calc(min(84dvh,46rem)-7.75rem)] !w-full overflow-y-auto overscroll-contain !px-5 !pt-5 !pb-6',
              '[&>div]:space-y-4 [&_[role=separator]]:my-4 [&_button]:min-h-11 [&_label]:leading-5',
              className,
            )}
          >
            {children}
          </div>
          <DialogPrimitive.Close
            className="absolute right-3 top-6 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:right-4 lg:top-8 lg:size-9"
            aria-label="Close item options"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        {...props}
        className="z-[160] !w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-border/70 bg-popover !p-0 text-popover-foreground shadow-[0_24px_70px_rgba(0,0,0,0.16)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <MenuHeader mobile={false} title={menuTitle} description={menuDescription} />
        <div
          className={cn(
            'max-h-[min(68vh,38rem)] !w-full overflow-y-auto overscroll-contain !p-5',
            '[&>div]:space-y-4 [&_[role=separator]]:my-4 [&_button]:min-h-10 [&_label]:leading-5',
            className,
          )}
        >
          {children}
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
