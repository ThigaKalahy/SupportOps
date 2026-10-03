"use client"

import * as React from "react"

import { RecordActions } from "@/components/forms/record-actions"
import { TimelineEvent } from "@/components/timeline/timeline-event"
import { TimelineMonth } from "@/components/timeline/timeline-rail"
import { businessDateAtNoon, todayBusinessDate } from "@/lib/dates"
import type { TimelineItem } from "@/server/queries/timeline"

/**
 * Calha temporal com todos os estados: sem pendência, vencendo (âmbar),
 * atenção forte (laranja), vencido (vermelho), privado com ação de alternar,
 * resumo longo com expansão, combinados vinculados.
 */

function day(offset: number): Date {
  const d = todayBusinessDate()
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

const base: Pick<TimelineItem, "tags" | "author" | "toggleable" | "source" | "agreements" | "summary"> = {
  tags: [],
  author: "Thiago Silva",
  toggleable: false,
  source: null,
  agreements: null,
  summary: null,
}
const none: TimelineItem["marker"] = { severity: "neutral", strong: false, bleed: false, note: null }

const ITEMS: TimelineItem[] = [
  {
    ...base,
    id: "lab-1",
    type: "AGREEMENT",
    occurredAt: businessDateAtNoon(day(-2)),
    title: "Revisar o relatório de reaberturas antes de enviar",
    visibility: "SHARED",
    tags: ["daily"],
    marker: { severity: "attention", strong: false, bleed: true, note: null },
    agreements: {
      kind: "self",
      items: [{ id: "a1", title: "", status: "OPEN", dueDate: day(2), reschedules: 1, pill: { severity: "attention", strong: false, label: "Vence em 2 dias" } }],
    },
  },
  {
    ...base,
    id: "lab-2",
    type: "ONE_ON_ONE",
    occurredAt: businessDateAtNoon(day(-5)),
    title: "Volta das férias e repasse de pendências",
    summary:
      "Chegou mais seguro nos chamados de rede. Pediu para acompanhar um atendimento enterprise antes de assumir sozinho. Combinamos revisar a base de conhecimento de VPN e voltar ao assunto na próxima conversa. Ainda tem dificuldade em dizer não para pedidos fora da fila, e isso atrasa os combinados da semana.\n\nSobre carreira: quer entender o que falta para Pleno. Expliquei a matriz de competências e combinamos olhar juntos a evidência de diagnóstico de rede nas próximas quatro semanas.\n\nPercepção dele: a fila de integração está pesada e falta documentação do ERP.",
    visibility: "PRIVATE",
    toggleable: true,
    marker: { severity: "overdue", strong: false, bleed: true, note: "Revisão marcada para 19/08/2026" },
  },
  {
    ...base,
    id: "lab-3",
    type: "DEVELOPMENT",
    occurredAt: businessDateAtNoon(day(-9)),
    title: "Diagnosticar com evidência os chamados de lentidão",
    summary: "Fecha chamados de lentidão sem coletar log.",
    visibility: "SHARED",
    marker: { severity: "attention", strong: true, bleed: true, note: "PDI sem acompanhamento há 84 dias" },
  },
  {
    ...base,
    id: "lab-4",
    type: "DAILY",
    occurredAt: businessDateAtNoon(day(-12)),
    title: "Aguardando retorno do fornecedor do ERP",
    visibility: "SHARED",
    tags: ["impeditivo"],
    marker: none,
    agreements: {
      kind: "sourced",
      items: [
        { id: "a2", title: "Cobrar o fornecedor do ERP", status: "DONE", dueDate: day(-8), reschedules: 0, pill: { severity: "calm", strong: false, label: "Concluído" } },
        { id: "a3", title: "Atualizar o cliente sobre o prazo", status: "OPEN", dueDate: day(-40), reschedules: 4, pill: { severity: "overdue", strong: false, label: "Provavelmente esquecido" } },
      ],
    },
  },
  {
    ...base,
    id: "lab-5",
    type: "RECOGNITION",
    occurredAt: businessDateAtNoon(day(-15)),
    title: "Assumiu o plantão do fim de semana sem ser pedido",
    summary: "Nenhum chamado crítico ficou sem resposta.",
    visibility: "SHARED",
    toggleable: true,
    tags: ["recognition"],
    marker: none,
  },
]

export function LabTimeline() {
  const [items, setItems] = React.useState(ITEMS)
  const toggle = (item: TimelineItem) =>
    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, visibility: i.visibility === "PRIVATE" ? "SHARED" : "PRIVATE" } : i)),
    )
  return (
    <div className="w-full rounded-lg border border-line bg-canvas px-4 pt-2">
      <TimelineMonth label="out/2026">
        {items.map((item) => (
          <TimelineEvent
            key={item.id}
            item={item}
            showVisibility
            onToggleVisibility={toggle}
            actions={
              item.toggleable ? (
                <RecordActions
                  source={{ kind: "oneOnOne", id: item.id }}
                  member={{ id: "lab", preferredName: "Henrique" }}
                  typeLabel="1:1"
                  dateText="28/09/2026"
                />
              ) : undefined
            }
          />
        ))}
      </TimelineMonth>
    </div>
  )
}
