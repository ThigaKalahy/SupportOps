import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent text-surface hover:bg-accent/90",
        secondary: "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunken",
        ghost: "text-ink-secondary hover:bg-surface-sunken hover:text-ink",
        destructive: "bg-overdue text-surface hover:bg-overdue/90",
        link: "h-auto px-0 text-accent underline-offset-2 hover:underline",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        icon: "size-9",
        "icon-sm": "size-8",
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
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Desabilita e troca o conteúdo inicial por um indicador de carregamento. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Loader2Icon className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
