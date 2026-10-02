import * as React from "react"
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"

import { StatusPill } from "@/components/ui/status-pill"
import { ADHERENCE, percent, type Rate, type Trend } from "@/lib/adherence"
import { fill, labels, plural } from "@/lib/labels"
import { cn } from "@/lib/utils"

const L = labels.adherence

/** "78%" ou "—". */
export function formatRate(rate: Rate): string {
  const value = percent(rate)
  return value === null ? "—" : `${value}%`
}

/** Marca obrigatória de taxa com menos de 5 combinados. */
export function LowConfidenceMark({ className }: { className?: string }) {
  return (
    <StatusPill
      severity="neutral"
      label={L.lowConfidence}
      title={fill(L.lowConfidenceHelp, { min: ADHERENCE.minSample })}
      className={className}
    />
  )
}

/** Taxa com o total sempre ao lado (D19): "78% (14 combinados)", e a marca de amostra pequena. */
export function RateWithTotal({ rate, className }: { rate: Rate; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      <span className={cn("font-mono", rate.lowConfidence ? "text-ink-secondary" : "text-ink")}>{formatRate(rate)}</span>
      <span className="text-xs text-ink-secondary">{plural(L.agreementsParen, rate.denominator)}</span>
      {rate.lowConfidence && rate.denominator > 0 ? <LowConfidenceMark /> : null}
    </span>
  )
}

/**
 * Tendência: seta e delta em pontos percentuais (últimos 30 dias contra os 30
 * anteriores). Sem amostra suficiente nas duas janelas, não há seta.
 */
export function TrendIndicator({ trend, compact = false }: { trend: Trend; compact?: boolean }) {
  const previous = percent(trend.previous)
  const current = percent(trend.current)
  const detail =
    previous !== null && current !== null
      ? `${fill(L.trendValue, { previous, current })} · ${plural(L.agreements, trend.previous.denominator)} e ${plural(L.agreements, trend.current.denominator)}`
      : undefined
  if (!trend.reliable || trend.deltaPoints === null) {
    return (
      <span className="text-xs text-ink-tertiary" title={detail}>
        {compact ? "—" : L.trendInsufficient}
      </span>
    )
  }
  const delta = trend.deltaPoints
  const Icon = delta > 0 ? ArrowUpRightIcon : delta < 0 ? ArrowDownRightIcon : ArrowRightIcon
  const tone = delta >= ADHERENCE.dropPoints ? "text-calm" : delta <= -ADHERENCE.dropPoints ? "text-attention-strong" : "text-ink-secondary"
  const text = delta === 0 ? L.trendFlat : fill(delta > 0 ? L.trendUp : L.trendDown, { delta: Math.abs(delta) })
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", tone)} title={detail}>
      <Icon className="size-4" aria-hidden />
      <span className="font-mono">{fill(L.pp, { delta: delta > 0 ? `+${delta}` : String(delta) })}</span>
      <span className="sr-only">
        {text}
        {detail ? ` (${detail})` : ""}
      </span>
      {compact ? null : (
        <span className="text-xs text-ink-secondary" aria-hidden>
          {previous}% → {current}%
        </span>
      )}
    </span>
  )
}
