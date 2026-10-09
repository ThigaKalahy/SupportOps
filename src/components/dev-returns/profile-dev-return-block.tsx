"use client"

import * as React from "react"
import Link from "next/link"

import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/ui/section"
import { Sparkline } from "@/components/ui/sparkline"
import { StatusPill } from "@/components/ui/status-pill"
import { fill, labels } from "@/lib/labels"

const L = labels.devReturns.profile

export interface ProfileDevReturnData {
  days: number
  total: number
  attributable: number
  /** Chamados validados na janela (o denominador, sempre ao lado — D19). */
  ticketsValidated: number
  lowConfidence: boolean
  topReason: { label: string; count: number } | null
  /** Devoluções por mês, 6 meses. */
  series: number[]
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="text-right text-sm text-ink">{children}</dd>
    </div>
  )
}

/**
 * Bloco compacto da coluna estreita do perfil (P20): devoluções dos últimos
 * 90 dias com o total de chamados validados ao lado, atribuíveis ao analista
 * (N de M), motivo mais frequente e a série de 6 meses. Não é nota nem score
 * (D7). "Registrar feedback sobre isto" abre o feedback com a pessoa e um
 * contexto SUGERIDO — nada é escrito sozinho.
 */
export function ProfileDevReturnBlock({
  data,
  member,
  canWrite,
  href,
}: {
  data: ProfileDevReturnData
  member: { id: string; preferredName: string }
  canWrite: boolean
  href: string
}) {
  const [open, setOpen] = React.useState(false)
  const reason = data.topReason ? fill(L.topReasonValue, data.topReason) : labels.devReturns.table.none
  const suggestion = fill(L.suggestion, {
    days: data.days,
    count: data.total,
    total: data.ticketsValidated,
    attributable: data.attributable,
    reason,
  })

  return (
    <Section
      title={L.title}
      action={
        <Link href={href} className="text-xs text-accent hover:underline">
          {L.seeAll}
        </Link>
      }
    >
      <p className="-mt-2 text-xs text-ink-secondary">{fill(L.window, { days: data.days })}</p>
      {data.total === 0 ? (
        <p className="text-sm text-ink-secondary">{fill(L.none, { days: data.days })}</p>
      ) : (
        <>
          <dl className="flex flex-col">
            <Row label={L.total}>
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                <span className="font-mono">
                  {data.ticketsValidated > 0
                    ? fill(L.totalValue, { count: data.total, total: data.ticketsValidated })
                    : fill(L.totalValueNoValidations, { count: data.total })}
                </span>
                {data.lowConfidence ? <StatusPill severity="neutral" label={labels.devReturns.summary.lowConfidence} /> : null}
              </span>
            </Row>
            <Row label={L.attributable}>
              <span className="font-mono">{fill(L.attributableValue, { count: data.attributable, total: data.total })}</span>
            </Row>
            <Row label={L.topReason}>{data.topReason ? reason : <span className="text-ink-secondary">{labels.devReturns.table.none}</span>}</Row>
            <Row label={L.series}>
              <Sparkline values={data.series} label={fill(L.seriesLabel, { values: data.series.join(", ") })} />
            </Row>
          </dl>
          {canWrite ? (
            <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setOpen(true)}>
              {L.feedback}
            </Button>
          ) : null}
        </>
      )}
      {canWrite ? <FeedbackDialog open={open} onOpenChange={setOpen} member={member} suggestion={suggestion} /> : null}
    </Section>
  )
}
