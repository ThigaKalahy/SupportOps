"use client"

import * as React from "react"

import type { ValidationFormData, ValidationRow } from "@/server/queries/priority-validations"

import { ValidationForm } from "./validation-form"
import { ValidationsTable } from "./validations-table"

/**
 * /priority-validations no cliente: o formulário fixo no topo, o resumo
 * (renderizado no servidor) e a tabela. "Editar" numa linha carrega o
 * registro no próprio formulário do topo.
 */
export function ValidationsWorkspace({
  form,
  rows,
  showDate,
  canWrite,
  empty,
  summary,
  periodEmpty,
  watching,
  showCentral = true,
}: {
  /** Módulo de centrais ligado no time (D32): sem ele, a coluna não existe. */
  showCentral?: boolean
  form: ValidationFormData | null
  rows: ValidationRow[]
  showDate: boolean
  canWrite: boolean
  empty: { title: string; direction: string }
  summary: React.ReactNode
  /** Nenhuma validação no período (o resumo mostra o estado vazio). */
  periodEmpty: boolean
  /** P21: observação ativa por validação. */
  watching?: Record<string, { id: string; heat: "HIGH" | "MEDIUM" | "LOW" }>
}) {
  const [editing, setEditing] = React.useState<ValidationRow | null>(null)

  return (
    <div className="flex flex-col gap-6">
      {form ? (
        // Sempre visível: gruda abaixo da barra de contexto em telas largas.
        <div className="z-10 border-b border-line bg-canvas pb-3 lg:sticky lg:top-12 lg:-mx-6 lg:px-6 lg:pt-3">
          <ValidationForm data={form} editing={editing} onDoneEditing={() => setEditing(null)} />
        </div>
      ) : null}
      {summary}
      {/* Sem nada no período, o resumo já é o estado vazio; a tabela não se repete. */}
      {!periodEmpty ? (
        <ValidationsTable
          rows={rows}
          showDate={showDate}
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
    </div>
  )
}
