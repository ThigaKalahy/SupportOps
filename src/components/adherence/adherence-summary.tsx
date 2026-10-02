import * as React from "react"
import Link from "next/link"

import { Section } from "@/components/ui/section"
import type { Adherence, Trend } from "@/lib/adherence"
import { fill, labels } from "@/lib/labels"
import type { MonthlyAdherence } from "@/server/queries/adherence"

import { MonthlySparkline } from "./adherence-panel"
import { RateWithTotal, TrendIndicator } from "./adherence-parts"

const L = labels.adherence

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  )
}

/**
 * Cumprimento na coluna estreita da visão geral: taxa bruta e ajustada lado a
 * lado (com o total), a tendência de 30 dias e a série mensal. A queda aparece
 * aqui sem clique; o detalhe fica na aba Combinados.
 */
export function AdherenceSummary({
  adherence,
  trend,
  series,
  days,
  href,
}: {
  adherence: Adherence
  trend: Trend
  series: MonthlyAdherence[]
  days: number
  href: string
}) {
  return (
    <Section
      title={L.overviewTitle}
      action={
        <Link href={href} className="text-xs text-accent hover:underline">
          {L.seeDetails}
        </Link>
      }
    >
      <dl className="flex flex-col">
        <Row label={fill(L.window, { days })}>
          <RateWithTotal rate={adherence.adherenceRate} />
        </Row>
        <Row label={L.adjusted}>
          <RateWithTotal rate={adherence.adjustedRate} />
        </Row>
        <Row label={L.trend}>
          <TrendIndicator trend={trend} />
        </Row>
      </dl>
      <MonthlySparkline series={series} />
    </Section>
  )
}
