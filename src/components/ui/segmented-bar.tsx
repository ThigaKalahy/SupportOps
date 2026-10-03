import * as React from "react"

import { cn } from "@/lib/utils"

export interface Segment {
  id: string
  label: string
  value: number
}

/** Tons do acento por posição: composição não é severidade, então nada de vermelho/âmbar/verde. */
const TONES = ["bg-accent", "bg-accent/60", "bg-accent/35", "bg-accent/20", "bg-line-strong"]

/**
 * Barra horizontal segmentada de 6px, proporcional aos valores, com a
 * legenda em texto na mesma linha (a cor nunca comunica sozinha). Para
 * composição (ex.: senioridades do time) — não para desempenho.
 */
function SegmentedBar({
  segments,
  label,
  className,
}: {
  segments: Segment[]
  /** Frase completa para leitor de tela ("9 pessoas: 1 Sênior, 4 Pleno, 4 Júnior"). */
  label: string
  className?: string
}) {
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  return (
    <div data-slot="segmented-bar" className={cn("flex flex-col gap-2", className)}>
      <div role="img" aria-label={label} className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-xs">
        {total === 0 ? (
          <span className="h-full w-full bg-line" />
        ) : (
          visible.map((s, i) => (
            <span key={s.id} className={cn("h-full", TONES[i % TONES.length])} style={{ flexGrow: s.value, flexBasis: 0 }} />
          ))
        )}
      </div>
      <p aria-hidden className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-secondary">
        {visible.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block size-2 rounded-xs", TONES[i % TONES.length])} />
            {s.label} <span className="font-mono text-ink">{s.value}</span>
          </span>
        ))}
      </p>
    </div>
  )
}

export { SegmentedBar }
