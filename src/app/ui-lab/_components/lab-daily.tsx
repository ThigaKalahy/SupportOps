"use client"

import * as React from "react"

import { CopyWhatsAppButton } from "@/components/dailies/copy-whatsapp-button"
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

function item(id: string, title: string, dueOffset: number, reschedules: number, fromPreviousDaily = false): ReviewItem {
  return { id, title, dueDate: day(dueOffset), reschedules, fromPreviousDaily, deadline: deadlineSeverity(day(dueOffset)) }
}

const ITEMS: { item: ReviewItem; state: ReviewState; errors?: Record<string, string> }[] = [
  {
    item: item("l1", "Documentar o fluxo de escalonamento", 0, 0, true),
    state: { outcome: null, blockerText: "", blockerReasonId: "", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next },
  },
  {
    item: item("l2", "Validar com o fornecedor do ERP o retorno da API", -3, 4),
    state: { outcome: "NOT_DONE", blockerText: "", blockerReasonId: "r1", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next },
    errors: { blockerText: "Descreva o impeditivo." },
  },
  {
    item: item("l3", "Revisar os chamados reabertos de setembro", -1, 1),
    state: { outcome: "PARTIAL", blockerText: "Metade revisada; faltam os da fila N2", blockerReasonId: "", action: "replace", newDueDate: next, replacementTitle: "Revisar os reabertos da fila N2", replacementDueDate: next },
  },
  {
    item: item("l4", "Finalizar o tutorial de instalação", 0, 0, true),
    state: { outcome: "DONE", blockerText: "", blockerReasonId: "", action: "reschedule", newDueDate: next, replacementTitle: "", replacementDueDate: next },
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
    </div>
  )
}
