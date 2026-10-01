import * as React from "react"

import { cn } from "@/lib/utils"

/** Título da página, subtítulo opcional, ações à direita e borda inferior. */
function PageHeader({
  title,
  subtitle,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"header">, "title" | "children"> & {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-ink-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export { PageHeader }
