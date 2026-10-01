import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Etiqueta neutra (tag, contagem, categoria). Para estado/severidade use
 * StatusPill — Badge nunca carrega cor de severidade.
 */
const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-2xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-line bg-surface-sunken text-ink-secondary",
        outline: "border-line bg-surface text-ink-secondary",
        accent: "border-transparent bg-accent-wash text-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
