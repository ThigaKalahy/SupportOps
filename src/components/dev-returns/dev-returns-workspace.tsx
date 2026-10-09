"use client"

import * as React from "react"

import type { DevReturnFormData, DevReturnRow } from "@/server/queries/dev-returns"

import { DevReturnForm } from "./dev-return-form"
import { DevReturnsTable } from "./dev-returns-table"

/**
 * /dev-returns no cliente: o formulário fixo no topo, o resumo (renderizado
 * no servidor) e a tabela. "Editar" numa linha carrega o registro no próprio
 * formulário do topo — mesmo padrão de /priority-validations.
 */
export function DevReturnsWorkspace({
  form,
  rows,
  canWrite,
  empty,
  summary,
  periodEmpty,
  after,
  watching,
  showCentral = true,
}: {
  /** Módulo de centrais ligado no time (D32): sem ele, a coluna não existe. */
  showCentral?: boolean
  form: DevReturnFormData | null
  rows: DevReturnRow[]
  canWrite: boolean
  empty: { title: string; direction: string }
  summary: React.ReactNode
  /** Nenhuma devolução no período (o resumo mostra o estado vazio). */
  periodEmpty: boolean
  /** Conteúdo abaixo da tabela (interseção com a validação). */
  after?: React.ReactNode
  /** P21: observação ativa por devolução. */
  watching?: Record<string, { id: string; heat: "HIGH" | "MEDIUM" | "LOW" }>
}) {
  const [editing, setEditing] = React.useState<DevReturnRow | null>(null)

  return (
    <div className="flex flex-col gap-6">
      {form ? (
        <div className="z-10 border-b border-line bg-canvas pb-3 lg:sticky lg:top-12 lg:-mx-6 lg:px-6 lg:pt-3">
          <DevReturnForm data={form} editing={editing} onDoneEditing={() => setEditing(null)} />
        </div>
      ) : null}
      {summary}
      {!periodEmpty ? (
        <DevReturnsTable
          rows={rows}
          canWrite={canWrite}
          empty={empty}
          watching={watching}
          showCentral={showCentral}
          onEdit={(row) => {
            setEditing(row)
            window.scrollTo({ top: 0 })
          }}
        />
      ) : null}
      {after}
    </div>
  )
}
