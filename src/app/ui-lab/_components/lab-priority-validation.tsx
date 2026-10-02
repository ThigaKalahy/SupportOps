"use client"

import { ProfileValidationBlock } from "@/components/priority-validations/profile-validation-block"
import { ValidationForm } from "@/components/priority-validations/validation-form"
import { StatusPill } from "@/components/ui/status-pill"
import { enumLabel } from "@/lib/labels"
import { OUTCOME_SEVERITY, VALIDATION_OUTCOMES } from "@/lib/priority-validation"
import type { ValidationFormData } from "@/server/queries/priority-validations"

import { Specimen } from "./specimen"

/** Formulário de validação com catálogo de exemplo, os quatro resultados e o bloco do perfil. */

const DATA: ValidationFormData = {
  members: [
    { id: "m1", preferredName: "Camila" },
    { id: "m2", preferredName: "Diego" },
    { id: "m3", preferredName: "Otávio" },
  ],
  levels: [
    { id: "l4", label: "Crítica", rank: 4 },
    { id: "l3", label: "Alta", rank: 3 },
    { id: "l2", label: "Média", rank: 2 },
    { id: "l1", label: "Baixa", rank: 1 },
  ],
  reasons: [
    { id: "r1", label: "Impacto superestimado", requiresDetail: false },
    { id: "r2", label: "Evidência insuficiente", requiresDetail: false },
    { id: "r8", label: "Outro", requiresDetail: true },
  ],
  patterns: [{ id: "p1", label: "Helpdesk — tickets", regex: "/tickets/(\d+)", captureGroup: 1 }],
}

export function LabPriorityValidation() {
  return (
    <div className="flex w-full flex-col gap-6">
      <Specimen state="ValidationForm · vazio (cole https://helpdesk.exemplo.com.br/a/tickets/48213)" className="w-full">
        <div className="w-full rounded-lg border border-line bg-canvas p-4">
          <ValidationForm data={DATA} editing={null} onDoneEditing={() => undefined} />
        </div>
      </Specimen>
      <Specimen state="Resultado · mantida · elevada · rebaixada · devolvida">
        {VALIDATION_OUTCOMES.map((o) => (
          <StatusPill key={o} severity={OUTCOME_SEVERITY[o]} label={enumLabel("validationOutcome", o)} />
        ))}
      </Specimen>
      <div className="grid w-full gap-8 md:grid-cols-2">
        <Specimen state="Bloco do perfil · com validações" className="max-w-sm">
          <div className="w-full">
            <ProfileValidationBlock
              data={{ days: 90, total: 23, changed: 11, changeRate: 48, topReason: { label: "Impacto superestimado", count: 7 } }}
              member={{ id: "m3", preferredName: "Otávio" }}
              canWrite
              href="/priority-validations"
            />
          </div>
        </Specimen>
        <Specimen state="Bloco do perfil · sem validações · leitura" className="max-w-sm">
          <div className="w-full">
            <ProfileValidationBlock
              data={{ days: 90, total: 0, changed: 0, changeRate: null, topReason: null }}
              member={{ id: "m1", preferredName: "Camila" }}
              canWrite={false}
              href="/priority-validations"
            />
          </div>
        </Specimen>
      </div>
    </div>
  )
}
