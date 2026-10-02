import * as React from "react"

import { fill, labels } from "@/lib/labels"
import { cn } from "@/lib/utils"

const HEIGHT = 24
/** Margem vertical para o traço de 1px não ser cortado no topo e na base. */
const PAD = 1
const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

/**
 * Série temporal mínima: SVG inline, traço de 1px, 24px de altura, sem eixo,
 * sem legenda, sem biblioteca de gráfico. A cor vem do texto (currentColor).
 *
 * `null` é ponto sem dado (ex.: mês sem combinado vencido): a linha não passa
 * por ele, e o ponto isolado vira um traço curto. `domain` fixa a escala
 * (ex.: [0, 100] para taxa) — sem ela, a escala vai do mínimo ao máximo da
 * série, e 60 → 70 pareceria um despenhadeiro.
 */
function Sparkline({
  values,
  width = 96,
  label,
  domain,
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children" | "height" | "values"> & {
  values: (number | null)[]
  width?: number
  /** Nome acessível: o que a série mede. */
  label: string
  domain?: [number, number]
}) {
  const present = values.filter((v): v is number => v !== null)
  const first = present[0]
  const last = present[present.length - 1]

  if (present.length < 2 || first === undefined || last === undefined) {
    return (
      <svg
        data-slot="sparkline"
        data-empty
        role="img"
        aria-label={`${label}: ${labels.sparkline.empty}`}
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className={cn("shrink-0 text-line", className)}
        {...props}
      >
        <title>{labels.sparkline.empty}</title>
        <line x1={0} x2={width} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="currentColor" strokeWidth={1} strokeDasharray="2 3" />
      </svg>
    )
  }

  const min = domain ? domain[0] : Math.min(...present)
  const max = domain ? domain[1] : Math.max(...present)
  const range = max - min || 1
  const step = width / Math.max(values.length - 1, 1)
  const y = (v: number) => (max === min ? HEIGHT / 2 : PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2))

  // Trechos contínuos entre os pontos sem dado.
  const segments: string[][] = [[]]
  values.forEach((v, i) => {
    if (v === null) {
      if (segments[segments.length - 1]!.length > 0) segments.push([])
      return
    }
    segments[segments.length - 1]!.push(`${(i * step).toFixed(2)},${y(v).toFixed(2)}`)
  })

  const summary = fill(labels.sparkline.summary, {
    count: present.length,
    first: numberFormat.format(first),
    last: numberFormat.format(last),
  })

  return (
    <svg
      data-slot="sparkline"
      role="img"
      aria-label={`${label}: ${summary}`}
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("shrink-0 text-ink-secondary", className)}
      {...props}
    >
      <title>{summary}</title>
      {segments
        .filter((points) => points.length > 0)
        .map((points, i) => {
          if (points.length === 1) {
            const [x, py] = points[0]!.split(",").map(Number) as [number, number]
            return (
              <line key={i} x1={Math.max(x - 2, 0)} x2={Math.min(x + 2, width)} y1={py} y2={py} stroke="currentColor" strokeWidth={1} />
            )
          }
          return (
            <polyline
              key={i}
              points={points.join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
    </svg>
  )
}

export { Sparkline }
