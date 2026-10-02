import * as React from "react"

import { cn } from "@/lib/utils"

const MAX = 5

/**
 * Barra horizontal discreta de 4px para nível de 1 a 5: trecho preenchido em
 * cinza até o nível atual e marcas finas no nível esperado (atual, em tinta;
 * próxima senioridade, em tinta terciária). Sem cor de "bom/ruim", sem
 * radar, sem porcentagem — o texto ao lado diz os números.
 */
function LevelBar({
  level,
  expected,
  next,
  label,
  className,
}: {
  /** null = não avaliado (trilho vazio). */
  level: number | null
  expected?: number | null
  next?: number | null
  /** Nome acessível com os números por extenso. */
  label: string
  className?: string
}) {
  const pct = (n: number) => `${(Math.min(Math.max(n, 0), MAX) / MAX) * 100}%`
  return (
    <span
      data-slot="level-bar"
      role="img"
      aria-label={label}
      title={label}
      className={cn("relative inline-block h-2.5 w-32 shrink-0", className)}
    >
      <span className="absolute inset-x-0 top-[3px] h-1 rounded-xs bg-line" />
      {level !== null ? (
        <span className="absolute top-[3px] left-0 h-1 rounded-xs bg-ink-secondary" style={{ width: pct(level) }} />
      ) : null}
      {next ? <span className="absolute top-0 h-2.5 w-px -translate-x-px bg-ink-tertiary" style={{ left: pct(next) }} /> : null}
      {expected ? <span className="absolute top-0 h-2.5 w-px -translate-x-px bg-ink" style={{ left: pct(expected) }} /> : null}
    </span>
  )
}

export { LevelBar }
