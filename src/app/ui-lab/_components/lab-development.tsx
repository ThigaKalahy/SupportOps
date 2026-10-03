"use client"

import { CompetencyList } from "@/components/development/competency-list"
import { MentorshipSection } from "@/components/development/mentorship-section"
import { PlanBlock } from "@/components/development/plan-block"
import { TraitsSection } from "@/components/development/traits-section"
import { LevelBar } from "@/components/ui/level-bar"
import { todayBusinessDate } from "@/lib/dates"
import { planStaleness } from "@/lib/development"
import type { PlanView } from "@/server/queries/development"

import { Specimen } from "./specimen"

/** Desenvolvimento: barra de nível em todos os estados, PDI ativo/parado/concluído, competências e pontos. */

const today = todayBusinessDate()
const day = (offset: number) => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

function plan(id: string, patch: Partial<PlanView>): PlanView {
  const base: PlanView = {
    id,
    member: { id: "m1", preferredName: "Henrique" },
    competency: { id: "c1", name: "Análise de log" },
    status: "ACTIVE",
    currentSituation: "Escala chamados de lentidão sem evidência.",
    objective: "Diagnosticar com evidência os chamados de lentidão",
    expectedEvidence: "Dez chamados seguidos com log anexado",
    progressNote: null,
    startedAt: day(-90),
    dueDate: day(30),
    completedAt: null,
    lastReviewedAt: null,
    staleness: planStaleness({ lastReviewedAt: null, startedAt: day(-90) }, today),
    progress: { done: 1, total: 3 },
    actions: [
      { id: "a1", description: "Ler o guia de análise de log", ownerType: "MEMBER", ownerName: null, dueDate: day(-60), status: "DONE", completedAt: day(-62) },
      { id: "a2", description: "Acompanhar dois plantões", ownerType: "MENTOR", ownerName: "Rafael", dueDate: day(10), status: "OPEN", completedAt: null },
      { id: "a3", description: "Revisar os diagnósticos com o gestor", ownerType: "MANAGER", ownerName: null, dueDate: null, status: "OPEN", completedAt: null },
    ],
  }
  return { ...base, ...patch }
}

const reviewedAt = new Date(Date.now() - 5 * 86_400_000)

export function LabDevelopment() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="LevelBar · abaixo do esperado · no esperado · acima da próxima · não avaliada · sem matriz">
        <LevelBar level={2} expected={3} next={4} label="Nível 2 de 5 · esperado 3 · próxima 4" />
        <LevelBar level={3} expected={3} next={4} label="Nível 3 de 5 · esperado 3 · próxima 4" />
        <LevelBar level={5} expected={3} next={4} label="Nível 5 de 5 · esperado 3 · próxima 4" />
        <LevelBar level={null} expected={3} next={4} label="Não avaliada" />
        <LevelBar level={3} label="Nível 3 de 5, sem nível esperado" />
      </Specimen>
      <Specimen state="PlanBlock · ativo parado (nunca acompanhado há 90 dias)" className="w-full">
        <div className="w-full">
          <PlanBlock plan={plan("p1", {})} canWrite edit={{ competencies: [{ id: "c1", name: "Análise de log" }], mentors: [{ id: "m2", preferredName: "Rafael" }] }} />
        </div>
      </Specimen>
      <Specimen state="PlanBlock · ativo em dia · concluído (leitura)" className="w-full">
        <div className="grid w-full gap-4 lg:grid-cols-2">
          <PlanBlock
            plan={plan("p2", {
              lastReviewedAt: reviewedAt,
              progressNote: "Anexou log em 4 de 5 escalonamentos.",
              staleness: planStaleness({ lastReviewedAt: reviewedAt, startedAt: day(-90) }, today),
            })}
            canWrite
          />
          <PlanBlock plan={plan("p3", { status: "DONE", completedAt: day(-3), lastReviewedAt: reviewedAt })} canWrite={false} />
        </div>
      </Specimen>
      <Specimen state="CompetencyList · com matriz" className="w-full">
        <div className="w-full">
          <CompetencyList
            seniority={{ current: "Pleno", next: "Sênior" }}
            matrixEmpty={false}
            canWrite
            competencies={[
              { id: "c1", name: "Análise de log", category: "Técnica", level: 2, assessedAt: day(-40), evidence: null, expectedCurrent: 3, expectedNext: 4 },
              { id: "c2", name: "Diagnóstico de hardware", category: "Técnica", level: 4, assessedAt: day(-40), evidence: null, expectedCurrent: 3, expectedNext: 4 },
              { id: "c3", name: "Escalonamento", category: "Processo", level: null, assessedAt: null, evidence: null, expectedCurrent: 3, expectedNext: null },
            ]}
          />
        </div>
      </Specimen>
      <Specimen state="MentorshipSection · nos dois sentidos, com registrar e encerrar · vazia (leitura)" className="w-full">
        <div className="grid w-full gap-6 lg:grid-cols-2">
          <MentorshipSection
            canWrite
            member={{ id: "m1", preferredName: "Henrique" }}
            people={[{ id: "m2", preferredName: "Rafael" }, { id: "m3", preferredName: "Larissa" }]}
            competencies={[{ id: "c1", name: "Análise de log" }]}
            mentorships={[
              { id: "l1", role: "mentee", other: { id: "m2", preferredName: "Rafael" }, competency: "Análise de log", startedAt: day(-60) },
              { id: "l2", role: "mentor", other: { id: "m3", preferredName: "Larissa" }, competency: null, startedAt: day(-20) },
            ]}
          />
          <MentorshipSection canWrite={false} member={{ id: "m1", preferredName: "Henrique" }} people={[]} competencies={[]} mentorships={[]} />
        </div>
      </Specimen>
      <Specimen state="TraitsSection · com histórico" className="w-full">
        <div className="w-full">
          <TraitsSection
            canWrite
            member={{ id: "m1", preferredName: "Henrique" }}
            traits={[
              { id: "t1", kind: "STRENGTH", text: "Conhece bem o histórico do cliente Mercantil.", observedAt: day(-150), isActive: true },
              { id: "t2", kind: "DEVELOPMENT", text: "Encerra chamado sem causa identificada.", observedAt: day(-160), isActive: true },
              { id: "t3", kind: "DEVELOPMENT", text: "Demorava a pedir ajuda em chamado travado.", observedAt: day(-300), isActive: false },
            ]}
          />
        </div>
      </Specimen>
    </div>
  )
}
