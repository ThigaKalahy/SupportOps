import * as React from "react"

import { DueCell } from "@/components/agreements/agreements-table"
import { Section } from "@/components/ui/section"
import { StatusPill } from "@/components/ui/status-pill"
import { formatDate, formatDayMonth } from "@/lib/dates"
import { enumLabel, fill, labels } from "@/lib/labels"
import type { Severity } from "@/lib/severity"
import type { MyClosedAgreement, MyLastDailyRecord, MyOpenAgreement } from "@/server/queries/member-portal"

const L = labels.memberPortal

/**
 * Zonas do portal do colaborador (P25), somente leitura. Mobile-first (D45): coluna
 * única, itens com no mínimo 44px, sem tabela densa. Nenhuma taxa ou agregado (D7).
 */

const OUTCOME_SEVERITY: Record<MyLastDailyRecord["reviewed"][number]["outcome"], Severity> = {
  DONE: "calm",
  PARTIAL: "attention",
  NOT_DONE: "overdue",
}

const listClass = "flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"
const itemClass = "flex min-h-11 flex-col justify-center gap-1.5 px-4 py-3"

/** Zona 1 — os combinados abertos dela. */
export function OpenAgreementsZone({ agreements }: { agreements: MyOpenAgreement[] }) {
  return (
    <Section title={L.open.title} count={agreements.length}>
      {agreements.length === 0 ? (
        <p className="text-sm text-ink-secondary">{L.open.empty}</p>
      ) : (
        <ul className={listClass}>
          {agreements.map((a) => (
            <li key={a.id} className={itemClass}>
              <p className="text-sm font-medium text-ink">{a.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DueCell row={{ dueDate: a.dueDate, open: true, deadline: a.deadline }} />
                {a.reschedules >= 3 ? <span className="text-xs text-overdue">{fill(L.open.rescheduled, { count: a.reschedules })}</span> : null}
              </div>
              {a.pendingReport ? (
                <p className="text-xs text-ink-secondary">
                  {fill(L.open.reported, { outcome: enumLabel("checkinOutcome", a.pendingReport.outcome) })}
                  {a.pendingReport.blockerText ? ` — ${a.pendingReport.blockerText}` : null}
                  {a.pendingReport.suggestedDueDate
                    ? ` · ${fill(L.open.suggestedDue, { date: formatDayMonth(a.pendingReport.suggestedDueDate, "business") })}`
                    : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Zona 2 — o que a última daily registrou sobre ela. Sem resumo, decisões ou nota de ninguém. */
export function LastDailyZone({ record }: { record: MyLastDailyRecord | null }) {
  if (!record) {
    return (
      <Section title={L.last.title}>
        <p className="text-sm text-ink-secondary">{L.last.none}</p>
      </Section>
    )
  }
  return (
    <Section title={L.last.title} action={<span className="font-mono text-xs text-ink-secondary">{fill(L.last.subtitle, { date: formatDate(record.daily.date, "business") })}</span>}>
      {record.reviewed.length === 0 ? (
        <p className="text-sm text-ink-secondary">{L.last.nothingForYou}</p>
      ) : (
        <ul className={listClass}>
          {record.reviewed.map((r) => (
            <li key={r.agreementId} className={itemClass}>
              <p className="text-sm font-medium text-ink">{r.title}</p>
              {r.reportedOutcome ? (
                // D44: os dois valores lado a lado, sem rótulo de erro nem alerta.
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="text-ink-secondary">{fill(L.last.youReported, { outcome: enumLabel("checkinOutcome", r.reportedOutcome) })}</span>
                  <span className="text-ink">{fill(L.last.registered, { outcome: enumLabel("checkinOutcome", r.outcome) })}</span>
                </div>
              ) : (
                <span>
                  <StatusPill severity={OUTCOME_SEVERITY[r.outcome]} label={enumLabel("checkinOutcome", r.outcome)} />
                </span>
              )}
              {r.blockerText ? (
                <p className="text-xs text-ink-secondary">
                  {r.blockerText}
                  {r.reason ? ` (${r.reason})` : null}
                </p>
              ) : null}
              {r.newDueDate ? <p className="text-xs text-ink-secondary">{fill(L.last.newDue, { date: formatDayMonth(r.newDueDate, "business") })}</p> : null}
            </li>
          ))}
        </ul>
      )}

      {record.created.length ? (
        <div className="flex flex-col gap-2 pt-2">
          <h3 className="text-sm font-semibold text-ink">{L.last.created}</h3>
          <ul className={listClass}>
            {record.created.map((a) => (
              <li key={a.id} className={itemClass}>
                <p className="text-sm text-ink">{a.title}</p>
                <p className="font-mono text-xs text-ink-secondary">{fill(L.last.due, { date: formatDate(a.dueDate, "business") })}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {record.proposals.length ? (
        <div className="flex flex-col gap-2 pt-2">
          <h3 className="text-sm font-semibold text-ink">{L.last.proposals}</h3>
          <ul className={listClass}>
            {record.proposals.map((p) => (
              <li key={p.id} className={itemClass}>
                <p className="text-sm text-ink">{p.title}</p>
                <span>
                  <StatusPill
                    severity={p.status === "ACCEPTED" ? "calm" : "neutral"}
                    label={enumLabel("proposalStatus", p.status)}
                  />
                </span>
                {p.reply ? <p className="text-xs text-ink-secondary">{fill(L.last.reply, { text: p.reply })}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  )
}

/** Zona 3 — histórico, recolhido por padrão. Só para olhar para trás: sem taxa. */
export function HistoryZone({ agreements }: { agreements: MyClosedAgreement[] }) {
  return (
    <Section title={L.history.title}>
      <details className="group rounded-lg border border-line bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm text-ink">{L.history.toggle}</summary>
        {agreements.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-sm text-ink-secondary">{L.history.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line border-t border-line">
            {agreements.map((a) => (
              <li key={a.id} className={itemClass}>
                <p className="text-sm text-ink">{a.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusPill severity={a.status === "DONE" ? "calm" : "neutral"} label={enumLabel("agreementStatus", a.status)} />
                  {a.completedAt ? (
                    <span className="font-mono text-xs text-ink-secondary">{fill(L.history.completedAt, { date: formatDate(a.completedAt, "business") })}</span>
                  ) : null}
                </div>
                {a.outcome ? <p className="text-xs text-ink-secondary">{a.outcome}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </details>
    </Section>
  )
}
