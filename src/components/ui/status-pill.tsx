import * as React from "react"

import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"

const severityClasses: Record<Severity, string> = {
  calm: "bg-calm-wash text-calm",
  attention: "bg-attention-wash text-attention",
  overdue: "bg-overdue-wash text-overdue",
  neutral: "bg-neutral-wash text-neutral",
}

/** Degrau "laranja" da escala graduada: atenção forte. Só existe para `attention`. */
const strongClasses = "bg-attention-strong-wash text-attention-strong"

/**
 * Estado de um registro: fundo wash, texto na cor forte, 11px, raio 4px.
 * Não é pill redonda. O rótulo é obrigatório — severidade nunca só por cor.
 * `strong` marca o degrau "atenção forte" (laranja); ignorado fora de `attention`.
 */
function StatusPill({
  severity,
  strong = false,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  severity: Severity
  strong?: boolean
  label: string
}) {
  const isStrong = strong && severity === "attention"
  return (
    <span
      data-slot="status-pill"
      data-severity={severity}
      data-strong={isStrong || undefined}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap",
        isStrong ? strongClasses : severityClasses[severity],
        className
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { StatusPill, severityClasses }
