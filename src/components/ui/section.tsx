import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Bloco de conteúdo dentro de uma página: título de 13px semibold, contagem
 * opcional em mono e no máximo uma ação discreta à direita (link "ver todos",
 * "editar"). Sem card, sem borda, sem sombra — a separação entre blocos é o
 * espaço (24/32px) e, no máximo, um divisor de 1px.
 */
function Section({
  title,
  count,
  action,
  headingLevel = 2,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: string
  /** Quantidade de itens do bloco, em mono ao lado do título. */
  count?: number
  action?: React.ReactNode
  headingLevel?: 2 | 3
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3"
  return (
    <section data-slot="section" aria-label={title} className={cn("flex min-w-0 flex-col gap-3", className)} {...props}>
      <div className="flex min-h-6 items-center justify-between gap-3">
        <Heading className="flex items-baseline gap-2 text-sm font-semibold text-ink">
          {title}
          {count !== undefined ? <span className="font-mono text-xs font-normal text-ink-secondary">{count}</span> : null}
        </Heading>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

export { Section }
