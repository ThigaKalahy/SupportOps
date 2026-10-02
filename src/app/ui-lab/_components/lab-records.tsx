"use client"

import * as React from "react"

import { GeneratedAgreements } from "@/components/forms/generated-agreements"
import { OneOnOneContextView } from "@/components/forms/one-on-one-context"
import { FollowUpCell } from "@/components/records/follow-up-cell"
import { RecordsTable } from "@/components/records/records-table"
import { todayBusinessDate } from "@/lib/dates"
import { feedbackFollowUp, oneOnOneFollowUp } from "@/lib/follow-up"
import { deadlineSeverity } from "@/lib/severity"
import type { GeneratedAgreementInput } from "@/lib/validators/records"
import type { RecordRow } from "@/server/queries/records"

import { Specimen } from "./specimen"

/** 1:1 e feedbacks: follow-up em todos os estados, combinados gerados, painel de contexto e o índice. */

const today = todayBusinessDate()
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}
const member = { id: "lab-m1", preferredName: "Henrique", fullName: "Henrique Toledo" }

const ROWS: RecordRow[] = [
  {
    kind: "feedback",
    id: "f1",
    date: day(-3),
    member,
    visibility: "SHARED",
    author: "Thiago Silva",
    agreements: [{ id: "a1", title: "Anexar o log em todo escalonamento", status: "OPEN", dueDate: day(4) }],
    followUp: feedbackFollowUp({ id: "f1", followUpAt: day(2) }, [], today),
    category: "RECOGNITION",
    context: "Plantão de sábado",
    behavior: "Resolveu o incidente do gateway e documentou a causa raiz no mesmo dia.",
    impact: "Cliente voltou a faturar em 40 minutos.",
    guidance: null,
  },
  {
    kind: "oneOnOne",
    id: "o1",
    date: day(-40),
    member,
    visibility: "PRIVATE",
    author: "Thiago Silva",
    agreements: [],
    followUp: oneOnOneFollowUp({ date: day(-40), nextReviewAt: day(-12) }, [], today),
    durationMinutes: 30,
    topics: "Fila de integração e escalonamento",
    memberPerception: null,
    managerPerception: "Ansioso com a fila de ERP.",
    wins: null,
    difficulties: "Chamados longos de ERP",
    development: "Praticar análise de log com evidência",
  },
  {
    kind: "oneOnOne",
    id: "o0",
    date: day(-80),
    member,
    visibility: "SHARED",
    author: "Thiago Silva",
    agreements: [],
    followUp: oneOnOneFollowUp({ date: day(-80), nextReviewAt: day(-50) }, [{ kind: "oneOnOne", date: day(-40) }], today),
    durationMinutes: null,
    topics: "Metas do trimestre",
    memberPerception: null,
    managerPerception: null,
    wins: null,
    difficulties: null,
    development: null,
  },
]

export function LabRecords() {
  const [agreements, setAgreements] = React.useState<GeneratedAgreementInput[]>([
    { title: "Revisar o roteiro de escalonamento", dueDate: "" },
    { title: "", dueDate: "01/01/2020" },
  ])
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="FollowUpCell · sem · em dia · vence em breve · vencido · feito">
        <FollowUpCell state={{ status: "none" }} />
        <FollowUpCell state={{ status: "pending", date: day(10), deadline: deadlineSeverity(day(10), { today }) }} />
        <FollowUpCell state={{ status: "pending", date: day(2), deadline: deadlineSeverity(day(2), { today }) }} />
        <FollowUpCell state={{ status: "pending", date: day(-12), deadline: deadlineSeverity(day(-12), { today }) }} />
        <FollowUpCell state={{ status: "done", date: day(-50), resolvedAt: day(-40) }} />
      </Specimen>
      <Specimen state="GeneratedAgreements · com erro na segunda linha" className="w-full max-w-xl">
        <div className="w-full">
          <GeneratedAgreements
            memberName="Henrique"
            value={agreements}
            onChange={setAgreements}
            errors={[undefined, { title: { message: "Texto curto demais." } }]}
          />
        </div>
      </Specimen>
      <Specimen state="Painel de contexto do 1:1" className="w-full max-w-sm">
        <div className="w-full rounded-lg border border-line bg-surface-sunken p-4">
          <OneOnOneContextView
            context={{
              previous: {
                id: "o1",
                date: day(-40),
                topics: "Fila de integração e escalonamento",
                difficulties: "Chamados longos de ERP",
                development: "Praticar análise de log com evidência",
                followUp: oneOnOneFollowUp({ date: day(-40), nextReviewAt: day(-12) }, [], today),
                agreements: [{ id: "a2", title: "Documentar dois casos de ERP", status: "OPEN", dueDate: day(-5), reschedules: 3 }],
              },
              openAgreements: [
                { id: "a2", title: "Documentar dois casos de ERP", dueDate: day(-5), reschedules: 3, deadline: deadlineSeverity(day(-5), { today }) },
              ],
              lastFeedback: {
                id: "f1",
                date: day(-3),
                category: "DEVELOPMENT",
                behavior: "Escalou sem anexar o log.",
                guidance: "Anexar o log antes de escalar.",
                followUp: feedbackFollowUp({ id: "f1", followUpAt: day(2) }, [], today),
              },
              plans: [
                {
                  id: "p1",
                  objective: "Diagnosticar com evidência os chamados de lentidão",
                  lastReviewedAt: day(-84),
                  openActions: [{ id: "x1", description: "Acompanhar dois plantões com o Rafael", dueDate: day(10) }],
                },
              ],
            }}
          />
        </div>
      </Specimen>
      <Specimen state="RecordsTable · reconhecimento compartilhado · 1:1 privado com revisão vencida · revisão feita" className="w-full">
        <div className="w-full">
          <RecordsTable rows={ROWS} empty={{ title: "Vazio", direction: "" }} />
        </div>
      </Specimen>
    </div>
  )
}
