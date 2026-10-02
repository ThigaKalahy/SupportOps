import * as React from "react"

import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"

export interface StatItem {
  id: string
  label: string
  /** null = sem dado (exibe "—"). Números são formatados em pt-BR. */
  value: number | string | null
  /**
   * Cobertura do número (ex.: "6 avaliações", "de 14 combinados").
   * Obrigatória para métrica: número sem cobertura é mentira (CLAUDE.md).
   */
  coverage?: string
  /** Complemento pequeno ao lado do número (ex.: "(14 combinados)" ao lado de "78%"). */
  detail?: string
  /** Só para estado (ex.: vencidos). Nunca para "bom/ruim" de desempenho. */
  severity?: Extract<Severity, "attention" | "overdue">
}

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

const valueColor: Record<NonNullable<StatItem["severity"]>, string> = {
  attention: "text-attention",
  overdue: "text-overdue",
}

/**
 * Faixa horizontal de números em mono com rótulo pequeno embaixo. Substitui a
 * grade de cards de KPI em todo o produto: sem card, sem sombra, sem ícone.
 */
function StatStrip({
  items,
  className,
  ...props
}: Omit<React.ComponentProps<"dl">, "children"> & {
  items: StatItem[]
}) {
  return (
    <dl
      data-slot="stat-strip"
      className={cn("flex flex-wrap items-stretch gap-y-3 border-y border-line py-3", className)}
      {...props}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-w-28 flex-col-reverse gap-0.5 border-l border-line px-4 first:border-l-0 first:pl-0"
        >
          <dt className="text-xs text-ink-secondary">
            {item.label}
            {item.coverage ? <span className="text-ink-secondary"> · {item.coverage}</span> : null}
          </dt>
          <dd
            className={cn(
              "font-mono text-xl font-medium",
              item.value === null ? "text-ink-tertiary" : item.severity ? valueColor[item.severity] : "text-ink"
            )}
          >
            {item.value === null ? "—" : typeof item.value === "number" ? numberFormat.format(item.value) : item.value}
            {item.detail ? <span className="ml-1.5 font-sans text-xs font-normal text-ink-secondary">{item.detail}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export { StatStrip }
