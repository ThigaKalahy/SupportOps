"use client"

import * as React from "react"
import Link from "next/link"

import { FeedbackDialog } from "@/components/forms/feedback-dialog"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/ui/section"
import { fill, labels } from "@/lib/labels"

const L = labels.priorityValidations.profile

export interface ProfileValidationData {
  days: number
  total: number
  changed: number
  changeRate: number | null
  topReason: { label: string; count: number } | null
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
 * Bloco compacto da coluna estreita do perfil: validações dos últimos 90
 * dias, taxa de alteração SEMPRE com o total ao lado (D19) e o motivo mais
 * frequente. Não é nota nem score. "Registrar feedback sobre isto" abre o
 * feedback com a pessoa e um contexto SUGERIDO — nada é escrito sozinho.
 */
export function ProfileValidationBlock({
  data,
  member,
  canWrite,
  href,
}: {
  data: ProfileValidationData
  member: { id: string; preferredName: string }
  canWrite: boolean
  href: string
}) {
  const [open, setOpen] = React.useState(false)
  const suggestion = fill(L.suggestion, {
    days: data.days,
    changed: data.changed,
    total: data.total,
    reason: data.topReason ? fill(L.topReasonValue, data.topReason) : L.noReason,
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
              <span className="font-mono">{data.total}</span>
            </Row>
            <Row label={L.changeRate}>
              <span className="font-mono">
                {fill(L.changeRateValue, { rate: data.changeRate ?? 0, changed: data.changed, total: data.total })}
              </span>
            </Row>
            <Row label={L.topReason}>
              {data.topReason ? fill(L.topReasonValue, data.topReason) : <span className="text-ink-secondary">{L.noReason}</span>}
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
