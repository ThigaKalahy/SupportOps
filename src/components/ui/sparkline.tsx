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
 */
function Sparkline({
  values,
  width = 96,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"svg">, "children" | "height" | "values"> & {
  values: number[]
  width?: number
  /** Nome acessível: o que a série mede. */
  label: string
}) {
  const first = values[0]
  const last = values[values.length - 1]

  if (values.length < 2 || first === undefined || last === undefined) {
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

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  const points = values
    .map((v, i) => {
      const x = i * step
      const y = max === min ? HEIGHT / 2 : PAD + (1 - (v - min) / range) * (HEIGHT - PAD * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")

  const summary = fill(labels.sparkline.summary, {
    count: values.length,
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
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export { Sparkline }
