import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border/60 placeholder:text-muted-foreground/40 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/20 flex min-h-24 w-full rounded-xl border bg-background/70 px-3 py-2.5 text-base leading-6 shadow-[var(--shadow-hairline)] transition-[border-color,background-color,box-shadow,color] duration-200 outline-none disabled:cursor-not-allowed disabled:opacity-50 md:min-h-20 md:rounded-lg md:py-2 md:text-sm md:leading-5",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
