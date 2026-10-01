import * as React from "react"

import type { Severity } from "@/lib/severity"
import { cn } from "@/lib/utils"

const dotColor: Record<Severity, string> = {
  calm: "text-calm",
  attention: "text-attention",
  overdue: "text-overdue",
  neutral: "text-neutral",
}

/**
 * Ponto de 6px para severidade em linha de tabela. Desenhado como glifo SVG,
 * não como caixa arredondada. `label` vira o nome acessível e o title: a cor
 * nunca comunica sozinha. `strong` marca o degrau "atenção forte" (laranja).
 */
function SeverityDot({
  severity,
  strong = false,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children"> & {
  severity: Severity
  strong?: boolean
  label: string
}) {
  const isStrong = strong && severity === "attention"
  return (
    <svg
      data-slot="severity-dot"
      data-severity={severity}
      data-strong={isStrong || undefined}
      role="img"
      aria-label={label}
      viewBox="0 0 6 6"
      width={6}
      height={6}
      className={cn("inline-block shrink-0", isStrong ? "text-attention-strong" : dotColor[severity], className)}
      {...props}
    >
      <title>{label}</title>
      <circle cx={3} cy={3} r={3} fill="currentColor" />
    </svg>
  )
}

export { SeverityDot }
