"use client"

import * as React from "react"

import { CopyWhatsAppButton } from "@/components/dailies/copy-whatsapp-button"
import { DownloadDailyPdfButton } from "@/components/dailies/download-pdf-button"
import { ReviewRow, type ReviewState } from "@/components/dailies/review-row"
import { formatDate, todayBusinessDate } from "@/lib/dates"
import { deadlineSeverity } from "@/lib/severity"
import type { ReviewItem } from "@/server/queries/dailies"

import { Specimen } from "./specimen"

/** Linha de revisão da daily em todos os estados, e o botão de copiar para WhatsApp. */

function day(offset: number): Date {
  const d = todayBusinessDate()
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

const next = formatDate(todayBusinessDate(), "business")
const reasons = [
  { id: "r1", label: "Dependência de terceiro" },
  { id: "r2", label: "Aguardando cliente" },
]

function item(id: string, title: string, dueOffset: number, reschedules: number, fromPreviousDaily = false, centralName: string | null = null): ReviewItem {
  return { id, title, dueDate: day(dueOffset), reschedules, fromPreviousDaily, centralName, centralId: null, why: null, watch: null, reviewed: null, deadline: deadlineSeverity(day(dueOffset)) }
}

const ITEMS: { item: ReviewItem; state: ReviewState; errors?: Record<string, string> }[] = [
  {
    item: item("l1", "Documentar o fluxo de escalonamento", 0, 0, true),
    state: { outcome: null, blockerText: "", blockerReasonId: "", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next, nextOpen: false, nextTitle: "", nextNote: "", nextDueDate: next },
  },
  {
    item: item("l2", "Validar com o fornecedor do ERP o retorno da API", -3, 4, false, "Central Alfa"),
    state: { outcome: "NOT_DONE", blockerText: "", blockerReasonId: "r1", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next, nextOpen: false, nextTitle: "", nextNote: "", nextDueDate: next },
    errors: { blockerText: "Descreva o impeditivo." },
  },
  {
    item: { ...item("l3", "Revisar os chamados reabertos de setembro", -1, 1), why: "Cliente reclamou de reaberturas no NPS", watch: { id: "lab-watch", title: "NPS da Central Alfa" } },
    state: { outcome: "PARTIAL", blockerText: "Metade revisada; faltam os da fila N2", blockerReasonId: "", action: "replace", newDueDate: next, replacementTitle: "Revisar os reabertos da fila N2", replacementDueDate: next, nextOpen: false, nextTitle: "", nextNote: "", nextDueDate: next },
  },
  {
    item: item("l4", "Finalizar o tutorial de instalação", 0, 0, true),
    state: { outcome: "DONE", blockerText: "", blockerReasonId: "", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next, nextOpen: true, nextTitle: "Cobrar o retorno do cliente sobre o tutorial", nextNote: "Tutorial pronto; o cliente agora relata erro na instalação offline", nextDueDate: next },
  },
]

export function LabDaily() {
  const [states, setStates] = React.useState(ITEMS.map((i) => i.state))
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="ReviewRow · pendente · não feito com erro · parcial substituindo · feito" className="w-full">
        <ul className="w-full rounded-lg border border-line bg-surface">
          {ITEMS.map((entry, i) => (
            <ReviewRow
              key={entry.item.id}
              item={entry.item}
              state={states[i]!}
              reasons={reasons}
              errors={entry.errors ?? {}}
              groupRef={() => undefined}
              onDone={() => undefined}
              onChange={(patch) => setStates((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)))}
            />
          ))}
        </ul>
      </Specimen>
      <Specimen state="CopyWhatsAppButton · secondary · ghost">
        <CopyWhatsAppButton
          daily={{
            date: todayBusinessDate(),
            reviewed: [{ name: "Camila", title: "Documentar fluxo de escalonamento", outcome: "DONE" }],
            created: [{ name: "Larissa", title: "Finalizar tutorial de instalação", dueDate: day(1) }],
            blockers: [],
          }}
        />
        <CopyWhatsAppButton daily={{ date: todayBusinessDate(), reviewed: [], created: [], blockers: [] }} variant="ghost" />
      </Specimen>
      <Specimen state="DownloadDailyPdfButton · secondary · ghost (aqui, sem daily real, mostra o aviso de falha)">
        <DownloadDailyPdfButton dailyId="ui-lab" />
        <DownloadDailyPdfButton dailyId="ui-lab" variant="ghost" />
      </Specimen>
    </div>
  )
}
