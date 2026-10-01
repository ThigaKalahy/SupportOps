import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/** Rótulo mono, 11px, uppercase, tracking 0.06em, --ink-secondary. */
function MetaLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="meta-label"
      className={cn("font-mono text-2xs font-medium tracking-label text-ink-secondary uppercase", className)}
      {...props}
    />
  )
}

export { MetaLabel }
