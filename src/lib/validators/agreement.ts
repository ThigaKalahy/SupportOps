import { z } from "zod"

import { labels } from "../labels.ts"

import { optionalText, upcomingDisplayDate } from "./fields.ts"

/**
 * Criação rápida de combinado. Obrigatórios: título, responsável e prazo;
 * o resto fica atrás de "mais detalhes". O prazo vira dueDate E
 * originalDueDate, que nunca mais muda (D17).
 */

const v = labels.validation

export const AGREEMENT_ORIGINS = ["DAILY", "ONE_ON_ONE", "FEEDBACK", "MEETING", "INCIDENT", "MANAGER", "OTHER"] as const
export const AGREEMENT_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const

export const createAgreementSchema = z.object({
  memberId: z.string().min(1, v.required),
  title: z.string().trim().min(3, v.tooShort).max(160, v.tooLong),
  dueDate: upcomingDisplayDate,
  description: optionalText(2000),
  priority: z.enum(AGREEMENT_PRIORITIES),
  origin: z.enum(AGREEMENT_ORIGINS),
})

export type CreateAgreementInput = z.infer<typeof createAgreementSchema>

/** Conclusão: resultado em uma linha, opcional mas incentivado. */
export const completeAgreementSchema = z.object({
  id: z.string().min(1),
  outcome: optionalText(300),
})

export type CompleteAgreementInput = z.infer<typeof completeAgreementSchema>
