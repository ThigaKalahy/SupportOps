"use client"

import * as React from "react"
import Link from "next/link"

import { loadOneOnOneContext } from "@/actions/records"
import { AgreementStatusCell, DragIndicator } from "@/components/agreements/agreements-table"
import { DateStamp } from "@/components/ui/date-stamp"
import { MetaLabel } from "@/components/ui/meta-label"
import { StatusPill } from "@/components/ui/status-pill"
import { FollowUpCell } from "@/components/records/follow-up-cell"
import { formatDate } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import type { OneOnOneContext } from "@/server/queries/records"

const L = labels.forms.context

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0">
      <MetaLabel>{title}</MetaLabel>
      {children}
    </section>
  )
}

function Field({ label, text }: { label: string; text: string | null }) {
  if (!text) return null
  return (
    <p className="text-sm text-ink">
      <span className="text-xs text-ink-secondary">{label}: </span>
      <span className="whitespace-pre-line">{text}</span>
    </p>
  )
}

/**
 * Painel lateral do 1:1, somente leitura: o que ficou do encontro anterior
 * (revisão marcada, desenvolvimento, dificuldades, combinados gerados), os
 * combinados em aberto, o último feedback e o PDI ativo. Carrega quando o
 * formulário abre — você entra no 1:1 vendo o que ficou do último.
 */
export function OneOnOneContextPanel({ memberId }: { memberId: string }) {
  const [context, setContext] = React.useState<OneOnOneContext | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    setContext(null)
    setFailed(false)
    loadOneOnOneContext(memberId)
      .then((data) => active && setContext(data))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [memberId])

  if (failed) return <p className="text-sm text-overdue">{L.failed}</p>
  if (!context) {
    return (
      <p role="status" className="text-sm text-ink-secondary">
        {L.loading}
      </p>
    )
  }

  return <OneOnOneContextView context={context} />
}

/** Conteúdo do painel, já carregado (também usado no /ui-lab). */
export function OneOnOneContextView({ context }: { context: OneOnOneContext }) {
  const { previous, openAgreements, lastFeedback, plans } = context
  return (
    <div className="flex flex-col gap-3">
      <Block title={previous ? fill(L.previousDate, { date: formatDate(previous.date, "business") }) : L.previous}>
        {previous ? (
          <>
            {previous.followUp.status !== "none" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-ink-secondary">{L.nextReview}:</span>
                <FollowUpCell state={previous.followUp} />
              </div>
            ) : null}
            <Field label={L.topics} text={previous.topics} />
            <Field label={L.development} text={previous.development} />
            <Field label={L.difficulties} text={previous.difficulties} />
            {previous.agreements.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-secondary">{L.generated}</span>
                <ul className="flex flex-col gap-1">
                  {previous.agreements.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <Link href={`/agreements/${a.id}`} className="text-ink hover:underline">
                        {a.title}
                      </Link>
                      <AgreementStatusCell status={a.status} />
                      {a.reschedules > 0 ? <DragIndicator reschedules={a.reschedules} /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-tertiary">{L.previousNone}</p>
        )}
      </Block>

      <Block title={`${L.openAgreements} · ${openAgreements.length}`}>
        {openAgreements.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{L.openAgreementsNone}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {openAgreements.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5">
                <Link href={`/agreements/${a.id}`} className="text-sm text-ink hover:underline">
                  {a.title}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                  <DateStamp date={a.dueDate} kind="business" className="text-ink-secondary" />
                  {a.deadline.stage !== "on-track" ? (
                    <StatusPill severity={a.deadline.severity} strong={a.deadline.strong} label={a.deadline.label} />
                  ) : null}
                  {a.reschedules > 0 ? <DragIndicator reschedules={a.reschedules} /> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={L.lastFeedback}>
        {lastFeedback ? (
          <>
            <span className="flex items-center gap-2 text-xs text-ink-secondary">
              <DateStamp date={lastFeedback.date} kind="business" />
              <span>{enumLabel("feedbackCategory", lastFeedback.category)}</span>
            </span>
            <p className="line-clamp-3 text-sm text-ink">{lastFeedback.behavior}</p>
            <Field label={L.guidance} text={lastFeedback.guidance} />
            {lastFeedback.followUp.status !== "none" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-ink-secondary">{L.followUp}:</span>
                <FollowUpCell state={lastFeedback.followUp} />
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-tertiary">{L.lastFeedbackNone}</p>
        )}
      </Block>

      <Block title={L.plans}>
        {plans.length === 0 ? (
          <p className="text-sm text-ink-tertiary">{L.plansNone}</p>
        ) : (
          plans.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <p className="text-sm text-ink">{p.objective}</p>
              <span className="text-xs text-ink-secondary">
                {L.lastReview}: {p.lastReviewedAt ? formatDate(p.lastReviewedAt) : L.neverReviewed}
              </span>
              {p.openActions.length > 0 ? <span className="text-xs text-ink-secondary">{L.openActions}</span> : null}
              {p.openActions.length > 0 ? (
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-ink">
                  {p.openActions.map((a) => (
                    <li key={a.id}>
                      {a.description}
                      {a.dueDate ? <span className="text-xs text-ink-secondary"> · {formatDate(a.dueDate, "business")}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </Block>
    </div>
  )
}
