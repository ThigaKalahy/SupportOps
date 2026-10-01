import * as React from "react"

import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"

const severityClasses: Record<Severity, string> = {
  calm: "bg-calm-wash text-calm",
  attention: "bg-attention-wash text-attention",
  overdue: "bg-overdue-wash text-overdue",
  neutral: "bg-neutral-wash text-neutral",
}

/**
 * Estado de um registro: fundo wash, texto na cor forte, 11px, raio 4px.
 * Não é pill redonda. O rótulo é obrigatório — severidade nunca só por cor.
 */
function StatusPill({
  severity,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  severity: Severity
  label: string
}) {
  return (
    <span
      data-slot="status-pill"
      data-severity={severity}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap",
        severityClasses[severity],
        className
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { StatusPill, severityClasses }
