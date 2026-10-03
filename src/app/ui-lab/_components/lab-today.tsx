"use client"

import { AlertList } from "@/components/today/alert-list"
import { SegmentedBar } from "@/components/ui/segmented-bar"
import type { Alert } from "@/server/alerts"

import { Specimen } from "./specimen"

/** Hoje: barra de composição, a lista "Precisa de você" com todos os tipos de alerta, e o vazio honesto. */

const person = (id: string, preferredName: string) => ({ id, preferredName, fullName: `${preferredName} Teste` })
const link = (label: string) => ({ kind: "link" as const, label, href: "#" })

const ALERTS: Alert[] = [
  { id: "1", kind: "overdue", severity: "overdue", strong: false, member: person("p", "Priscila"), text: "Combinado vencido: “Abrir a garantia dos 2 notebooks”", age: "vencido há 47 dias", ageDays: 47, action: link("Abrir combinado"), nav: "agreements", informative: false },
  { id: "2", kind: "dailyMissing", severity: "overdue", strong: true, member: null, text: "Nenhuma daily nos últimos 4 dias úteis", age: "há 6 dias", ageDays: 4, action: link("Registrar daily"), nav: "dailies", informative: false },
  { id: "3", kind: "lateOneOnOne", severity: "attention", strong: true, member: person("b", "Beatriz"), text: "Sem 1:1 além da referência de Júnior (21 dias)", age: "há 33 dias", ageDays: 33, action: { kind: "oneOnOne", label: "Registrar 1:1", memberId: "b" }, nav: "records", informative: false },
  { id: "4", kind: "stalePlan", severity: "attention", strong: true, member: person("h", "Henrique"), text: "PDI sem acompanhamento: “Diagnosticar com evidência os chamados de lentidão”", age: "há 85 dias", ageDays: 85, action: link("Acompanhar PDI"), nav: "development", informative: false },
  { id: "5", kind: "silence", severity: "attention", strong: false, member: person("o", "Otávio"), text: "Nenhum registro de qualquer tipo: 1:1, feedback, anotação ou combinado", age: "há 34 dias", ageDays: 34, action: { kind: "oneOnOne", label: "Registrar 1:1", memberId: "o" }, nav: "records", informative: false },
  { id: "6", kind: "feedbackFollowUp", severity: "attention", strong: true, member: person("d", "Diego"), text: "Follow-up de feedback sem conversa depois: “Mandou o relatório com dados errados”", age: "vencido há 2 dias", ageDays: 2, action: { kind: "feedback", label: "Dar feedback", memberId: "d" }, nav: "records", informative: false },
  { id: "7", kind: "adherenceDrop", severity: "attention", strong: true, member: person("h", "Henrique"), text: "Cumprimento no prazo caiu de 83% para 50% (6 e 6 combinados: 30 dias anteriores e últimos 30)", age: "últimos 30 dias", ageDays: 0, action: link("Ver cumprimento"), nav: "agreements", informative: false },
  { id: "8", kind: "chronic", severity: "attention", strong: true, member: person("d", "Diego"), text: "Combinado reagendado 4x, ainda em aberto: “Validar o retorno da API de notas”", age: "Vence em 2 dias", ageDays: 0, action: link("Abrir combinado"), nav: "agreements", informative: false },
  { id: "9", kind: "dueSoon", severity: "attention", strong: false, member: person("v", "Vinícius"), text: "2 combinados vencem nos próximos 3 dias", age: "Vence em 3 dias", ageDays: 0, action: link("Ver combinados"), nav: "agreements", informative: false },
  { id: "10", kind: "readiness", severity: "neutral", strong: false, member: person("r", "Rafael"), text: "Atende ao nível esperado de Sênior em todas as 10 competências", age: "informativo", ageDays: 0, action: link("Ver desenvolvimento"), nav: "development", informative: true },
]

export function LabToday() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="SegmentedBar · composição do time · um segmento · vazio" className="w-full">
        <div className="grid w-full gap-6 md:grid-cols-3">
          <SegmentedBar
            label="9 pessoas: 1 Sênior, 4 Pleno, 4 Júnior"
            segments={[
              { id: "s", label: "Sênior", value: 1 },
              { id: "p", label: "Pleno", value: 4 },
              { id: "j", label: "Júnior", value: 4 },
            ]}
          />
          <SegmentedBar label="3 pessoas: 3 Pleno" segments={[{ id: "p", label: "Pleno", value: 3 }]} />
          <SegmentedBar label="0 pessoas" segments={[]} />
        </div>
      </Specimen>
      <Specimen state="AlertList · todos os tipos, do mais urgente ao informativo (gestor)" className="w-full">
        <div className="flex w-full flex-col gap-3">
          <AlertList alerts={ALERTS} canWrite hasTeam />
        </div>
      </Specimen>
      <Specimen state="AlertList · vazio honesto · leitura (sem ações de formulário)" className="w-full">
        <div className="grid w-full gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <AlertList alerts={[]} canWrite hasTeam />
          </div>
          <div className="flex flex-col gap-3">
            <AlertList alerts={ALERTS.slice(2, 5)} canWrite={false} hasTeam />
          </div>
        </div>
      </Specimen>
    </div>
  )
}
