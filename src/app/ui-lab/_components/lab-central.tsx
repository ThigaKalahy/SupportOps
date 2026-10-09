"use client"

import * as React from "react"

import { CentralCombobox, type CentralOption } from "@/components/ui/CentralCombobox"
import { FieldGroup } from "@/components/ui/field-group"
import { centralSlug, cleanCentralName } from "@/lib/centrals"
import { labels } from "@/lib/labels"
import type { EnsureCentralResult } from "@/server/centrals"

import { Specimen } from "./specimen"

const S = labels.uiLab.states

const OPTIONS: CentralOption[] = [
  { id: "c1", name: "Central Alfa" },
  { id: "c2", name: "Central Beta" },
  { id: "c3", name: "Central São Paulo" },
]

/** Criação simulada: mesma regra de slug do servidor, sem tocar no banco. */
async function fakeCreate({ name }: { name: string }): Promise<EnsureCentralResult> {
  const clean = cleanCentralName(name)
  const existing = OPTIONS.find((o) => centralSlug(o.name) === centralSlug(clean))
  if (existing) return { ok: true, id: existing.id, name: existing.name, existed: true }
  return { ok: true, id: `lab-${centralSlug(clean)}`, name: clean, existed: false }
}

function Field({ initial = null, state, invalid = false }: { initial?: string | null; state: string; invalid?: boolean }) {
  const [value, setValue] = React.useState<string | null>(initial)
  return (
    <Specimen state={state} className="w-64">
      <FieldGroup label={labels.centrals.field} error={invalid ? labels.validation.generic : undefined} className="w-full">
        {(control) => <CentralCombobox {...control} options={OPTIONS} value={value} onValueChange={setValue} createCentral={fakeCreate} />}
      </FieldGroup>
    </Specimen>
  )
}

/** CentralCombobox nos estados: vazio, selecionado, só leitura de criação e com erro. */
export function LabCentral() {
  return (
    <div className="flex flex-wrap gap-6">
      <Field state={S.empty} />
      <Field state={S.selected} initial="c1" />
      <Field state={S.error} invalid />
      <Specimen state={S.disabled} className="w-64">
        <CentralCombobox aria-label={labels.centrals.field} options={OPTIONS} value={null} onValueChange={() => {}} disabled />
      </Specimen>
      <Specimen state={S.compact} className="w-40">
        <CentralCombobox aria-label={labels.centrals.field} options={OPTIONS} value="c2" onValueChange={() => {}} inputClassName="h-8" />
      </Specimen>
    </div>
  )
}
