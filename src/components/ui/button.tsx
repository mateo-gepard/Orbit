import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "orbit-pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-normal disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-primary/90 hover:shadow-[var(--shadow-panel)]",
        destructive:
          "bg-destructive text-white shadow-[var(--shadow-soft)] hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 dark:bg-destructive/70",
        outline:
          "border border-border/70 bg-background/70 shadow-[var(--shadow-hairline)] hover:border-border hover:bg-accent/70 hover:text-accent-foreground dark:bg-input/20 dark:border-input/70 dark:hover:bg-input/40",
        secondary:
          "bg-secondary/90 text-secondary-foreground shadow-[var(--shadow-hairline)] hover:bg-secondary",
        ghost:
          "hover:bg-accent/75 hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3 md:h-9",
        xs: "h-8 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 md:h-6 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5 md:h-8",
        lg: "h-12 rounded-xl px-6 has-[>svg]:px-4 md:h-10 md:rounded-lg",
        icon: "size-11 rounded-xl md:size-9 md:rounded-lg",
        "icon-xs": "size-8 rounded-lg md:size-6 md:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-10 rounded-xl md:size-8 md:rounded-lg",
        "icon-lg": "size-11 rounded-xl md:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
