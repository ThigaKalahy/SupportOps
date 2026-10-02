import { z } from "zod"

import { labels } from "../labels.ts"
import { computeOutcome } from "../priority-validation.ts"

/**
 * Validação de prioridade de um chamado. O MESMO schema valida o formulário
 * de /priority-validations e a Server Action. Como o resultado depende dos
 * ranks e o "Outro" depende do motivo, o schema recebe os catálogos.
 *
 * - "Devolver" (returned) dispensa a prioridade validada; resultado RETURNED.
 * - Resultado diferente de Mantida exige motivo; motivo que exige detalhe
 *   ("Outro") exige o texto. O banco confere as duas coisas de novo.
 */

const v = labels.validation
const P = labels.priorityValidations.validation

export interface ValidationCatalog {
  levels: { id: string; rank: number }[]
  reasons: { id: string; requiresDetail: boolean }[]
}

export const priorityValidationFields = {
  id: z.string().optional(),
  ticketUrl: z.string().trim().min(1, v.required).max(2000, v.tooLong),
  ticketRef: z.string().trim().min(1, P.ticketRefRequired).max(64, v.tooLong),
  memberId: z.string().min(1, v.required),
  analystPriorityId: z.string().min(1, v.required),
  supervisorPriorityId: z.string(),
  returned: z.boolean(),
  reasonId: z.string(),
  reasonOther: z.string().trim().max(300, v.tooLong),
  note: z.string().trim().max(300, v.tooLong),
}

export function priorityValidationSchema(catalog: ValidationCatalog) {
  const rankOf = (id: string) => catalog.levels.find((l) => l.id === id)?.rank ?? null
  return z.object(priorityValidationFields).superRefine((data, ctx) => {
    const analystRank = rankOf(data.analystPriorityId)
    if (data.analystPriorityId && analystRank === null) {
      ctx.addIssue({ code: "custom", path: ["analystPriorityId"], message: v.required })
    }
    const supervisorRank = rankOf(data.supervisorPriorityId)
    if (!data.returned && supervisorRank === null) {
      ctx.addIssue({ code: "custom", path: ["supervisorPriorityId"], message: v.required })
    }
    const outcome = computeOutcome({ analystRank, supervisorRank, returned: data.returned })
    if (outcome === null || outcome === "MAINTAINED") return
    const reason = catalog.reasons.find((r) => r.id === data.reasonId)
    if (!reason) {
      ctx.addIssue({ code: "custom", path: ["reasonId"], message: P.reasonRequired })
      return
    }
    if (reason.requiresDetail && data.reasonOther.length < 3) {
      ctx.addIssue({ code: "custom", path: ["reasonOther"], message: P.reasonOtherRequired })
    }
  })
}

export type PriorityValidationInput = z.infer<z.ZodObject<typeof priorityValidationFields>>
