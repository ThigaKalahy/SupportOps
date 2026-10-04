import * as React from "react"
import Link from "next/link"

import { MetaLabel } from "@/components/ui/meta-label"
import { Section } from "@/components/ui/section"
import { Sparkline } from "@/components/ui/sparkline"
import { StatStrip, type StatItem } from "@/components/ui/stat-strip"
import { ADHERENCE, percent, type Adherence, type Trend } from "@/lib/adherence"
import { enumLabel, fill, labels, plural } from "@/lib/labels"
import type { BlockerBreakdown, MonthlyAdherence } from "@/server/queries/adherence"

import { formatRate, LowConfidenceMark, TrendIndicator } from "./adherence-parts"

const L = labels.adherence

/** Faixa de cumprimento: contagens, a taxa bruta com o total e a ajustada ao lado — nunca no lugar. */
export function adherenceStats(a: Adherence): StatItem[] {
  return [
    { id: "on-time", label: L.onTime, value: a.doneOnTime },
    { id: "late", label: L.late, value: a.doneLate },
    { id: "open", label: L.openOverdue, value: a.stillOpen, severity: a.stillOpen > 0 ? "overdue" : undefined },
    {
      id: "rate",
      label: L.rate,
      value: formatRate(a.adherenceRate),
      detail: plural(L.agreementsParen, a.adherenceRate.denominator),
      coverage: a.adherenceRate.lowConfidence ? L.lowConfidence : undefined,
    },
    {
      id: "adjusted",
      label: L.adjusted,
      value: formatRate(a.adjustedRate),
      detail: plural(L.agreementsParen, a.adjustedRate.denominator),
      coverage: a.adjustedRate.lowConfidence ? L.lowConfidence : undefined,
    },
  ]
}

/** Sparkline de 6 meses da taxa mensal (escala 0–100) com o número do mês corrente ao lado. */
export function MonthlySparkline({ series }: { series: MonthlyAdherence[] }) {
  const current = series[series.length - 1]
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Sparkline
        label={fill(L.monthly, { months: series.length })}
        values={series.map((m) => percent(m.adherenceRate))}
        domain={[0, 100]}
        width={144}
      />
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
        {current && current.totalDue > 0 ? (
          <>
            {fill(L.currentMonth, { value: `${formatRate(current.adherenceRate)} ${plural(L.agreementsParen, current.totalDue)}` })}
            {current.adherenceRate.lowConfidence ? <LowConfidenceMark /> : null}
          </>
        ) : (
          L.currentMonthNone
        )}
      </span>
    </div>
  )
}

/** Impeditivos por frequência, até 4 linhas, com a categoria (D18). */
export function BlockerList({ breakdown, limit = 4 }: { breakdown: BlockerBreakdown; limit?: number }) {
  if (breakdown.total === 0) return <p className="text-sm text-ink-secondary">{L.blockersNone}</p>
  return (
    <ul className="flex flex-col">
      {breakdown.byReason.slice(0, limit).map((r) => (
        <li key={r.reasonId ?? "none"} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
          <span className="min-w-0 text-sm text-ink">
            {r.label ?? <span className="text-ink-secondary">{L.blockerNoReason}</span>}
            {r.category ? <span className="text-xs text-ink-secondary"> · {enumLabel("blockerCategory", r.category)}</span> : null}
          </span>
          <span className="shrink-0 font-mono text-xs text-ink-secondary">{plural(L.blockersCount, r.count)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Bloco de cumprimento da aba Combinados do perfil: últimos 90 dias, taxa
 * mensal de 6 meses, tendência, combinados crônicos e impeditivos. Métrica,
 * não avaliação: nada aqui vira feedback sozinho.
 */
export function AdherencePanel({
  adherence,
  series,
  trend,
  breakdown,
  chronic,
  days,
}: {
  adherence: Adherence
  series: MonthlyAdherence[]
  trend: Trend
  breakdown: BlockerBreakdown
  chronic: { id: string; title: string }[]
  days: number
}) {
  return (
    <Section title={fill(L.profileTitle, { days })}>
      {adherence.totalDue === 0 ? (
        <p className="text-sm text-ink-secondary">{L.noData}</p>
      ) : (
        <StatStrip items={adherenceStats(adherence)} aria-label={fill(L.profileTitle, { days })} />
      )}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <MetaLabel>{fill(L.monthly, { months: series.length })}</MetaLabel>
            <MonthlySparkline series={series} />
          </div>
          <div className="flex flex-col gap-1.5">
            <MetaLabel title={L.trendHelp}>{L.trend}</MetaLabel>
            <TrendIndicator trend={trend} />
          </div>
          {chronic.length > 0 ? (
            <p className="text-sm text-overdue">
              {plural(L.chronic, chronic.length, { limit: ADHERENCE.chronicReschedules })}{" "}
              {chronic.map((a, i) => (
                <React.Fragment key={a.id}>
                  {i > 0 ? ", " : null}
                  <Link href={`/agreements/${a.id}`} className="underline underline-offset-2 hover:text-ink">
                    {a.title}
                  </Link>
                </React.Fragment>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <MetaLabel>{L.blockers}</MetaLabel>
          <BlockerList breakdown={breakdown} />
        </div>
      </div>
    </Section>
  )
}
