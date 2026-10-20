import { HistoryZone, LastDailyZone, OpenAgreementsZone } from "@/components/member-portal/portal-zones"
import { todayBusinessDate } from "@/lib/dates"
import { deadlineSeverity } from "@/lib/severity"
import type { MyClosedAgreement, MyLastDailyRecord, MyOpenAgreement } from "@/server/queries/member-portal"

import { Specimen } from "./specimen"

const day = (offset: number) => {
  const d = todayBusinessDate()
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

function open(id: string, title: string, dueOffset: number, reschedules: number, pendingReport: MyOpenAgreement["pendingReport"] = null): MyOpenAgreement {
  return {
    id,
    title,
    description: null,
    originalDueDate: day(dueOffset - reschedules),
    dueDate: day(dueOffset),
    priority: "NORMAL",
    deadline: deadlineSeverity(day(dueOffset)),
    reschedules,
    pendingReport,
  }
}

const OPEN: MyOpenAgreement[] = [
  open("p1", "Atualizar o cliente sobre a análise do relatório de jornada", -2, 3),
  open("p2", "Revisar os chamados sem descrição da fila N2", 0, 0, {
    outcome: "PARTIAL",
    blockerText: "Faltam os da semana passada",
    reason: null,
    suggestedDueDate: day(1),
  }),
  open("p3", "Documentar o fluxo de escalonamento", 4, 0),
]

const LAST: MyLastDailyRecord = {
  daily: { id: "d1", date: day(-1) },
  reviewed: [
    { agreementId: "r1", title: "Testar a versão nova do app no cliente", outcome: "DONE", blockerText: null, reason: null, newDueDate: null, reportedOutcome: null },
    { agreementId: "r2", title: "Abrir o chamado de faixa de RPM", outcome: "PARTIAL", blockerText: "Aguardando o log do cliente", reason: "Dependência de terceiro", newDueDate: day(1), reportedOutcome: "DONE" },
  ],
  created: [{ id: "c1", title: "Acompanhar a publicação de quarta", dueDate: day(1), status: "OPEN" }],
  proposals: [
    { id: "pr1", title: "Criar roteiro de teste offline", status: "ACCEPTED", suggestedDueDate: day(3), reply: null },
    { id: "pr2", title: "Trocar o horário da daily", status: "DISCARDED", suggestedDueDate: null, reply: "Vamos conversar no 1:1." },
  ],
}

const HISTORY: MyClosedAgreement[] = [
  { id: "h1", title: "Treinar a equipe nova no módulo de rotas", status: "DONE", originalDueDate: day(-9), dueDate: day(-9), completedAt: day(-9), outcome: "Turma inteira treinada" },
  { id: "h2", title: "Migrar os relatórios antigos", status: "CANCELLED", originalDueDate: day(-12), dueDate: day(-10), completedAt: null, outcome: "Substituído pelo relatório novo" },
]

/** Portal do colaborador (P25): as três zonas de /me, em largura de celular. */
export function LabMemberPortal() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Specimen state="Zona 1 · combinados abertos (reagendado 3x, relato pendente)" className="w-full max-w-reading">
        <div className="w-full">
          <OpenAgreementsZone agreements={OPEN} />
        </div>
      </Specimen>
      <Specimen state="Zona 1 · vazia" className="w-full max-w-reading">
        <div className="w-full">
          <OpenAgreementsZone agreements={[]} />
        </div>
      </Specimen>
      <Specimen state="Zona 2 · última daily (relato diferente do registrado, propostas)" className="w-full max-w-reading">
        <div className="w-full">
          <LastDailyZone record={LAST} />
        </div>
      </Specimen>
      <Specimen state="Zona 3 · histórico (recolhido)" className="w-full max-w-reading">
        <div className="w-full">
          <HistoryZone agreements={HISTORY} />
        </div>
      </Specimen>
    </div>
  )
}
