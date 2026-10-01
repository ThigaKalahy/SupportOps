import * as React from "react"

import { MetaLabel } from "@/components/ui/meta-label"
import { cn } from "@/lib/utils"

/** Amostra do /ui-lab: nome do estado em MetaLabel acima do componente. */
export function Specimen({
  state,
  children,
  className,
}: {
  state: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <MetaLabel>{state}</MetaLabel>
      <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/** Seção do /ui-lab. */
export function LabSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-0.5">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="text-sm text-ink-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
